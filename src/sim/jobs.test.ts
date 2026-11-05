import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { asTick, asTileIndex, asWorkerId, type TileIndex } from "./ids";
import {
  assertJobInvariants,
  completeJob,
  jobAtTile,
  jobHeldBy,
  listJobs,
  printJobs,
  releaseWorker,
  reserveOpenJob,
} from "./jobs";
import { createWorld, hashWorld, MAP_WIDTH, run, step, tileKindAt, type Command, type World } from "./world";

const EARTH_A = asTileIndex(10 * MAP_WIDTH + 4);
const EARTH_B = asTileIndex(10 * MAP_WIDTH + 5);
const GOLD = asTileIndex(31 * MAP_WIDTH + 38);
const ROCK = asTileIndex(1);

function tag(tick: number, tile: TileIndex): Command {
  return { kind: "tag", tick: asTick(tick), tile };
}

function untag(tick: number, tile: TileIndex): Command {
  return { kind: "untag", tick: asTick(tick), tile };
}

function applyNow(world: World, command: Command): void {
  world.commandCursor = 0;
  step(world, [command]);
}

describe("job board", () => {
  it("prints jobs created by a tag sweep", () => {
    const commands: Command[] = [];
    for (let x = 0; x <= 5; x += 1) {
      commands.push(tag(0, asTileIndex(10 * MAP_WIDTH + x)));
    }
    commands.push(tag(0, GOLD));
    const world = run(1, commands, 1);
    expect(printJobs(world.jobs)).toMatchSnapshot();
    expect(listJobs(world.jobs).length).toBe(5);
  });

  it("creates a dig job on tag and cancels it on untag", () => {
    const tagged = run(1, [tag(0, EARTH_A)], 1);
    const job = jobAtTile(tagged.jobs, EARTH_A);
    expect(job?.jobKind).toBe("dig");
    expect(job?.lifecycle.kind).toBe("open");
    const cleared = run(1, [tag(0, EARTH_A), untag(1, EARTH_A)], 2);
    expect(jobAtTile(cleared.jobs, EARTH_A)).toBeUndefined();
    expect(tileKindAt(cleared.tiles, EARTH_A)).toBe("earth");
  });

  it("reserves the highest-priority open job and one job per worker", () => {
    const world = run(1, [tag(0, GOLD), tag(0, EARTH_A), tag(0, EARTH_B)], 1);
    const w0 = asWorkerId(0);
    const w1 = asWorkerId(1);
    const first = reserveOpenJob(world.jobs, w0);
    expect(first?.jobKind).toBe("dig");
    expect(first?.tile).toBe(EARTH_A);
    expect(reserveOpenJob(world.jobs, w0)).toBeUndefined();
    const second = reserveOpenJob(world.jobs, w1);
    expect(second?.jobKind).toBe("dig");
    expect(second?.tile).toBe(EARTH_B);
    const third = reserveOpenJob(world.jobs, asWorkerId(2));
    expect(third?.jobKind).toBe("mineGold");
    expect(jobHeldBy(world.jobs, w0)?.id).toBe(first?.id);
    releaseWorker(world.jobs, w0);
    expect(jobAtTile(world.jobs, EARTH_A)?.lifecycle.kind).toBe("open");
    expect(jobHeldBy(world.jobs, w0)).toBeUndefined();
  });

  it("untag cancels a reserved job", () => {
    const world = run(1, [tag(0, EARTH_A)], 1);
    const w0 = asWorkerId(0);
    reserveOpenJob(world.jobs, w0);
    const after = run(1, [tag(0, EARTH_A), untag(1, EARTH_A)], 2);
    expect(jobAtTile(after.jobs, EARTH_A)).toBeUndefined();
  });

  it("reserves only dig jobs when a kind filter is given", () => {
    const world = run(1, [tag(0, GOLD), tag(0, EARTH_A)], 1);
    const reserved = reserveOpenJob(world.jobs, asWorkerId(0), "dig");
    expect(reserved?.jobKind).toBe("dig");
    expect(reserved?.tile).toBe(EARTH_A);
    expect(jobAtTile(world.jobs, GOLD)?.lifecycle.kind).toBe("open");
  });

  it("rock tag creates no job", () => {
    const world = run(1, [tag(0, ROCK)], 1);
    expect(listJobs(world.jobs).length).toBe(0);
  });

  it("jobs are part of the world hash", () => {
    const tagged = run(1, [tag(0, EARTH_A)], 4);
    const plain = run(1, [], 4);
    expect(hashWorld(tagged)).not.toBe(hashWorld(plain));
    const again = run(1, [tag(0, EARTH_A)], 4);
    expect(hashWorld(tagged)).toBe(hashWorld(again));
  });

  it("keeps invariants after random tag/untag/reserve/release/complete", () => {
    const tiles = [EARTH_A, EARTH_B, GOLD, ROCK];
    const workers = [asWorkerId(0), asWorkerId(1), asWorkerId(2)];
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(fc.integer({ min: 0, max: 4 }), fc.integer({ min: 0, max: 3 }), fc.integer({ min: 0, max: 2 })),
          { minLength: 1, maxLength: 40 },
        ),
        (ops) => {
          const world = createWorld(1);
          for (let i = 0; i < ops.length; i += 1) {
            const op = ops[i];
            if (op === undefined) {
              continue;
            }
            const [kind, tileIx, workerIx] = op;
            const tile = tiles[tileIx];
            const worker = workers[workerIx];
            if (tile === undefined || worker === undefined) {
              continue;
            }
            switch (kind) {
              case 0:
                applyNow(world, tag(world.tick, tile));
                break;
              case 1:
                applyNow(world, untag(world.tick, tile));
                break;
              case 2:
                reserveOpenJob(world.jobs, worker);
                break;
              case 3:
                releaseWorker(world.jobs, worker);
                break;
              default:
                completeJob(world.jobs, worker);
                break;
            }
            assertJobInvariants(world.jobs);
            assertTaggedJobsMatchTiles(world);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

function assertTaggedJobsMatchTiles(world: World): void {
  const jobs = listJobs(world.jobs);
  const tilesWithJobs = new Set<number>();
  for (let i = 0; i < jobs.length; i += 1) {
    const job = jobs[i];
    if (job === undefined) {
      continue;
    }
    expect(tilesWithJobs.has(job.tile)).toBe(false);
    tilesWithJobs.add(job.tile);
    const kind = tileKindAt(world.tiles, job.tile);
    switch (job.jobKind) {
      case "dig":
        expect(kind).toBe("taggedEarth");
        break;
      case "mineGold":
        expect(kind).toBe("taggedGold");
        break;
      case "carryGold":
      case "claim":
      case "reinforce":
        throw new Error("unexpected job kind");
      default: {
        const never: never = job.jobKind;
        expect(never).toBeUndefined();
      }
    }
  }
}

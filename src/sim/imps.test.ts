import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { asTick, asTileIndex, asWorkerId } from "./ids";
import { liveImpCount, occupyWalkable, STARTING_IMP_COUNT, type Imp } from "./imps";
import { jobAtTile, jobHeldBy, listJobs } from "./jobs";
import {
  createWorld,
  hashWorld,
  MAP_WIDTH,
  openClaimJobsAround,
  run,
  setTile,
  step,
  TILE_KIND,
  tileKindAt,
  type Command,
  type TileKind,
  type World,
} from "./world";

const TICKS = 10_000;

function liveImp(world: ReturnType<typeof createWorld>, index: number): Imp {
  const slot = world.imps.slots[index];
  if (slot === undefined) {
    throw new Error("missing slot");
  }
  switch (slot.kind) {
    case "empty":
      throw new Error("empty slot");
    case "live":
      return slot.imp;
    default: {
      const never: never = slot;
      return never;
    }
  }
}

function formatImpLog(seed: number, ticks: number, impIndex: number): string {
  const world = createWorld(seed);
  const lines: string[] = [];
  lines.push(formatImpLine(0, liveImp(world, impIndex)));
  for (let t = 0; t < ticks; t += 1) {
    step(world, []);
    lines.push(formatImpLine(world.tick, liveImp(world, impIndex)));
  }
  return lines.join("\n");
}

function formatImpLine(tick: number, imp: { tileX: number; tileY: number; state: { kind: string } }): string {
  return `${String(tick).padStart(3, " ")} ${imp.state.kind.padEnd(9, " ")} (${String(imp.tileX)},${String(imp.tileY)})`;
}

function asciiChar(kind: TileKind): string {
  switch (kind) {
    case "earth":
      return ".";
    case "goldSeam":
      return "$";
    case "rock":
      return "#";
    case "dirt":
      return ",";
    case "claimed":
      return "+";
    case "room":
      return "R";
    case "taggedEarth":
      return "*";
    case "taggedGold":
      return "S";
    case "portal":
      return "P";
    default: {
      const never: never = kind;
      return never;
    }
  }
}

function mapRows(world: ReturnType<typeof createWorld>, fromY: number, toY: number): string {
  const rows: string[] = [];
  for (let y = fromY; y <= toY; y += 1) {
    let row = "";
    for (let x = 0; x < world.width; x += 1) {
      row += asciiChar(tileKindAt(world.tiles, y * world.width + x));
    }
    rows.push(row);
  }
  return rows.join("\n");
}

function assertClaimedConnected(world: World): void {
  const start = 32 * MAP_WIDTH + 32;
  if (tileKindAt(world.tiles, start) !== "claimed") {
    throw new Error("heart tile is not claimed");
  }
  const visited = new Uint8Array(world.tiles.length);
  const queue = new Int32Array(world.tiles.length);
  let head = 0;
  let tail = 0;
  queue[tail] = start;
  tail += 1;
  visited[start] = 1;
  while (head < tail) {
    const i = queue[head];
    head += 1;
    if (i === undefined) {
      continue;
    }
    const y = (i / MAP_WIDTH) | 0;
    const x = i - y * MAP_WIDTH;
    const neighbours = [x, y - 1, x + 1, y, x, y + 1, x - 1, y];
    for (let n = 0; n < neighbours.length; n += 2) {
      const nx = neighbours[n];
      const ny = neighbours[n + 1];
      if (nx === undefined || ny === undefined) {
        continue;
      }
      if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height) {
        continue;
      }
      const tile = ny * MAP_WIDTH + nx;
      if (visited[tile] === 1) {
        continue;
      }
      if (tileKindAt(world.tiles, tile) !== "claimed") {
        continue;
      }
      visited[tile] = 1;
      queue[tail] = tile;
      tail += 1;
    }
  }
  for (let i = 0; i < world.tiles.length; i += 1) {
    if (tileKindAt(world.tiles, i) === "claimed" && visited[i] !== 1) {
      throw new Error(`claimed tile ${String(i)} is not connected to the heart`);
    }
  }
}

function earthTilesInRows(): number[] {
  const world = createWorld(1);
  const tiles: number[] = [];
  for (let y = 28; y <= 36; y += 1) {
    for (let x = 2; x < MAP_WIDTH - 2; x += 1) {
      const tile = y * MAP_WIDTH + x;
      if (tileKindAt(world.tiles, tile) === "earth") {
        tiles.push(tile);
      }
    }
  }
  return tiles;
}

const EARTH_TILES_IN_ROWS = earthTilesInRows();

function earthTagCommands(): fc.Arbitrary<Command[]> {
  return fc
    .array(fc.integer({ min: 0, max: EARTH_TILES_IN_ROWS.length - 1 }), { minLength: 0, maxLength: 24 })
    .map((indices) => {
      const commands: Command[] = [];
      for (let i = 0; i < indices.length; i += 1) {
        const index = indices[i];
        if (index === undefined) {
          continue;
        }
        const tile = EARTH_TILES_IN_ROWS[index];
        if (tile === undefined) {
          continue;
        }
        commands.push({ kind: "tag", tick: asTick(0), tile: asTileIndex(tile) });
      }
      return commands;
    });
}

function impHoldingJob(world: ReturnType<typeof createWorld>): Imp | undefined {
  for (let i = 0; i < world.imps.slots.length; i += 1) {
    const slot = world.imps.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live":
        if (jobHeldBy(world.jobs, asWorkerId(slot.imp.id)) !== undefined) {
          return slot.imp;
        }
        break;
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  return undefined;
}

function runUntilHolderState(world: ReturnType<typeof createWorld>, target: "walking" | "working"): Imp {
  for (let t = 0; t < 300; t += 1) {
    const holder = impHoldingJob(world);
    if (holder !== undefined && holder.state.kind === target) {
      return holder;
    }
    step(world, []);
  }
  throw new Error("imp did not reach job state");
}

describe("imps", () => {
  it("spawns at the dungeon heart on claimed floor", () => {
    const world = createWorld(1);
    expect(liveImpCount(world.imps)).toBe(STARTING_IMP_COUNT);
    for (let i = 0; i < STARTING_IMP_COUNT; i += 1) {
      const imp = liveImp(world, i);
      expect(tileKindAt(world.tiles, imp.tileY * world.width + imp.tileX)).toBe("claimed");
      expect(imp.state.kind).toBe("idle");
    }
  });

  it("prints one imp walking a wander path", () => {
    expect(formatImpLog(1, 48, 0)).toMatchSnapshot();
  });

  it("never stands on non-walkable tiles over 10000 ticks", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), (seed) => {
        const world = createWorld(seed);
        for (let t = 0; t < TICKS; t += 1) {
          step(world, []);
          for (let i = 0; i < world.imps.slots.length; i += 1) {
            const slot = world.imps.slots[i];
            if (slot === undefined) {
              continue;
            }
            switch (slot.kind) {
              case "empty":
                break;
              case "live": {
                const imp = slot.imp;
                if (!occupyWalkable(imp, world.tiles, world.width)) {
                  throw new Error(`imp ${String(imp.id)} on non-walkable tile at tick ${String(world.tick)}`);
                }
                const kind = tileKindAt(world.tiles, imp.tileY * world.width + imp.tileX);
                if (kind === "earth" || kind === "rock" || kind === "goldSeam" || kind === "taggedEarth" || kind === "taggedGold") {
                  throw new Error(`imp ${String(imp.id)} stood on ${kind}`);
                }
                break;
              }
              default: {
                const never: never = slot;
                return never;
              }
            }
          }
        }
      }),
      { numRuns: 5 },
    );
  }, 20_000);

  it("keeps determinism with wandering imps", () => {
    const a = hashWorld(run(7, [], TICKS));
    const b = hashWorld(run(7, [], TICKS));
    expect(a).toBe(b);
    expect(a).not.toBe(hashWorld(run(8, [], TICKS)));
  });

  it("digs a tagged corridor into dirt", () => {
    const commands: Command[] = [];
    for (let x = 35; x <= 37; x += 1) {
      commands.push({ kind: "tag", tick: asTick(0), tile: asTileIndex(32 * MAP_WIDTH + x) });
    }
    const world = run(1, commands, 1);
    for (let t = 0; t < 600; t += 1) {
      let tagged = false;
      for (let x = 35; x <= 37; x += 1) {
        if (tileKindAt(world.tiles, 32 * MAP_WIDTH + x) === "taggedEarth") {
          tagged = true;
        }
      }
      if (!tagged) {
        break;
      }
      step(world, []);
    }
    expect(mapRows(world, 28, 36)).toMatchSnapshot();
    for (let x = 35; x <= 37; x += 1) {
      const kind = tileKindAt(world.tiles, 32 * MAP_WIDTH + x);
      expect(kind === "dirt" || kind === "claimed").toBe(true);
    }
  });

  it("skips dig jobs with no walkable neighbour", () => {
    const commands: Command[] = [];
    for (let x = 25; x <= 29; x += 1) {
      commands.push({ kind: "tag", tick: asTick(0), tile: asTileIndex(32 * MAP_WIDTH + x) });
    }
    const world = run(1, commands, 1500);
    for (let x = 25; x <= 29; x += 1) {
      const kind = tileKindAt(world.tiles, 32 * MAP_WIDTH + x);
      expect(kind === "dirt" || kind === "claimed").toBe(true);
    }
  });

  it("keeps every claimed tile connected to the heart after random tagging", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), earthTagCommands(), (seed, commands) => {
        const world = run(seed, commands, 1500);
        assertClaimedConnected(world);
      }),
      { numRuns: 50 },
    );
  }, 30_000);

  it("claims a dug corridor from the heart outward", () => {
    const commands: Command[] = [];
    for (let x = 25; x <= 29; x += 1) {
      commands.push({ kind: "tag", tick: asTick(0), tile: asTileIndex(32 * MAP_WIDTH + x) });
    }
    const world = run(1, commands, 2500);
    expect(mapRows(world, 28, 36)).toMatchSnapshot();
    for (let x = 25; x <= 29; x += 1) {
      expect(tileKindAt(world.tiles, 32 * MAP_WIDTH + x)).toBe("claimed");
    }
  });

  it("opens claim jobs only on dirt next to claimed floor", () => {
    const world = createWorld(1);
    const adjacent = asTileIndex(32 * MAP_WIDTH + 29);
    setTile(world, adjacent, TILE_KIND.dirt);
    openClaimJobsAround(world, adjacent);
    expect(jobAtTile(world.jobs, adjacent)?.jobKind).toBe("claim");
    const isolated = asTileIndex(32 * MAP_WIDTH + 20);
    setTile(world, isolated, TILE_KIND.dirt);
    openClaimJobsAround(world, isolated);
    expect(jobAtTile(world.jobs, isolated)).toBeUndefined();
    const jobs = listJobs(world.jobs);
    for (let i = 0; i < jobs.length; i += 1) {
      const job = jobs[i];
      if (job === undefined || job.jobKind !== "claim") {
        continue;
      }
      expect(tileKindAt(world.tiles, job.tile)).toBe("dirt");
    }
  });

  it("untagging a walking job returns the imp to idle and leaves earth", () => {
    const tile = asTileIndex(32 * MAP_WIDTH + 35);
    const world = run(1, [{ kind: "tag", tick: asTick(0), tile }], 1);
    const holder = runUntilHolderState(world, "walking");
    world.commandCursor = 0;
    step(world, [{ kind: "untag", tick: asTick(world.tick), tile }]);
    expect(jobAtTile(world.jobs, tile)).toBeUndefined();
    expect(tileKindAt(world.tiles, tile)).toBe("earth");
    expect(holder.state.kind).toBe("idle");
    for (let t = 0; t < 60; t += 1) {
      step(world, []);
    }
    expect(tileKindAt(world.tiles, tile)).toBe("earth");
  });

  it("untagging a working job returns the imp to idle and leaves earth", () => {
    const tile = asTileIndex(32 * MAP_WIDTH + 35);
    const world = run(1, [{ kind: "tag", tick: asTick(0), tile }], 1);
    const holder = runUntilHolderState(world, "working");
    world.commandCursor = 0;
    step(world, [{ kind: "untag", tick: asTick(world.tick), tile }]);
    expect(jobAtTile(world.jobs, tile)).toBeUndefined();
    expect(tileKindAt(world.tiles, tile)).toBe("earth");
    expect(holder.state.kind).toBe("idle");
    for (let t = 0; t < 60; t += 1) {
      step(world, []);
    }
    expect(tileKindAt(world.tiles, tile)).toBe("earth");
  });
});

describe("walkable kinds", () => {
  it("treats claimed dirt and room as walkable", () => {
    expect(TILE_KIND.claimed).toBe(4);
    expect(TILE_KIND.dirt).toBe(3);
    expect(TILE_KIND.room).toBe(5);
  });
});

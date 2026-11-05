import { describe, expect, it } from "vitest";
import { asTick, asTileIndex, type TileIndex } from "./ids";
import {
  CLAIM_TICKS,
  DIG_TICKS,
  jobBoostedByWorkshop,
  WORKSHOP_CLAIM_TICKS,
  WORKSHOP_DIG_TICKS,
  type Imp,
} from "./imps";
import {
  createWorld,
  hashWorld,
  MAP_WIDTH,
  openClaimJobsAround,
  ROOM_KIND,
  run,
  setTile,
  sortCommands,
  step,
  TILE_KIND,
  tileKindAt,
  TREASURY_COST,
  WORKSHOP_COST,
  workshopTileCount,
  type Command,
  type World,
} from "./world";

const HEART_TILE = asTileIndex(32 * MAP_WIDTH + 32);
const EARTH_TILE = asTileIndex(10 * MAP_WIDTH + 4);
const WORKSHOP_TILE = asTileIndex(31 * MAP_WIDTH + 30);
const ADJACENT_DIG = asTileIndex(31 * MAP_WIDTH + 29);
const ADJACENT_CLAIM = asTileIndex(30 * MAP_WIDTH + 29);
const FAR_DIG = asTileIndex(32 * MAP_WIDTH + 35);
const FAR_CLAIM = asTileIndex(32 * MAP_WIDTH + 35);

function addGold(tick: number, amount: number): Command {
  return { kind: "addGold", tick: asTick(tick), amount };
}

function paint(tick: number, tile: TileIndex, room: "treasury" | "workshop"): Command {
  return { kind: "paintRoom", tick: asTick(tick), tile, room };
}

function tag(tick: number, tile: TileIndex): Command {
  return { kind: "tag", tick: asTick(tick), tile };
}

function liveImps(world: World): Imp[] {
  const result: Imp[] = [];
  for (let i = 0; i < world.imps.slots.length; i += 1) {
    const slot = world.imps.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live":
        result.push(slot.imp);
        break;
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  return result;
}

function workingImpOn(world: World, tile: TileIndex): Imp | undefined {
  for (const imp of liveImps(world)) {
    if (imp.state.kind === "working" && imp.state.tile === tile) {
      return imp;
    }
  }
  return undefined;
}

function waitForWork(world: World, tile: TileIndex): Imp {
  for (let t = 0; t < 400; t += 1) {
    step(world, sortCommands([]));
    const imp = workingImpOn(world, tile);
    if (imp !== undefined) {
      return imp;
    }
  }
  throw new Error("imp never started the job");
}

function ticksUntilTileChanges(world: World, tile: TileIndex, maxTicks: number): number {
  const before = tileKindAt(world.tiles, tile);
  const start = world.tick;
  for (let t = 0; t < maxTicks; t += 1) {
    step(world, sortCommands([]));
    if (tileKindAt(world.tiles, tile) !== before) {
      return world.tick - start;
    }
  }
  throw new Error("job never finished");
}

describe("workshop room", () => {
  it("refuses paintRoom workshop on unclaimed floor", () => {
    const world = run(1, sortCommands([addGold(0, 100), paint(1, EARTH_TILE, "workshop")]), 2);
    expect(tileKindAt(world.tiles, EARTH_TILE)).toBe("earth");
    expect(world.rooms[EARTH_TILE]).toBe(ROOM_KIND.none);
    expect(world.goldStored).toBe(100);
    expect(world.goldSpent).toBe(0);
  });

  it("refuses paintRoom workshop without enough gold", () => {
    const world = run(1, sortCommands([paint(0, HEART_TILE, "workshop")]), 1);
    expect(tileKindAt(world.tiles, HEART_TILE)).toBe("claimed");
    expect(world.rooms[HEART_TILE]).toBe(ROOM_KIND.none);
    expect(world.goldStored).toBe(0);
    expect(world.goldSpent).toBe(0);
  });

  it("refuses paintRoom workshop on an already painted tile", () => {
    const world = run(
      1,
      sortCommands([addGold(0, 100), paint(0, HEART_TILE, "treasury"), paint(1, HEART_TILE, "workshop")]),
      2,
    );
    expect(tileKindAt(world.tiles, HEART_TILE)).toBe("room");
    expect(world.rooms[HEART_TILE]).toBe(ROOM_KIND.treasury);
    expect(world.goldStored).toBe(100 - TREASURY_COST);
    expect(world.goldSpent).toBe(TREASURY_COST);
  });

  it("paints a workshop, deducts its cost and records the spend", () => {
    const world = run(1, sortCommands([addGold(0, 100), paint(1, WORKSHOP_TILE, "workshop")]), 2);
    expect(tileKindAt(world.tiles, WORKSHOP_TILE)).toBe("room");
    expect(world.rooms[WORKSHOP_TILE]).toBe(ROOM_KIND.workshop);
    expect(world.goldStored).toBe(100 - WORKSHOP_COST);
    expect(world.goldSpent).toBe(WORKSHOP_COST);
    expect(workshopTileCount(world)).toBe(1);
    expect(hashWorld(world)).not.toBe(hashWorld(run(1, sortCommands([addGold(0, 100)]), 2)));
  });

  it("boosts jobs within Chebyshev distance one of a workshop", () => {
    const world = run(1, sortCommands([addGold(0, 100), paint(0, WORKSHOP_TILE, "workshop")]), 1);
    expect(jobBoostedByWorkshop(world, WORKSHOP_TILE)).toBe(true);
    expect(jobBoostedByWorkshop(world, asTileIndex(31 * MAP_WIDTH + 29))).toBe(true);
    expect(jobBoostedByWorkshop(world, asTileIndex(32 * MAP_WIDTH + 31))).toBe(true);
    expect(jobBoostedByWorkshop(world, asTileIndex(31 * MAP_WIDTH + 28))).toBe(false);
    expect(jobBoostedByWorkshop(world, asTileIndex(34 * MAP_WIDTH + 30))).toBe(false);
  });

  it("finishes an adjacent dig in WORKSHOP_DIG_TICKS and a far dig in DIG_TICKS", () => {
    const near = createWorld(1);
    const nearCommands = sortCommands([addGold(0, 1000), paint(0, WORKSHOP_TILE, "workshop"), tag(0, ADJACENT_DIG)]);
    step(near, nearCommands);
    const nearImp = waitForWork(near, ADJACENT_DIG);
    if (nearImp.state.kind !== "working") {
      throw new Error("near imp is not working");
    }
    expect(nearImp.state.remaining).toBe(WORKSHOP_DIG_TICKS);
    expect(ticksUntilTileChanges(near, ADJACENT_DIG, 100)).toBe(WORKSHOP_DIG_TICKS);

    const far = createWorld(1);
    const farCommands = sortCommands([tag(0, FAR_DIG)]);
    step(far, farCommands);
    const farImp = waitForWork(far, FAR_DIG);
    if (farImp.state.kind !== "working") {
      throw new Error("far imp is not working");
    }
    expect(farImp.state.remaining).toBe(DIG_TICKS);
    expect(ticksUntilTileChanges(far, FAR_DIG, 100)).toBe(DIG_TICKS);
  });

  it("finishes an adjacent claim in WORKSHOP_CLAIM_TICKS and a far claim in CLAIM_TICKS", () => {
    const near = createWorld(1);
    const nearCommands = sortCommands([addGold(0, 1000), paint(0, WORKSHOP_TILE, "workshop")]);
    step(near, nearCommands);
    setTile(near, ADJACENT_CLAIM, TILE_KIND.dirt);
    openClaimJobsAround(near, ADJACENT_CLAIM);
    const nearImp = waitForWork(near, ADJACENT_CLAIM);
    if (nearImp.state.kind !== "working") {
      throw new Error("near claim imp is not working");
    }
    expect(nearImp.state.remaining).toBe(WORKSHOP_CLAIM_TICKS);
    expect(ticksUntilTileChanges(near, ADJACENT_CLAIM, 100)).toBe(WORKSHOP_CLAIM_TICKS);

    const far = createWorld(1);
    setTile(far, FAR_CLAIM, TILE_KIND.dirt);
    openClaimJobsAround(far, FAR_CLAIM);
    const farImp = waitForWork(far, FAR_CLAIM);
    if (farImp.state.kind !== "working") {
      throw new Error("far claim imp is not working");
    }
    expect(farImp.state.remaining).toBe(CLAIM_TICKS);
    expect(ticksUntilTileChanges(far, FAR_CLAIM, 100)).toBe(CLAIM_TICKS);
  });

  it("is deterministic after 10000 ticks with workshop paint", () => {
    const commands: Command[] = [
      addGold(0, 1000),
      paint(1, WORKSHOP_TILE, "workshop"),
      tag(2, ADJACENT_DIG),
      tag(2, asTileIndex(32 * MAP_WIDTH + 38)),
    ];
    const a = hashWorld(run(9, sortCommands(commands), 10000));
    const b = hashWorld(run(9, sortCommands(commands), 10000));
    expect(a).toBe(b);
    expect(a).not.toBe(hashWorld(run(9, sortCommands([addGold(0, 1000)]), 10000)));
  });
});

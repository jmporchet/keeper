import { describe, expect, it } from "vitest";
import {
  CREATURE_MAX_LEVEL,
  LIBRARY_TRAIN_TICKS,
  TRAIN_TICKS,
  trainingBoostedByLibrary,
  type Creature,
} from "./creatures";
import { asTick, asTileIndex, type TileIndex } from "./ids";
import {
  createWorld,
  hashWorld,
  LIBRARY_COST,
  libraryTileCount,
  MAP_WIDTH,
  ROOM_KIND,
  run,
  sortCommands,
  step,
  TREASURY_COST,
  tileKindAt,
  type Command,
  type CommandLog,
  type World,
} from "./world";

const HEART_TILE = asTileIndex(32 * MAP_WIDTH + 32);
const EARTH_TILE = asTileIndex(10 * MAP_WIDTH + 4);
const LAIR_TILE = asTileIndex(30 * MAP_WIDTH + 30);
const LIBRARY_TILE = asTileIndex(30 * MAP_WIDTH + 32);
const TRAINING_TILE = asTileIndex(30 * MAP_WIDTH + 33);

function addGold(tick: number, amount: number): Command {
  return { kind: "addGold", tick: asTick(tick), amount };
}

function paint(tick: number, tile: TileIndex, room: "treasury" | "lair" | "training" | "library"): Command {
  return { kind: "paintRoom", tick: asTick(tick), tile, room };
}

function tag(tick: number, tile: TileIndex): Command {
  return { kind: "tag", tick: asTick(tick), tile };
}

function creatures(world: World): Creature[] {
  const result: Creature[] = [];
  for (let i = 0; i < world.creatures.slots.length; i += 1) {
    const slot = world.creatures.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live":
        result.push(slot.creature);
        break;
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  return result;
}

function measureTraining(world: World, commands: CommandLog): { ticks: number; level: number } {
  let trainingStarted = -1;
  for (let t = 0; t < 900; t += 1) {
    step(world, commands);
    const creature = creatures(world)[0];
    if (creature === undefined) {
      continue;
    }
    if (creature.state.kind === "training" && trainingStarted < 0) {
      trainingStarted = world.tick;
    }
    if (trainingStarted >= 0 && creature.level >= CREATURE_MAX_LEVEL) {
      return { ticks: world.tick - trainingStarted, level: creature.level };
    }
  }
  throw new Error("creature never trained");
}

describe("library room", () => {
  it("refuses paintRoom library on unclaimed floor", () => {
    const world = run(1, sortCommands([addGold(0, 100), paint(1, EARTH_TILE, "library")]), 2);
    expect(tileKindAt(world.tiles, EARTH_TILE)).toBe("earth");
    expect(world.rooms[EARTH_TILE]).toBe(ROOM_KIND.none);
    expect(world.goldStored).toBe(100);
    expect(world.goldSpent).toBe(0);
  });

  it("refuses paintRoom library without enough gold", () => {
    const world = run(1, sortCommands([paint(0, HEART_TILE, "library")]), 1);
    expect(tileKindAt(world.tiles, HEART_TILE)).toBe("claimed");
    expect(world.rooms[HEART_TILE]).toBe(ROOM_KIND.none);
    expect(world.goldStored).toBe(0);
    expect(world.goldSpent).toBe(0);
  });

  it("refuses paintRoom library on an already painted tile", () => {
    const world = run(
      1,
      sortCommands([addGold(0, 100), paint(0, HEART_TILE, "treasury"), paint(1, HEART_TILE, "library")]),
      2,
    );
    expect(tileKindAt(world.tiles, HEART_TILE)).toBe("room");
    expect(world.rooms[HEART_TILE]).toBe(ROOM_KIND.treasury);
    expect(world.goldStored).toBe(100 - TREASURY_COST);
    expect(world.goldSpent).toBe(TREASURY_COST);
  });

  it("paints a library, deducts its cost and records the spend", () => {
    const world = run(1, sortCommands([addGold(0, 100), paint(1, LIBRARY_TILE, "library")]), 2);
    expect(tileKindAt(world.tiles, LIBRARY_TILE)).toBe("room");
    expect(world.rooms[LIBRARY_TILE]).toBe(ROOM_KIND.library);
    expect(world.goldStored).toBe(100 - LIBRARY_COST);
    expect(world.goldSpent).toBe(LIBRARY_COST);
    expect(libraryTileCount(world)).toBe(1);
    expect(hashWorld(world)).not.toBe(hashWorld(run(1, sortCommands([addGold(0, 100)]), 2)));
  });

  it("boosts training within Chebyshev distance one of a library", () => {
    const world = run(1, sortCommands([addGold(0, 100), paint(0, LIBRARY_TILE, "library")]), 1);
    expect(trainingBoostedByLibrary(world, LIBRARY_TILE)).toBe(true);
    expect(trainingBoostedByLibrary(world, TRAINING_TILE)).toBe(true);
    expect(trainingBoostedByLibrary(world, asTileIndex(31 * MAP_WIDTH + 33))).toBe(true);
    expect(trainingBoostedByLibrary(world, asTileIndex(30 * MAP_WIDTH + 34))).toBe(false);
    expect(trainingBoostedByLibrary(world, asTileIndex(33 * MAP_WIDTH + 32))).toBe(false);
  });

  it("trains in LIBRARY_TRAIN_TICKS next to a library and TRAIN_TICKS without one", () => {
    const near = createWorld(1);
    const nearCommands = sortCommands([
      addGold(0, 1000),
      paint(0, LAIR_TILE, "lair"),
      paint(0, TRAINING_TILE, "training"),
      paint(0, LIBRARY_TILE, "library"),
    ]);
    const nearResult = measureTraining(near, nearCommands);
    expect(nearResult.level).toBe(CREATURE_MAX_LEVEL);
    expect(nearResult.ticks).toBe(LIBRARY_TRAIN_TICKS);

    const far = createWorld(1);
    const farCommands = sortCommands([
      addGold(0, 1000),
      paint(0, LAIR_TILE, "lair"),
      paint(0, TRAINING_TILE, "training"),
    ]);
    const farResult = measureTraining(far, farCommands);
    expect(farResult.level).toBe(CREATURE_MAX_LEVEL);
    expect(farResult.ticks).toBe(TRAIN_TICKS);
    expect(nearResult.ticks).toBeLessThan(farResult.ticks);
  });

  it("is deterministic after 10000 ticks with library paint", () => {
    const commands: Command[] = [
      addGold(0, 1000),
      paint(1, LIBRARY_TILE, "library"),
      paint(1, TRAINING_TILE, "training"),
      paint(1, LAIR_TILE, "lair"),
      tag(2, asTileIndex(32 * MAP_WIDTH + 38)),
    ];
    const a = hashWorld(run(9, sortCommands(commands), 10000));
    const b = hashWorld(run(9, sortCommands(commands), 10000));
    expect(a).toBe(b);
    expect(a).not.toBe(hashWorld(run(9, sortCommands([addGold(0, 1000)]), 10000)));
  });
});

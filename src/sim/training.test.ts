import { describe, expect, it } from "vitest";
import {
  WARLOCK_HP,
  freeBedTiles,
  liveCreatureCount,
  TRAIN_TICKS,
  type Creature,
} from "./creatures";
import { asTick, asTileIndex, type TileIndex } from "./ids";
import { CREATURE_WAGE, PAY_TICKS } from "./wages";
import type { Imp } from "./imps";
import {
  createWorld,
  hashWorld,
  LAIR_COST,
  MAP_WIDTH,
  ROOM_KIND,
  run,
  sortCommands,
  step,
  TRAINING_COST,
  TREASURY_COST,
  tileKindAt,
  type Command,
  type World,
} from "./world";

const HEART_TILE = asTileIndex(32 * MAP_WIDTH + 32);
const EARTH_TILE = asTileIndex(10 * MAP_WIDTH + 4);
const LAIR_A = asTileIndex(30 * MAP_WIDTH + 30);
const LAIR_B = asTileIndex(31 * MAP_WIDTH + 30);
const TRAIN_A = asTileIndex(30 * MAP_WIDTH + 33);
const TRAIN_B = asTileIndex(31 * MAP_WIDTH + 33);

function addGold(tick: number, amount: number): Command {
  return { kind: "addGold", tick: asTick(tick), amount };
}

function paint(tick: number, tile: TileIndex, room: "lair" | "treasury" | "training"): Command {
  return { kind: "paintRoom", tick: asTick(tick), tile, room };
}

function tag(tick: number, tile: TileIndex): Command {
  return { kind: "tag", tick: asTick(tick), tile };
}

function totalGold(world: World): number {
  let total = world.goldStored + world.goldSpent + world.goldPaidOut;
  for (let i = 0; i < world.goldStock.length; i += 1) {
    const stock = world.goldStock[i];
    if (stock !== undefined) {
      total += stock;
    }
  }
  for (let i = 0; i < world.treasuryStock.length; i += 1) {
    const stock = world.treasuryStock[i];
    if (stock !== undefined) {
      total += stock;
    }
  }
  for (let i = 0; i < world.imps.slots.length; i += 1) {
    const slot = world.imps.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live": {
        const imp: Imp = slot.imp;
        if (imp.carry.kind === "gold") {
          total += imp.carry.amount;
        }
        break;
      }
      default: {
        const never: never = slot;
        throw never;
      }
    }
  }
  return total;
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

function corridorCommands(): Command[] {
  const commands: Command[] = [];
  for (let x = 35; x <= 39; x += 1) {
    commands.push(tag(0, asTileIndex(32 * MAP_WIDTH + x)));
  }
  return commands;
}

describe("training room", () => {
  it("refuses paintRoom training on unclaimed floor", () => {
    const world = run(1, sortCommands([addGold(0, 100), paint(1, EARTH_TILE, "training")]), 2);
    expect(tileKindAt(world.tiles, EARTH_TILE)).toBe("earth");
    expect(world.rooms[EARTH_TILE]).toBe(ROOM_KIND.none);
    expect(world.goldStored).toBe(100);
    expect(world.goldSpent).toBe(0);
  });

  it("refuses paintRoom training without enough gold", () => {
    const world = run(1, sortCommands([paint(0, HEART_TILE, "training")]), 1);
    expect(tileKindAt(world.tiles, HEART_TILE)).toBe("claimed");
    expect(world.rooms[HEART_TILE]).toBe(ROOM_KIND.none);
    expect(world.goldStored).toBe(0);
    expect(world.goldSpent).toBe(0);
  });

  it("refuses paintRoom training on an already painted tile", () => {
    const world = run(
      1,
      sortCommands([addGold(0, 100), paint(0, HEART_TILE, "treasury"), paint(1, HEART_TILE, "training")]),
      2,
    );
    expect(tileKindAt(world.tiles, HEART_TILE)).toBe("room");
    expect(world.rooms[HEART_TILE]).toBe(ROOM_KIND.treasury);
    expect(world.goldStored).toBe(100 - TREASURY_COST);
    expect(world.goldSpent).toBe(TREASURY_COST);
  });

  it("paints a training room, deducts its cost and records the spend", () => {
    const world = run(1, sortCommands([addGold(0, 100), paint(1, TRAIN_A, "training")]), 2);
    expect(tileKindAt(world.tiles, TRAIN_A)).toBe("room");
    expect(world.rooms[TRAIN_A]).toBe(ROOM_KIND.training);
    expect(world.goldStored).toBe(100 - TRAINING_COST);
    expect(world.goldSpent).toBe(TRAINING_COST);
    expect(hashWorld(world)).not.toBe(hashWorld(run(1, sortCommands([addGold(0, 100)]), 2)));
  });

  it("trains a creature, keeps its bed and sets level one", () => {
    const world = createWorld(1);
    const commands = sortCommands([addGold(0, 1000), paint(0, LAIR_A, "lair"), paint(0, TRAIN_A, "training")]);
    let sawToTraining = false;
    let sawTraining = false;
    let sawLevel = false;
    let bed = LAIR_A;
    let returned = false;
    for (let t = 0; t < 800; t += 1) {
      step(world, commands);
      for (const creature of creatures(world)) {
        bed = creature.bedTile;
        if (creature.state.kind === "toTraining") {
          sawToTraining = true;
        }
        if (creature.state.kind === "training") {
          sawTraining = true;
          expect(freeBedTiles(world)).not.toContain(creature.bedTile);
        }
        if (creature.level >= 1) {
          sawLevel = true;
          if (creature.state.kind === "toBed" || creature.state.kind === "sleeping") {
            returned = true;
          }
        }
      }
      if (returned) {
        break;
      }
    }
    expect(sawToTraining).toBe(true);
    expect(sawTraining).toBe(true);
    expect(sawLevel).toBe(true);
    expect(returned).toBe(true);
    expect(liveCreatureCount(world.creatures)).toBe(1);
    expect(world.rooms[bed]).toBe(ROOM_KIND.lair);
    expect(freeBedTiles(world)).not.toContain(bed);
  });

  it("trains a warlock and returns it to its bed", () => {
    const world = createWorld(1);
    const commands = sortCommands([addGold(0, 1000), paint(0, LAIR_A, "lair"), paint(0, TRAIN_A, "training")]);
    let sawTraining = false;
    let sawLevel = false;
    let returned = false;
    for (let t = 0; t < 800; t += 1) {
      step(world, commands);
      for (const creature of creatures(world)) {
        if (creature.kind !== "warlock") {
          creature.kind = "warlock";
          creature.hp = WARLOCK_HP;
          creature.maxHp = WARLOCK_HP;
        }
        if (creature.state.kind === "training") {
          sawTraining = true;
        }
        if (creature.level >= 1) {
          sawLevel = true;
          if (creature.state.kind === "toBed" || creature.state.kind === "sleeping") {
            returned = true;
          }
        }
      }
      if (returned) {
        break;
      }
    }
    expect(sawTraining).toBe(true);
    expect(sawLevel).toBe(true);
    expect(returned).toBe(true);
    expect(liveCreatureCount(world.creatures)).toBe(1);
  });

  it("finishes training after TRAIN_TICKS and returns the creature to its bed", () => {
    const world = createWorld(1);
    const commands = sortCommands([addGold(0, 1000), paint(0, LAIR_A, "lair"), paint(0, TRAIN_A, "training")]);
    let trainingStarted = -1;
    for (let t = 0; t < 800; t += 1) {
      step(world, commands);
      const creature = creatures(world)[0];
      if (creature === undefined) {
        continue;
      }
      if (creature.state.kind === "training" && trainingStarted < 0) {
        trainingStarted = world.tick;
      }
      if (trainingStarted >= 0 && creature.level >= 1) {
        expect(world.tick - trainingStarted).toBeGreaterThanOrEqual(TRAIN_TICKS);
        expect(creature.state.kind === "toBed" || creature.state.kind === "sleeping").toBe(true);
        return;
      }
    }
    throw new Error("creature never trained");
  });

  it("never lets two creatures share one training tile", () => {
    const world = createWorld(1);
    const commands = sortCommands([
      addGold(0, 2000),
      paint(0, LAIR_A, "lair"),
      paint(0, LAIR_B, "lair"),
      paint(0, TRAIN_A, "training"),
    ]);
    let trained = 0;
    for (let t = 0; t < 1600; t += 1) {
      step(world, commands);
      const used = new Set<number>();
      for (const creature of creatures(world)) {
        const state = creature.state;
        if (state.kind === "toTraining" || state.kind === "training") {
          expect(used.has(state.tile)).toBe(false);
          used.add(state.tile);
        }
        if (creature.level >= 1) {
          trained += 1;
        }
      }
    }
    expect(trained).toBeGreaterThanOrEqual(2);
  });

  it("pays a training creature at payday", () => {
    const world = createWorld(1);
    const commands = sortCommands([
      addGold(0, 1000),
      paint(0, LAIR_A, "lair"),
      paint(PAY_TICKS - 70, TRAIN_A, "training"),
    ]);
    let sawTraining = false;
    while (world.tick < PAY_TICKS) {
      step(world, commands);
      for (const creature of creatures(world)) {
        if (creature.state.kind === "training") {
          sawTraining = true;
        }
      }
    }
    step(world, commands);
    expect(sawTraining).toBe(true);
    expect(liveCreatureCount(world.creatures)).toBe(1);
    expect(world.goldPaidOut).toBe(CREATURE_WAGE);
  });

  it("conserves gold exactly every tick with training rooms", () => {
    const world = createWorld(1);
    const initial = totalGold(world);
    const sorted = sortCommands([
      addGold(0, 500),
      paint(0, LAIR_A, "lair"),
      paint(0, TRAIN_A, "training"),
      paint(0, TRAIN_B, "training"),
    ].concat(corridorCommands()));
    for (let t = 0; t < 2000; t += 1) {
      step(world, sorted);
      expect(totalGold(world)).toBe(initial + 500);
    }
    expect(world.goldSpent).toBe(LAIR_COST + 2 * TRAINING_COST);
  });

  it("is deterministic after 10000 ticks with training paint", () => {
    const commands: Command[] = [
      addGold(0, 1000),
      paint(1, TRAIN_A, "training"),
      paint(1, TRAIN_B, "training"),
      paint(1, LAIR_A, "lair"),
      paint(1, HEART_TILE, "treasury"),
      tag(2, asTileIndex(32 * MAP_WIDTH + 38)),
    ];
    const a = hashWorld(run(9, sortCommands(commands), 10000));
    const b = hashWorld(run(9, sortCommands(commands), 10000));
    expect(a).toBe(b);
    expect(a).not.toBe(hashWorld(run(9, sortCommands([addGold(0, 1000)]), 10000)));
  });
});

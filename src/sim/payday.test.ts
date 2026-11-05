import { describe, expect, it } from "vitest";
import { freeBedTiles, liveCreatureCount } from "./creatures";
import { asTick, asTileIndex, type TileIndex } from "./ids";
import type { Imp } from "./imps";
import {
  createWorld,
  hashWorld,
  LAIR_COST,
  MAP_WIDTH,
  run,
  sortCommands,
  step,
  TREASURY_COST,
  type Command,
  type World,
} from "./world";
import { CREATURE_WAGE, PAY_TICKS } from "./wages";

const LAIR_A = asTileIndex(31 * MAP_WIDTH + 30);
const LAIR_B = asTileIndex(31 * MAP_WIDTH + 31);
const LAIR_C = asTileIndex(31 * MAP_WIDTH + 32);
const TREASURY_A = asTileIndex(30 * MAP_WIDTH + 31);

function addGold(tick: number, amount: number): Command {
  return { kind: "addGold", tick: asTick(tick), amount };
}

function paint(tick: number, tile: TileIndex, room: "lair" | "treasury"): Command {
  return { kind: "paintRoom", tick: asTick(tick), tile, room };
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

function stepToTick(world: World, target: number, commands: readonly Command[]): void {
  const sorted = sortCommands(commands);
  while (world.tick <= target) {
    step(world, sorted);
  }
}

describe("payday", () => {
  it("pays every live creature from treasury stock first and conserves gold", () => {
    const commands = sortCommands([
      addGold(0, 1000),
      paint(0, LAIR_A, "lair"),
      paint(0, LAIR_B, "lair"),
      paint(0, LAIR_C, "lair"),
      paint(0, TREASURY_A, "treasury"),
    ]);
    const world = createWorld(1);
    step(world, commands);
    world.treasuryStock[TREASURY_A] = 50;
    world.treasuryVersion += 1;
    const initial = totalGold(world);
    const storedBefore = world.goldStored;
    stepToTick(world, PAY_TICKS, commands);
    expect(liveCreatureCount(world.creatures)).toBe(2);
    expect(world.goldPaidOut).toBe(2 * CREATURE_WAGE);
    expect(world.goldSpent).toBe(3 * LAIR_COST + TREASURY_COST);
    expect(world.treasuryStock[TREASURY_A]).toBe(50 - 2 * CREATURE_WAGE);
    expect(world.goldStored).toBe(storedBefore);
    expect(totalGold(world)).toBe(initial);
  });

  it("makes unpaid creatures leave, frees their bed and lets a later arrival claim it", () => {
    const commands = sortCommands([addGold(0, LAIR_COST), paint(0, LAIR_A, "lair")]);
    const world = createWorld(1);
    step(world, commands);
    const initial = totalGold(world);
    stepToTick(world, PAY_TICKS, commands);
    expect(liveCreatureCount(world.creatures)).toBe(0);
    expect(world.goldPaidOut).toBe(0);
    expect(freeBedTiles(world)).toContain(LAIR_A);
    expect(totalGold(world)).toBe(initial);
    stepToTick(world, 600, commands);
    expect(liveCreatureCount(world.creatures)).toBe(1);
    const slot = world.creatures.slots[0];
    if (slot === undefined || slot.kind !== "live") {
      throw new Error("missing arriving creature");
    }
    expect(slot.creature.bedTile).toBe(LAIR_A);
    expect(freeBedTiles(world)).not.toContain(LAIR_A);
  });

  it("is deterministic after 10000 ticks across paydays with unpaid leave", () => {
    const commands = sortCommands([
      addGold(0, 2 * LAIR_COST),
      paint(0, LAIR_A, "lair"),
      paint(0, LAIR_B, "lair"),
    ]);
    const a = hashWorld(run(9, commands, 10000));
    const b = hashWorld(run(9, commands, 10000));
    expect(a).toBe(b);
    expect(a).not.toBe(hashWorld(run(9, sortCommands([addGold(0, 2 * TREASURY_COST)]), 10000)));
  });
});

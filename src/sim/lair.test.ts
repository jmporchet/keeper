import { describe, expect, it } from "vitest";
import { asTick, asTileIndex, type TileIndex } from "./ids";
import type { Imp } from "./imps";
import {
  asCommandLog,
  createWorld,
  hashWorld,
  LAIR_COST,
  MAP_WIDTH,
  ROOM_KIND,
  run,
  sortCommands,
  step,
  TREASURY_COST,
  tileKindAt,
  type Command,
  type World,
} from "./world";

const HEART_TILE = asTileIndex(32 * MAP_WIDTH + 32);
const EARTH_TILE = asTileIndex(10 * MAP_WIDTH + 4);
const LAIR_A = asTileIndex(31 * MAP_WIDTH + 30);
const LAIR_B = asTileIndex(31 * MAP_WIDTH + 31);
const LAIR_C = asTileIndex(31 * MAP_WIDTH + 32);

function addGold(tick: number, amount: number): Command {
  return { kind: "addGold", tick: asTick(tick), amount };
}

function paint(tick: number, tile: TileIndex, room: "lair" | "treasury"): Command {
  return { kind: "paintRoom", tick: asTick(tick), tile, room };
}

function tag(tick: number, tile: TileIndex): Command {
  return { kind: "tag", tick: asTick(tick), tile };
}

function totalGold(world: World): number {
  let total = world.goldStored + world.goldSpent;
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

function corridorCommands(): Command[] {
  const commands: Command[] = [];
  for (let x = 35; x <= 39; x += 1) {
    commands.push(tag(0, asTileIndex(32 * MAP_WIDTH + x)));
  }
  return commands;
}

describe("lair room", () => {
  it("refuses paintRoom lair on unclaimed floor", () => {
    const world = run(1, asCommandLog([addGold(0, 100), paint(1, EARTH_TILE, "lair")]), 2);
    expect(tileKindAt(world.tiles, EARTH_TILE)).toBe("earth");
    expect(world.rooms[EARTH_TILE]).toBe(ROOM_KIND.none);
    expect(world.goldStored).toBe(100);
    expect(world.goldSpent).toBe(0);
  });

  it("refuses paintRoom lair without enough gold", () => {
    const world = run(1, asCommandLog([paint(0, HEART_TILE, "lair")]), 1);
    expect(tileKindAt(world.tiles, HEART_TILE)).toBe("claimed");
    expect(world.rooms[HEART_TILE]).toBe(ROOM_KIND.none);
    expect(world.goldStored).toBe(0);
    expect(world.goldSpent).toBe(0);
  });

  it("refuses paintRoom lair on an already painted tile", () => {
    const world = run(1, asCommandLog([addGold(0, 100), paint(0, HEART_TILE, "treasury"), paint(1, HEART_TILE, "lair")]), 2);
    expect(tileKindAt(world.tiles, HEART_TILE)).toBe("room");
    expect(world.rooms[HEART_TILE]).toBe(ROOM_KIND.treasury);
    expect(world.goldStored).toBe(100 - TREASURY_COST);
    expect(world.goldSpent).toBe(TREASURY_COST);
  });

  it("paints a lair, deducts its cost and records the spend", () => {
    const world = run(1, asCommandLog([addGold(0, 100), paint(1, HEART_TILE, "lair")]), 2);
    expect(tileKindAt(world.tiles, HEART_TILE)).toBe("room");
    expect(world.rooms[HEART_TILE]).toBe(ROOM_KIND.lair);
    expect(world.goldStored).toBe(100 - LAIR_COST);
    expect(world.goldSpent).toBe(LAIR_COST);
    expect(hashWorld(world)).not.toBe(hashWorld(run(1, asCommandLog([addGold(0, 100)]), 2)));
  });

  it("conserves gold exactly every tick with a lair", () => {
    const world = createWorld(1);
    const initial = totalGold(world);
    const sorted = sortCommands([
      addGold(0, 200),
      paint(0, LAIR_A, "lair"),
      paint(0, LAIR_B, "lair"),
      paint(0, LAIR_C, "lair"),
    ].concat(corridorCommands()));
    for (let t = 0; t < 2000; t += 1) {
      step(world, sorted);
      expect(totalGold(world)).toBe(initial + 200);
    }
  });

  it("is deterministic after 10000 ticks with paintRoom lair commands", () => {
    const commands: Command[] = [
      addGold(0, 1000),
      paint(1, LAIR_A, "lair"),
      paint(1, LAIR_B, "lair"),
      paint(1, LAIR_C, "lair"),
      paint(1, HEART_TILE, "treasury"),
      paint(5, EARTH_TILE, "lair"),
      tag(2, asTileIndex(32 * MAP_WIDTH + 38)),
    ];
    const a = hashWorld(run(9, asCommandLog(commands), 10000));
    const b = hashWorld(run(9, asCommandLog(commands), 10000));
    expect(a).toBe(b);
    expect(a).not.toBe(hashWorld(run(9, asCommandLog([addGold(0, 1000)]), 10000)));
  });
});

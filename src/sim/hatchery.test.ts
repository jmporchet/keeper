import { describe, expect, it } from "vitest";
import { CHICKEN_TILE_CAP, HATCH_TICKS, liveChickenCount } from "./chickens";
import { asTick, asTileIndex, type TileIndex } from "./ids";
import type { Imp } from "./imps";
import {
  sortCommands,
  createWorld,
  hashWorld,
  HATCHERY_COST,
  MAP_WIDTH,
  ROOM_KIND,
  run,
  step,
  tileKindAt,
  TREASURY_COST,
  type Command,
  type World,
} from "./world";

const HEART_TILE = asTileIndex(32 * MAP_WIDTH + 32);
const EARTH_TILE = asTileIndex(10 * MAP_WIDTH + 4);
const LAIR_A = asTileIndex(31 * MAP_WIDTH + 30);
const HATCHERY_A = asTileIndex(32 * MAP_WIDTH + 30);
const HATCHERY_B = asTileIndex(32 * MAP_WIDTH + 31);

function addGold(tick: number, amount: number): Command {
  return { kind: "addGold", tick: asTick(tick), amount };
}

function paint(tick: number, tile: TileIndex, room: "lair" | "treasury" | "hatchery"): Command {
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

function hatcherySetup(): Command[] {
  return [addGold(0, 1000), paint(0, LAIR_A, "lair"), paint(0, HATCHERY_A, "hatchery"), paint(0, HATCHERY_B, "hatchery")];
}

function corridorCommands(): Command[] {
  const commands: Command[] = [];
  for (let x = 35; x <= 39; x += 1) {
    commands.push(tag(0, asTileIndex(32 * MAP_WIDTH + x)));
  }
  return commands;
}

describe("hatchery room", () => {
  it("refuses paintRoom hatchery on unclaimed floor", () => {
    const world = run(1, sortCommands([addGold(0, 100), paint(1, EARTH_TILE, "hatchery")]), 2);
    expect(tileKindAt(world.tiles, EARTH_TILE)).toBe("earth");
    expect(world.rooms[EARTH_TILE]).toBe(ROOM_KIND.none);
    expect(world.goldStored).toBe(100);
    expect(world.goldSpent).toBe(0);
  });

  it("refuses paintRoom hatchery without enough gold", () => {
    const world = run(1, sortCommands([paint(0, HATCHERY_A, "hatchery")]), 1);
    expect(tileKindAt(world.tiles, HATCHERY_A)).toBe("claimed");
    expect(world.rooms[HATCHERY_A]).toBe(ROOM_KIND.none);
    expect(world.goldStored).toBe(0);
    expect(world.goldSpent).toBe(0);
  });

  it("refuses paintRoom hatchery on an already painted tile", () => {
    const world = run(
      1,
      sortCommands([addGold(0, 100), paint(0, HATCHERY_A, "treasury"), paint(1, HATCHERY_A, "hatchery")]),
      2,
    );
    expect(tileKindAt(world.tiles, HATCHERY_A)).toBe("room");
    expect(world.rooms[HATCHERY_A]).toBe(ROOM_KIND.treasury);
    expect(world.goldStored).toBe(100 - TREASURY_COST);
    expect(world.goldSpent).toBe(TREASURY_COST);
  });

  it("paints a hatchery, deducts its cost and records the spend", () => {
    const world = run(1, sortCommands([addGold(0, 100), paint(1, HATCHERY_A, "hatchery")]), 2);
    expect(tileKindAt(world.tiles, HATCHERY_A)).toBe("room");
    expect(world.rooms[HATCHERY_A]).toBe(ROOM_KIND.hatchery);
    expect(world.goldStored).toBe(100 - HATCHERY_COST);
    expect(world.goldSpent).toBe(HATCHERY_COST);
    expect(world.hatcheryCacheVersion).toBeLessThan(world.roomsVersion);
    expect(hashWorld(world)).not.toBe(hashWorld(run(1, sortCommands([addGold(0, 100)]), 2)));
  });

  it("spawns chickens on hatchery tiles up to the per-tile cap", () => {
    const commands = sortCommands([addGold(0, 1000), paint(0, HATCHERY_A, "hatchery"), paint(0, HATCHERY_B, "hatchery")]);
    const early = run(1, commands, HATCH_TICKS + 1);
    expect(liveChickenCount(early.chickens)).toBe(2);
    for (let i = 0; i < early.chickens.slots.length; i += 1) {
      const slot = early.chickens.slots[i];
      if (slot === undefined || slot.kind === "empty") {
        continue;
      }
      expect(slot.chicken.tile === HATCHERY_A || slot.chicken.tile === HATCHERY_B).toBe(true);
    }
    const capped = run(1, commands, HATCH_TICKS * 4 + 1);
    expect(liveChickenCount(capped.chickens)).toBe(2 * CHICKEN_TILE_CAP);
    expect(capped.chickenTileCount[HATCHERY_A]).toBe(CHICKEN_TILE_CAP);
    expect(capped.chickenTileCount[HATCHERY_B]).toBe(CHICKEN_TILE_CAP);
  });

  it("makes a sleeping creature hungry and eats a chicken", () => {
    const world = createWorld(1);
    const commands = sortCommands(hatcherySetup());
    let maxChickens = 0;
    let dropped = false;
    let sawHungry = false;
    let sawEating = false;
    for (let t = 0; t < 2000; t += 1) {
      step(world, commands);
      const count = liveChickenCount(world.chickens);
      if (count > maxChickens) {
        maxChickens = count;
      }
      for (let i = 0; i < world.creatures.slots.length; i += 1) {
        const slot = world.creatures.slots[i];
        if (slot === undefined) {
          continue;
        }
        switch (slot.kind) {
          case "empty":
            break;
          case "live": {
            const state = slot.creature.state.kind;
            if (state === "hungry") {
              sawHungry = true;
            }
            if (state === "eating") {
              sawEating = true;
            }
            break;
          }
          default: {
            const never: never = slot;
            throw never;
          }
        }
      }
      if (maxChickens > 0 && count < maxChickens) {
        dropped = true;
        break;
      }
    }
    expect(maxChickens).toBeGreaterThan(0);
    expect(dropped).toBe(true);
    expect(sawHungry).toBe(true);
    expect(sawEating).toBe(true);
    expect(liveChickenCount(world.chickens)).toBeLessThan(maxChickens);
  });

  it("keeps bed claims unique while creatures feed", () => {
    const commands: Command[] = [
      addGold(0, 1000),
      paint(0, LAIR_A, "lair"),
      paint(0, asTileIndex(31 * MAP_WIDTH + 31), "lair"),
      paint(0, HATCHERY_A, "hatchery"),
      paint(0, HATCHERY_B, "hatchery"),
    ];
    const world = run(1, sortCommands(commands), HATCH_TICKS * 12 + 1);
    const seen = new Set<number>();
    for (let i = 0; i < world.creatures.slots.length; i += 1) {
      const slot = world.creatures.slots[i];
      if (slot === undefined || slot.kind === "empty") {
        continue;
      }
      expect(world.rooms[slot.creature.bedTile]).toBe(ROOM_KIND.lair);
      expect(seen.has(slot.creature.bedTile)).toBe(false);
      seen.add(slot.creature.bedTile);
    }
  });

  it("conserves gold exactly every tick with a hatchery", () => {
    const world = createWorld(1);
    const initial = totalGold(world);
    const sorted = sortCommands([addGold(0, 200), paint(0, HATCHERY_A, "hatchery"), paint(0, HATCHERY_B, "hatchery")].concat(corridorCommands()));
    for (let t = 0; t < 2000; t += 1) {
      step(world, sorted);
      expect(totalGold(world)).toBe(initial + 200);
    }
    expect(world.goldSpent).toBe(2 * HATCHERY_COST);
  });

  it("is deterministic after 10000 ticks with hatchery paint and feeding", () => {
    const commands: Command[] = [
      addGold(0, 1000),
      paint(1, HATCHERY_A, "hatchery"),
      paint(1, HATCHERY_B, "hatchery"),
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

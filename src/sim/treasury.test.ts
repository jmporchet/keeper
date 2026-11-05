import { describe, expect, it } from "vitest";
import { asTick, asTileIndex, type TileIndex } from "./ids";
import { addOccupancy, occupancyAt, removeOccupancy, type Imp } from "./imps";
import { STEPS_PER_TILE } from "./pathfind";
import {
  sortCommands,
  createWorld,
  hashWorld,
  MAP_WIDTH,
  ROOM_KIND,
  run,
  step,
  TREASURY_CAPACITY,
  TREASURY_COST,
  tileKindAt,
  treasuryStockTotal,
  type Command,
  type World,
} from "./world";

const HEART_TILE = asTileIndex(32 * MAP_WIDTH + 32);
const EARTH_TILE = asTileIndex(10 * MAP_WIDTH + 4);
const TREASURY_A = asTileIndex(30 * MAP_WIDTH + 31);
const TREASURY_B = asTileIndex(30 * MAP_WIDTH + 32);
const TREASURY_C = asTileIndex(30 * MAP_WIDTH + 33);
const TREASURY_TILES = [TREASURY_A, TREASURY_B, TREASURY_C];

function addGold(tick: number, amount: number): Command {
  return { kind: "addGold", tick: asTick(tick), amount };
}

function paint(tick: number, tile: TileIndex): Command {
  return { kind: "paintRoom", tick: asTick(tick), tile, room: "treasury" };
}

function tag(tick: number, tile: TileIndex): Command {
  return { kind: "tag", tick: asTick(tick), tile };
}

function corridorCommands(): Command[] {
  const commands: Command[] = [];
  for (let x = 35; x <= 39; x += 1) {
    commands.push(tag(0, asTileIndex(32 * MAP_WIDTH + x)));
  }
  return commands;
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
      case "live":
        if (slot.imp.carry.kind === "gold") {
          total += slot.imp.carry.amount;
        }
        break;
      default: {
        const never: never = slot;
        throw never;
      }
    }
  }
  return total;
}

function findCarrying(world: World): Imp | undefined {
  for (let i = 0; i < world.imps.slots.length; i += 1) {
    const slot = world.imps.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live":
        if (slot.imp.carry.kind === "gold") {
          return slot.imp;
        }
        break;
      default: {
        const never: never = slot;
        throw never;
      }
    }
  }
  return undefined;
}

function treasurySetup(): Command[] {
  return [addGold(0, 100), paint(0, TREASURY_A), paint(0, TREASURY_B), paint(0, TREASURY_C)].concat(corridorCommands());
}

describe("treasury room", () => {
  it("refuses paintRoom on unclaimed floor", () => {
    const world = run(1, sortCommands([addGold(0, 100), paint(1, EARTH_TILE)]), 2);
    expect(tileKindAt(world.tiles, EARTH_TILE)).toBe("earth");
    expect(world.rooms[EARTH_TILE]).toBe(ROOM_KIND.none);
    expect(world.goldStored).toBe(100);
    expect(world.goldSpent).toBe(0);
  });

  it("refuses paintRoom without enough gold", () => {
    const world = run(1, sortCommands([paint(0, HEART_TILE)]), 1);
    expect(tileKindAt(world.tiles, HEART_TILE)).toBe("claimed");
    expect(world.rooms[HEART_TILE]).toBe(ROOM_KIND.none);
    expect(world.goldStored).toBe(0);
    expect(world.goldSpent).toBe(0);
  });

  it("refuses paintRoom on an already painted tile", () => {
    const world = run(1, sortCommands([addGold(0, 100), paint(0, HEART_TILE), paint(1, HEART_TILE)]), 2);
    expect(tileKindAt(world.tiles, HEART_TILE)).toBe("room");
    expect(world.rooms[HEART_TILE]).toBe(ROOM_KIND.treasury);
    expect(world.goldStored).toBe(100 - TREASURY_COST);
    expect(world.goldSpent).toBe(TREASURY_COST);
  });

  it("paints a treasury, deducts its cost and records the spend", () => {
    const world = run(1, sortCommands([addGold(0, 100), paint(1, HEART_TILE)]), 2);
    expect(tileKindAt(world.tiles, HEART_TILE)).toBe("room");
    expect(world.rooms[HEART_TILE]).toBe(ROOM_KIND.treasury);
    expect(world.treasuryStock[HEART_TILE]).toBe(0);
    expect(world.goldStored).toBe(100 - TREASURY_COST);
    expect(world.goldSpent).toBe(TREASURY_COST);
    expect(hashWorld(world)).not.toBe(hashWorld(run(1, sortCommands([addGold(0, 100)]), 2)));
  });

  it("delivers mined gold into the nearest treasury", () => {
    const world = run(1, sortCommands(treasurySetup()), 1);
    for (let t = 0; t < 4000 && treasuryStockTotal(world) === 0; t += 1) {
      step(world, sortCommands([]));
    }
    expect(treasuryStockTotal(world)).toBeGreaterThan(0);
    for (let i = 0; i < TREASURY_TILES.length; i += 1) {
      const tile = TREASURY_TILES[i];
      if (tile === undefined) {
        continue;
      }
      expect(tileKindAt(world.tiles, tile)).toBe("room");
      expect(world.rooms[tile]).toBe(ROOM_KIND.treasury);
    }
  });

  it("caps treasury stock and keeps the excess carried", () => {
    const world = run(1, sortCommands([addGold(0, 100), paint(0, TREASURY_B)].concat(corridorCommands())), 1);
    world.treasuryStock[TREASURY_B] = TREASURY_CAPACITY - 5;
    world.treasuryVersion += 1;
    const initial = totalGold(world);
    let reached = false;
    for (let t = 0; t < 4000; t += 1) {
      step(world, sortCommands([]));
      const stock = world.treasuryStock[TREASURY_B];
      expect(stock === undefined ? 0 : stock).toBeLessThanOrEqual(TREASURY_CAPACITY);
      if (stock === TREASURY_CAPACITY) {
        reached = true;
        break;
      }
      expect(totalGold(world)).toBe(initial);
    }
    expect(reached).toBe(true);
    const carrier = findCarrying(world);
    expect(carrier).toBeDefined();
    if (carrier !== undefined && carrier.carry.kind === "gold") {
      expect(carrier.carry.amount).toBeGreaterThan(0);
    }
    const storedBefore = world.goldStored;
    for (let t = 0; t < 800; t += 1) {
      step(world, sortCommands([]));
      expect(world.treasuryStock[TREASURY_B]).toBe(TREASURY_CAPACITY);
      expect(totalGold(world)).toBe(initial);
    }
    expect(world.goldStored).toBeGreaterThan(storedBefore);
  });

  it("allows two carriers to overlap on a treasury delivery target", () => {
    const target = TREASURY_B;
    const adjacent = asTileIndex(30 * MAP_WIDTH + 31);
    const world = run(1, sortCommands([addGold(0, 100), paint(0, target)]), 1);
    const firstSlot = world.imps.slots[0];
    const secondSlot = world.imps.slots[1];
    if (firstSlot === undefined || secondSlot === undefined || firstSlot.kind !== "live" || secondSlot.kind !== "live") {
      throw new Error("missing starting imps");
    }
    const first = firstSlot.imp;
    const second = secondSlot.imp;
    removeOccupancy(world.imps, first.tileY * MAP_WIDTH + first.tileX);
    first.tileX = 32;
    first.tileY = 30;
    addOccupancy(world.imps, target);
    removeOccupancy(world.imps, second.tileY * MAP_WIDTH + second.tileX);
    second.tileX = 31;
    second.tileY = 30;
    addOccupancy(world.imps, adjacent);
    first.carryGold.amount = 20;
    first.carry = first.carryGold;
    first.delivering.tile = target;
    first.delivering.pathStep = 0;
    first.delivering.pathLength = 1;
    first.delivering.progress = 0;
    first.delivering.blockedTicks = 0;
    first.state = first.delivering;
    second.carryGold.amount = 20;
    second.carry = second.carryGold;
    second.delivering.tile = target;
    second.delivering.pathStep = 0;
    second.delivering.pathLength = 2;
    second.delivering.progress = STEPS_PER_TILE - 1;
    second.delivering.blockedTicks = 0;
    second.path[0] = adjacent;
    second.path[1] = target;
    second.state = second.delivering;
    expect(occupancyAt(world.imps, target)).toBe(1);
    step(world, sortCommands([]));
    expect(occupancyAt(world.imps, target)).toBe(2);
    expect(world.treasuryStock[target]).toBe(40);
    expect(treasuryStockTotal(world)).toBe(40);
  });

  it("conserves gold exactly every tick with a treasury", () => {
    const world = createWorld(1);
    const initial = totalGold(world);
    const sorted = sortCommands(treasurySetup());
    for (let t = 0; t < 4000; t += 1) {
      step(world, sorted);
      expect(totalGold(world)).toBe(initial + 100);
    }
    expect(treasuryStockTotal(world)).toBeGreaterThan(0);
  });

  it("is deterministic after 10000 ticks with paintRoom commands", () => {
    const commands: Command[] = [
      addGold(0, 1000),
      paint(1, TREASURY_A),
      paint(1, TREASURY_B),
      paint(1, TREASURY_C),
      paint(5, EARTH_TILE),
      tag(2, asTileIndex(32 * MAP_WIDTH + 38)),
    ];
    const a = hashWorld(run(9, sortCommands(commands), 10000));
    const b = hashWorld(run(9, sortCommands(commands), 10000));
    expect(a).toBe(b);
    expect(a).not.toBe(hashWorld(run(9, sortCommands([addGold(0, 1000)]), 10000)));
  });
});

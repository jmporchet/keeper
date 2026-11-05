import { describe, expect, it } from "vitest";
import { asTick, asTileIndex } from "./ids";
import { carryingCount, type Imp } from "./imps";
import {
  createWorld,
  MAP_WIDTH,
  run,
  sortCommands,
  step,
  tileKindAt,
  type Command,
  type World,
} from "./world";

function totalGold(world: World): number {
  let total = world.goldStored;
  for (let i = 0; i < world.goldStock.length; i += 1) {
    const stock = world.goldStock[i];
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

function carriedAmount(imp: Imp): number {
  return imp.carry.kind === "gold" ? imp.carry.amount : 0;
}

function carryEmpty(imp: Imp): boolean {
  return imp.carry.kind === "empty";
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

function corridorCommands(): Command[] {
  const commands: Command[] = [];
  for (let x = 35; x <= 39; x += 1) {
    commands.push({ kind: "tag", tick: asTick(0), tile: asTileIndex(32 * MAP_WIDTH + x) });
  }
  return commands;
}

describe("gold", () => {
  it("mines tagged seams, carries gold to the heart and conserves it every tick", () => {
    const commands = corridorCommands();
    const sorted = sortCommands(commands);
    const world = createWorld(1);
    const initial = totalGold(world);
    let carried = false;
    for (let t = 0; t < 4000; t += 1) {
      step(world, sorted);
      const now = totalGold(world);
      if (now !== initial) {
        throw new Error(`gold changed from ${String(initial)} to ${String(now)} at tick ${String(world.tick)}`);
      }
      if (carryingCount(world.imps) > 0) {
        carried = true;
      }
    }
    expect(carried).toBe(true);
    expect(world.goldStored).toBe(80);
    for (const x of [38, 39]) {
      const kind = tileKindAt(world.tiles, 32 * MAP_WIDTH + x);
      expect(kind === "dirt" || kind === "claimed").toBe(true);
    }
    expect(totalGold(world)).toBe(initial);
  });

  it("delivers carried gold after the seam is untagged and keeps its remaining stock", () => {
    const tile = asTileIndex(32 * MAP_WIDTH + 38);
    const commands: Command[] = [];
    for (let x = 35; x <= 38; x += 1) {
      commands.push({ kind: "tag", tick: asTick(0), tile: asTileIndex(32 * MAP_WIDTH + x) });
    }
    const world = run(1, commands, 1);
    let carrier: Imp | undefined;
    for (let t = 0; t < 2000; t += 1) {
      step(world, []);
      carrier = findCarrying(world);
      if (carrier !== undefined) {
        break;
      }
    }
    expect(carrier).toBeDefined();
    if (carrier === undefined) {
      throw new Error("carrier missing");
    }
    const carried = carriedAmount(carrier);
    expect(carried).toBeGreaterThan(0);
    const stockBefore = world.goldStock[tile];
    const storedBefore = world.goldStored;
    world.commandCursor = 0;
    step(world, [{ kind: "untag", tick: asTick(world.tick), tile }]);
    expect(tileKindAt(world.tiles, tile)).toBe("goldSeam");
    expect(world.goldStock[tile]).toBe(stockBefore);
    for (let t = 0; t < 200; t += 1) {
      step(world, []);
      if (carryEmpty(carrier)) {
        break;
      }
    }
    expect(world.goldStored).toBe(storedBefore + carried);
    expect(world.goldStock[tile]).toBe(stockBefore);
  });
});

import { describe, expect, it } from "vitest";
import { asTick, asTileIndex, type ImpId } from "./ids";
import { occupancyAt, type ImpSlot } from "./imps";
import { jobAtTile } from "./jobs";
import {
  createWorld,
  HEART_X,
  HEART_Y,
  MAP_HEIGHT,
  MAP_WIDTH,
  sortCommands,
  step,
  type Command,
  type World,
} from "./world";

function recount(world: World): Uint16Array {
  const counts = new Uint16Array(MAP_WIDTH * MAP_HEIGHT);
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
        if (imp.state.kind === "held") {
          break;
        }
        const tile = imp.tileY * MAP_WIDTH + imp.tileX;
        const count = counts[tile];
        if (count !== undefined) {
          counts[tile] = count + 1;
        }
        break;
      }
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  return counts;
}

function assertOccupancy(world: World): void {
  const counts = recount(world);
  for (let i = 0; i < counts.length; i += 1) {
    const expected = counts[i];
    const actual = occupancyAt(world.imps, i);
    if (actual !== expected) {
      throw new Error(`occupancy mismatch at tile ${String(i)}: ${String(actual)} vs ${String(expected)}`);
    }
  }
}

function hasAdjacentJob(world: World, tile: number): boolean {
  const y = (tile / MAP_WIDTH) | 0;
  const x = tile - y * MAP_WIDTH;
  const north = y > 0 ? jobAtTile(world.jobs, asTileIndex((y - 1) * MAP_WIDTH + x)) : undefined;
  if (north !== undefined) {
    return true;
  }
  const east = x + 1 < MAP_WIDTH ? jobAtTile(world.jobs, asTileIndex(y * MAP_WIDTH + x + 1)) : undefined;
  if (east !== undefined) {
    return true;
  }
  const south = y + 1 < MAP_HEIGHT ? jobAtTile(world.jobs, asTileIndex((y + 1) * MAP_WIDTH + x)) : undefined;
  if (south !== undefined) {
    return true;
  }
  const west = x > 0 ? jobAtTile(world.jobs, asTileIndex(y * MAP_WIDTH + x - 1)) : undefined;
  return west !== undefined;
}

function assertAtMostOnePerTile(world: World): void {
  const heart = HEART_Y * MAP_WIDTH + HEART_X;
  for (let i = 0; i < world.imps.occupancy.length; i += 1) {
    const count = occupancyAt(world.imps, i);
    if (count <= 1 || i === heart || hasAdjacentJob(world, i)) {
      continue;
    }
    throw new Error(`tile ${String(i)} holds ${String(count)} imps at tick ${String(world.tick)}`);
  }
}

function spawnCommands(count: number): Command[] {
  const commands: Command[] = [];
  for (let i = 0; i < count; i += 1) {
    commands.push({ kind: "spawnImp", tick: asTick(0) });
  }
  return commands;
}

function corridorCommands(): Command[] {
  const commands: Command[] = [];
  for (let x = 35; x <= 39; x += 1) {
    commands.push({ kind: "tag", tick: asTick(0), tile: asTileIndex(32 * MAP_WIDTH + x) });
  }
  return commands;
}

function tileOf(slot: ImpSlot | undefined): number | undefined {
  if (slot === undefined) {
    return undefined;
  }
  switch (slot.kind) {
    case "empty":
      return undefined;
    case "live":
      return slot.imp.tileY * MAP_WIDTH + slot.imp.tileX;
    default: {
      const never: never = slot;
      return never;
    }
  }
}

function findWalkingId(world: World): ImpId | undefined {
  for (let i = 0; i < world.imps.slots.length; i += 1) {
    const slot = world.imps.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live":
        if (slot.imp.state.kind === "walking") {
          return slot.imp.id;
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

function boostedTile(world: World, impId: ImpId): number | undefined {
  const slot = world.imps.slots[impId];
  if (slot === undefined) {
    return undefined;
  }
  switch (slot.kind) {
    case "empty":
      return undefined;
    case "live": {
      const imp = slot.imp;
      if (imp.boost.kind !== "boosted" || imp.state.kind === "held") {
        return undefined;
      }
      return imp.tileY * MAP_WIDTH + imp.tileX;
    }
    default: {
      const never: never = slot;
      return never;
    }
  }
}

function occupancySum(world: World): number {
  let total = 0;
  for (let i = 0; i < world.imps.occupancy.length; i += 1) {
    total += occupancyAt(world.imps, i);
  }
  return total;
}

function stationaryExempt(slot: ImpSlot | undefined): boolean {
  if (slot === undefined) {
    return false;
  }
  switch (slot.kind) {
    case "empty":
      return false;
    case "live":
      return slot.imp.state.kind === "working" || slot.imp.state.kind === "held";
    default: {
      const never: never = slot;
      return never;
    }
  }
}

describe("imp occupancy", () => {
  it("keeps at most one imp per tile with 12 imps", () => {
    const world = createWorld(1);
    const commands = sortCommands(spawnCommands(8));
    for (let t = 0; t < 2000; t += 1) {
      step(world, commands);
      assertOccupancy(world);
      assertAtMostOnePerTile(world);
    }
  }, 30_000);

  it("keeps 200 imps progressing without deadlock and matches a recount", () => {
    const world = createWorld(1);
    const commands = sortCommands([...corridorCommands(), ...spawnCommands(196)]);
    const windows = 10;
    const windowLength = 400;
    const failures: string[] = [];
    for (let windowIndex = 0; windowIndex < windows; windowIndex += 1) {
      const startTiles: (number | undefined)[] = [];
      const changed: boolean[] = [];
      const exemptAll: boolean[] = [];
      for (let i = 0; i < world.imps.slots.length; i += 1) {
        startTiles.push(tileOf(world.imps.slots[i]));
        changed.push(false);
        exemptAll.push(true);
      }
      for (let t = 0; t < windowLength; t += 1) {
        step(world, commands);
        assertOccupancy(world);
        for (let i = 0; i < world.imps.slots.length; i += 1) {
          const slot = world.imps.slots[i];
          const tile = tileOf(slot);
          if (tile === undefined) {
            continue;
          }
          if (tile !== startTiles[i]) {
            changed[i] = true;
          }
          if (!stationaryExempt(slot)) {
            exemptAll[i] = false;
          }
        }
      }
      for (let i = 0; i < world.imps.slots.length; i += 1) {
        if (tileOf(world.imps.slots[i]) === undefined) {
          continue;
        }
        if (!changed[i] && !exemptAll[i]) {
          failures.push(`imp ${String(i)} did not move in window ${String(windowIndex)}`);
        }
      }
    }
    expect(failures).toEqual([]);
    expect(world.goldStored).toBeGreaterThan(0);
  }, 60_000);

  it("keeps occupancy exact while a boosted imp walks", () => {
    const probe = createWorld(1);
    const tags = sortCommands(corridorCommands());
    let targetId: ImpId | undefined;
    let slapTick = 0;
    for (let t = 0; t < 300; t += 1) {
      step(probe, tags);
      targetId = findWalkingId(probe);
      if (targetId !== undefined) {
        slapTick = probe.tick;
        break;
      }
    }
    if (targetId === undefined) {
      throw new Error("no imp started walking");
    }
    const commands = sortCommands([
      ...corridorCommands(),
      { kind: "slap", tick: asTick(slapTick), impId: targetId },
    ]);
    const world = createWorld(1);
    let boostedSeen = false;
    let movedWhileBoosted = false;
    let previousTile = boostedTile(world, targetId);
    for (let t = 0; t < slapTick + 120; t += 1) {
      step(world, commands);
      assertOccupancy(world);
      expect(occupancySum(world)).toBe(world.imps.liveCount - world.imps.heldCount);
      const tile = boostedTile(world, targetId);
      if (tile !== undefined) {
        boostedSeen = true;
        if (previousTile !== undefined && tile !== previousTile) {
          movedWhileBoosted = true;
        }
      }
      previousTile = tile;
    }
    expect(boostedSeen).toBe(true);
    expect(movedWhileBoosted).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { asTick, asTileIndex } from "./ids";
import { createWorld, MAP_WIDTH, step, type Command, type World } from "./world";

const WINDOW = 200;
const FROM = 1000;
const TO = 4000;

function corridorCommands(): Command[] {
  const commands: Command[] = [];
  for (let x = 35; x <= 39; x += 1) {
    commands.push({ kind: "tag", tick: asTick(0), tile: asTileIndex(32 * MAP_WIDTH + x) });
  }
  return commands;
}

function tileOf(world: World, slotIndex: number): number | undefined {
  const slot = world.imps.slots[slotIndex];
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

function workingNow(world: World, slotIndex: number): boolean {
  const slot = world.imps.slots[slotIndex];
  if (slot === undefined) {
    return false;
  }
  switch (slot.kind) {
    case "empty":
      return false;
    case "live":
      return slot.imp.state.kind === "working";
    default: {
      const never: never = slot;
      return never;
    }
  }
}

describe("idle imps", () => {
  it("keeps moving when no job is reachable", () => {
    const commands = corridorCommands();
    const world = createWorld(1);
    for (let t = 0; t < FROM; t += 1) {
      step(world, commands);
    }
    const slotCount = world.imps.slots.length;
    const failures: string[] = [];
    for (let windowStart = FROM; windowStart < TO; windowStart += WINDOW) {
      const startTile: (number | undefined)[] = [];
      const changed: boolean[] = [];
      const workingAll: boolean[] = [];
      for (let i = 0; i < slotCount; i += 1) {
        startTile.push(tileOf(world, i));
        changed.push(false);
        workingAll.push(true);
      }
      for (let t = 0; t < WINDOW; t += 1) {
        step(world, commands);
        for (let i = 0; i < slotCount; i += 1) {
          const tile = tileOf(world, i);
          if (tile === undefined) {
            continue;
          }
          if (tile !== startTile[i]) {
            changed[i] = true;
          }
          if (!workingNow(world, i)) {
            workingAll[i] = false;
          }
        }
      }
      for (let i = 0; i < slotCount; i += 1) {
        if (tileOf(world, i) === undefined) {
          continue;
        }
        if (!changed[i] && !workingAll[i]) {
          failures.push(`imp ${String(i)} did not move in window ${String(windowStart)}-${String(windowStart + WINDOW)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

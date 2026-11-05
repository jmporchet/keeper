import { describe, expect, it, vi } from "vitest";
import type { Command } from "./world";

describe("module import order", () => {
  it("imports creatures before world without a runtime cycle", async () => {
    vi.resetModules();
    const creatures = await import("./creatures");
    expect(creatures.CREATURE_CAPACITY).toBe(8);
    const worldModule = await import("./world");
    const ids = await import("./ids");
    const commands: Command[] = [
      { kind: "addGold", tick: ids.asTick(0), amount: 1000 },
      { kind: "paintRoom", tick: ids.asTick(0), tile: ids.asTileIndex(30 * worldModule.MAP_WIDTH + 30), room: "lair" },
      { kind: "paintRoom", tick: ids.asTick(0), tile: ids.asTileIndex(30 * worldModule.MAP_WIDTH + 31), room: "lair" },
    ];
    const world = worldModule.run(1, worldModule.sortCommands(commands), creatures.ARRIVE_TICKS + 1);
    expect(worldModule.liveCreatureCount(world.creatures)).toBe(1);
  });

  it("trains creatures when creatures is imported before world", async () => {
    vi.resetModules();
    const creatures = await import("./creatures");
    const worldModule = await import("./world");
    const ids = await import("./ids");
    const commands: Command[] = [
      { kind: "addGold", tick: ids.asTick(0), amount: 1000 },
      { kind: "paintRoom", tick: ids.asTick(0), tile: ids.asTileIndex(30 * worldModule.MAP_WIDTH + 30), room: "lair" },
      { kind: "paintRoom", tick: ids.asTick(0), tile: ids.asTileIndex(33 * worldModule.MAP_WIDTH + 30), room: "training" },
    ];
    const world = worldModule.run(1, worldModule.sortCommands(commands), 600);
    let level = 0;
    for (let i = 0; i < world.creatures.slots.length; i += 1) {
      const slot = world.creatures.slots[i];
      if (slot === undefined || slot.kind === "empty") {
        continue;
      }
      if (slot.creature.level > level) {
        level = slot.creature.level;
      }
    }
    expect(level).toBe(creatures.CREATURE_MAX_LEVEL);
  });

  it("hatches chickens when chickens is imported before world", async () => {
    vi.resetModules();
    const chickens = await import("./chickens");
    expect(chickens.CHICKEN_CAPACITY).toBe(32);
    const worldModule = await import("./world");
    const ids = await import("./ids");
    const commands: Command[] = [
      { kind: "addGold", tick: ids.asTick(0), amount: 1000 },
      { kind: "paintRoom", tick: ids.asTick(0), tile: ids.asTileIndex(32 * worldModule.MAP_WIDTH + 30), room: "hatchery" },
    ];
    const world = worldModule.run(1, worldModule.sortCommands(commands), chickens.HATCH_TICKS + 1);
    expect(worldModule.liveChickenCount(world.chickens)).toBe(1);
  });

  it("paths imps when jobs is imported before world", async () => {
    vi.resetModules();
    await import("./jobs");
    const worldModule = await import("./world");
    const ids = await import("./ids");
    const commands: Command[] = [];
    for (let x = 35; x <= 37; x += 1) {
      commands.push({ kind: "tag", tick: ids.asTick(0), tile: ids.asTileIndex(32 * worldModule.MAP_WIDTH + x) });
    }
    const world = worldModule.run(1, worldModule.sortCommands(commands), 600);
    for (let x = 35; x <= 37; x += 1) {
      const kind = worldModule.tileKindAt(world.tiles, 32 * worldModule.MAP_WIDTH + x);
      expect(kind === "dirt" || kind === "claimed").toBe(true);
    }
  });
});

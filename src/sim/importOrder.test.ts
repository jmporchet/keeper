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
    const world = worldModule.run(1, commands, creatures.ARRIVE_TICKS + 1);
    expect(worldModule.liveCreatureCount(world.creatures)).toBe(1);
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
    const world = worldModule.run(1, commands, 600);
    for (let x = 35; x <= 37; x += 1) {
      const kind = worldModule.tileKindAt(world.tiles, 32 * worldModule.MAP_WIDTH + x);
      expect(kind === "dirt" || kind === "claimed").toBe(true);
    }
  });
});

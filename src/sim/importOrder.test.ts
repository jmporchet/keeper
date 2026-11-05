import { describe, expect, it, vi } from "vitest";
import type { Command } from "./world";

describe("module import order", () => {
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

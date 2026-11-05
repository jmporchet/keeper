import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { liveImpCount, occupyWalkable, STARTING_IMP_COUNT, type Imp } from "./imps";
import { createWorld, hashWorld, run, step, TILE_KIND, tileKindAt } from "./world";

const TICKS = 10_000;

function liveImp(world: ReturnType<typeof createWorld>, index: number): Imp {
  const slot = world.imps.slots[index];
  if (slot === undefined) {
    throw new Error("missing slot");
  }
  switch (slot.kind) {
    case "empty":
      throw new Error("empty slot");
    case "live":
      return slot.imp;
    default: {
      const never: never = slot;
      return never;
    }
  }
}

function formatImpLog(seed: number, ticks: number, impIndex: number): string {
  const world = createWorld(seed);
  const lines: string[] = [];
  lines.push(formatImpLine(0, liveImp(world, impIndex)));
  for (let t = 0; t < ticks; t += 1) {
    step(world, []);
    lines.push(formatImpLine(world.tick, liveImp(world, impIndex)));
  }
  return lines.join("\n");
}

function formatImpLine(tick: number, imp: { tileX: number; tileY: number; state: { kind: string } }): string {
  return `${String(tick).padStart(3, " ")} ${imp.state.kind.padEnd(9, " ")} (${String(imp.tileX)},${String(imp.tileY)})`;
}

describe("imps", () => {
  it("spawns at the dungeon heart on claimed floor", () => {
    const world = createWorld(1);
    expect(liveImpCount(world.imps)).toBe(STARTING_IMP_COUNT);
    for (let i = 0; i < STARTING_IMP_COUNT; i += 1) {
      const imp = liveImp(world, i);
      expect(tileKindAt(world.tiles, imp.tileY * world.width + imp.tileX)).toBe("claimed");
      expect(imp.state.kind).toBe("idle");
    }
  });

  it("prints one imp walking a wander path", () => {
    expect(formatImpLog(1, 48, 0)).toMatchSnapshot();
  });

  it("never stands on non-walkable tiles over 10000 ticks", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), (seed) => {
        const world = createWorld(seed);
        for (let t = 0; t < TICKS; t += 1) {
          step(world, []);
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
                if (!occupyWalkable(imp, world.tiles, world.width)) {
                  throw new Error(`imp ${String(imp.id)} on non-walkable tile at tick ${String(world.tick)}`);
                }
                const kind = tileKindAt(world.tiles, imp.tileY * world.width + imp.tileX);
                if (kind === "earth" || kind === "rock" || kind === "goldSeam" || kind === "taggedEarth" || kind === "taggedGold") {
                  throw new Error(`imp ${String(imp.id)} stood on ${kind}`);
                }
                break;
              }
              default: {
                const never: never = slot;
                return never;
              }
            }
          }
        }
      }),
      { numRuns: 5 },
    );
  }, 20_000);

  it("keeps determinism with wandering imps", () => {
    const a = hashWorld(run(7, [], TICKS));
    const b = hashWorld(run(7, [], TICKS));
    expect(a).toBe(b);
    expect(a).not.toBe(hashWorld(run(8, [], TICKS)));
  });
});

describe("walkable kinds", () => {
  it("treats claimed dirt and room as walkable", () => {
    expect(TILE_KIND.claimed).toBe(4);
    expect(TILE_KIND.dirt).toBe(3);
    expect(TILE_KIND.room).toBe(5);
  });
});

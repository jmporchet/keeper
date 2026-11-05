import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { asTick, asTileIndex } from "./ids";
import { createWorld, hashWorld, KIND_CLAIMED, KIND_EARTH, KIND_GOLD_SEAM, run, type Command } from "./world";

const TICKS = 10_000;

function addGold(tick: number, amount: number): Command {
  return { kind: "addGold", tick: asTick(tick), amount };
}

function tag(tick: number, tile: number): Command {
  return { kind: "tag", tick: asTick(tick), tile: asTileIndex(tile) };
}

describe("sim core", () => {
  it("builds the placeholder tile grid", () => {
    const world = createWorld(1);
    expect(world.width).toBe(9);
    expect(world.height).toBe(9);
    expect(world.tiles[world.width * 4 + 5]).toBe(KIND_GOLD_SEAM);
    expect(world.tiles[world.width * 4 + 4]).toBe(KIND_CLAIMED);
    expect(world.tiles[0]).toBe(KIND_EARTH);
  });

  it("same seed and command log give the same state hash after 10000 ticks", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), commandList(), (seed, commands) => {
        const a = hashWorld(run(seed, commands, TICKS));
        const b = hashWorld(run(seed, commands, TICKS));
        expect(a).toBe(b);
      }),
      { numRuns: 20 },
    );
  });

  it("a different seed or command list generally differs", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), fc.integer({ min: 1, max: 0xffffffff }), (seed, delta) => {
        const other = (seed + delta) >>> 0;
        const a = hashWorld(run(seed, [], TICKS));
        const b = hashWorld(run(other, [], TICKS));
        expect(a).not.toBe(b);
      }),
      { numRuns: 20 },
    );
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), commandList(), extraCommand(), (seed, commands, extra) => {
        const withExtra = commands.concat([extra]);
        const a = hashWorld(run(seed, commands, TICKS));
        const b = hashWorld(run(seed, withExtra, TICKS));
        expect(a).not.toBe(b);
      }),
      { numRuns: 20 },
    );
  });
});

function commandList(): fc.Arbitrary<Command[]> {
  return fc.array(
    fc.tuple(fc.integer({ min: 0, max: TICKS - 1 }), fc.integer({ min: 0, max: 80 }), fc.integer({ min: 1, max: 8 })).map(
      ([tick, tile, amount]) => {
        if (amount % 2 === 0) {
          return tag(tick, tile);
        }
        return addGold(tick, amount);
      },
    ),
    { maxLength: 16 },
  );
}

function extraCommand(): fc.Arbitrary<Command> {
  return fc.tuple(fc.integer({ min: 0, max: TICKS - 1 }), fc.integer({ min: 1, max: 50 })).map(([tick, amount]) => {
    return addGold(tick, amount + 1000);
  });
}

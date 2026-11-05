import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { asTick } from "./ids";
import { IMP_CAPACITY, liveImpCount, STARTING_IMP_COUNT } from "./imps";
import {
  asCommandLog,
  createWorld,
  hashWorld,
  HEART_X,
  HEART_Y,
  run,
  step,
  type Command,
} from "./world";

const TICKS = 60;

function sandboxCommands(): fc.Arbitrary<Command[]> {
  return fc
    .array(
      fc.tuple(fc.integer({ min: 0, max: TICKS - 1 }), fc.integer({ min: 0, max: 1 }), fc.integer({ min: 1, max: 500 })),
      { maxLength: 24 },
    )
    .map((entries) => {
      const commands: Command[] = [];
      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        if (entry === undefined) {
          continue;
        }
        const [tick, action, amount] = entry;
        if (action === 0) {
          commands.push({ kind: "spawnImp", tick: asTick(tick) });
        } else {
          commands.push({ kind: "addGold", tick: asTick(tick), amount });
        }
      }
      return commands;
    });
}

describe("sandbox commands", () => {
  it("replays a recorded sandbox command log to the same world hash", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), sandboxCommands(), (seed, recorded) => {
        const world = createWorld(seed);
        const log: Command[] = [];
        for (let t = 0; t < TICKS; t += 1) {
          for (let i = 0; i < recorded.length; i += 1) {
            const command = recorded[i];
            if (command !== undefined && command.tick === world.tick) {
              log.push(command);
            }
          }
          step(world, asCommandLog(log));
        }
        const replay = run(seed, asCommandLog(log), TICKS);
        expect(hashWorld(replay)).toBe(hashWorld(world));
      }),
      { numRuns: 25 },
    );
  });

  it("spawns a new imp at the heart tile", () => {
    const world = run(1, asCommandLog([{ kind: "spawnImp", tick: asTick(0) }]), 1);
    expect(liveImpCount(world.imps)).toBe(STARTING_IMP_COUNT + 1);
    const slot = world.imps.slots[STARTING_IMP_COUNT];
    expect(slot?.kind).toBe("live");
    if (slot === undefined || slot.kind !== "live") {
      throw new Error("missing spawned imp");
    }
    expect(slot.imp.tileX).toBe(HEART_X);
    expect(slot.imp.tileY).toBe(HEART_Y);
  });

  it("refuses spawnImp when the board is full", () => {
    const commands: Command[] = [];
    for (let i = 0; i < IMP_CAPACITY + 10; i += 1) {
      commands.push({ kind: "spawnImp", tick: asTick(0) });
    }
    const world = run(1, asCommandLog(commands), 1);
    expect(liveImpCount(world.imps)).toBe(IMP_CAPACITY);
  });
});

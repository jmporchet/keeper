import * as fc from "fast-check";
import { describe, expect, expectTypeOf, it } from "vitest";
import { commandList } from "./commandArbitrary";
import { asTick, asTileIndex } from "./ids";
import {
  buildSave,
  parseSave,
  parseSaveValue,
  replaySave,
  saveCommandLog,
  serializeSave,
} from "./save";
import {
  asCommandLog,
  createWorld,
  hashWorld,
  MAP_WIDTH,
  run,
  sortCommands,
  step,
  type Command,
  type CommandLog,
} from "./world";

const TICKS = 120;

function parseOk(value: unknown) {
  const parsed = parseSaveValue(value);
  if (!parsed.ok) {
    throw new Error(`expected a valid save, got ${parsed.error.kind}`);
  }
  return parsed.save;
}

describe("command log", () => {
  it("brands sorted command logs and steps with them", () => {
    expectTypeOf<Command[]>().not.toMatchTypeOf<CommandLog>();
    expectTypeOf<Parameters<typeof run>[1]>().toEqualTypeOf<CommandLog>();
    const commands: Command[] = [
      { kind: "tag", tick: asTick(2), tile: asTileIndex(10 * MAP_WIDTH + 4) },
      { kind: "tag", tick: asTick(1), tile: asTileIndex(10 * MAP_WIDTH + 5) },
    ];
    const sorted = sortCommands(commands);
    const world = createWorld(1);
    step(world, sorted);
    expect(world.tick).toBe(1);
    const branded = asCommandLog(sorted.slice());
    step(world, branded);
    expect(world.tick).toBe(2);
  });

  it("sorts an imported command log by tick and original index", () => {
    const save = parseOk({
      version: 1,
      seed: 7,
      tick: 3,
      commands: [
        { kind: "addGold", tick: 2, amount: 5 },
        { kind: "addGold", tick: 1, amount: 3 },
        { kind: "addGold", tick: 2, amount: 4 },
      ],
    });
    expect(save.commands.map((command) => command.tick)).toEqual([1, 2, 2]);
    expect(saveCommandLog(save).length).toBe(3);
  });
});

describe("save round-trip", () => {
  it("replays an exported save to the live hash and tick", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), commandList(TICKS), (seed, commands) => {
        const log = sortCommands(commands);
        const live = createWorld(seed);
        for (let i = 0; i < TICKS; i += 1) {
          step(live, log);
        }
        const save = buildSave(live, commands);
        const parsed = parseSave(serializeSave(save));
        if (!parsed.ok) {
          throw new Error(`expected a valid save, got ${parsed.error.kind}`);
        }
        const replay = replaySave(parsed.save);
        expect(replay.tick).toBe(live.tick);
        expect(hashWorld(replay)).toBe(hashWorld(live));
      }),
      { numRuns: 20 },
    );
  });

  it("keeps the save seed, tick and command count", () => {
    const commands: Command[] = [
      { kind: "addGold", tick: asTick(0), amount: 50 },
      { kind: "spawnImp", tick: asTick(1) },
    ];
    const live = createWorld(3);
    for (let i = 0; i < 2; i += 1) {
      step(live, asCommandLog(commands));
    }
    const save = buildSave(live, commands);
    expect(save.version).toBe(1);
    expect(save.seed).toBe(3);
    expect(save.tick).toBe(2);
    expect(save.commands.length).toBe(2);
    const replay = replaySave(parseOk(JSON.parse(serializeSave(save))));
    expect(replay.tick).toBe(save.tick);
    expect(hashWorld(replay)).toBe(hashWorld(live));
  });
});

describe("save validation", () => {
  it("rejects a bad version", () => {
    expect(parseSaveValue({ version: 2, seed: 1, tick: 0, commands: [] })).toEqual({
      ok: false,
      error: { kind: "invalidVersion" },
    });
  });

  it("rejects a bad seed", () => {
    expect(parseSaveValue({ version: 1, seed: -1, tick: 0, commands: [] })).toEqual({
      ok: false,
      error: { kind: "invalidSeed" },
    });
    expect(parseSaveValue({ version: 1, seed: 1.5, tick: 0, commands: [] })).toEqual({
      ok: false,
      error: { kind: "invalidSeed" },
    });
  });

  it("rejects a negative tick", () => {
    expect(parseSaveValue({ version: 1, seed: 1, tick: -1, commands: [] })).toEqual({
      ok: false,
      error: { kind: "invalidTick" },
    });
  });

  it("rejects non-array commands", () => {
    expect(parseSaveValue({ version: 1, seed: 1, tick: 0, commands: {} })).toEqual({
      ok: false,
      error: { kind: "invalidCommands" },
    });
  });

  it("rejects an unknown command kind", () => {
    expect(
      parseSaveValue({ version: 1, seed: 1, tick: 0, commands: [{ kind: "dance", tick: 0 }] }),
    ).toEqual({
      ok: false,
      error: { kind: "invalidCommand", index: 0, reason: "unknownKind" },
    });
  });

  it("rejects missing command fields", () => {
    expect(
      parseSaveValue({ version: 1, seed: 1, tick: 0, commands: [{ kind: "addGold", tick: 0 }] }),
    ).toEqual({
      ok: false,
      error: { kind: "invalidCommand", index: 0, reason: "invalidAmount" },
    });
    expect(
      parseSaveValue({ version: 1, seed: 1, tick: 0, commands: [{ kind: "tag", tick: 0 }] }),
    ).toEqual({
      ok: false,
      error: { kind: "invalidCommand", index: 0, reason: "invalidTile" },
    });
    expect(
      parseSaveValue({ version: 1, seed: 1, tick: 0, commands: [{ kind: "paintRoom", tick: 0, tile: 0 }] }),
    ).toEqual({
      ok: false,
      error: { kind: "invalidCommand", index: 0, reason: "invalidRoom" },
    });
    expect(
      parseSaveValue({ version: 1, seed: 1, tick: 0, commands: [{ kind: "pickUp", tick: 0 }] }),
    ).toEqual({
      ok: false,
      error: { kind: "invalidCommand", index: 0, reason: "invalidImpId" },
    });
    expect(
      parseSaveValue({ version: 1, seed: 1, tick: 0, commands: [{ kind: "drop", tick: 0, impId: 0 }] }),
    ).toEqual({
      ok: false,
      error: { kind: "invalidCommand", index: 0, reason: "invalidDropTile" },
    });
  });

  it("rejects malformed command entries", () => {
    expect(parseSaveValue({ version: 1, seed: 1, tick: 0, commands: [null] })).toEqual({
      ok: false,
      error: { kind: "invalidCommand", index: 0, reason: "notObject" },
    });
    expect(
      parseSaveValue({ version: 1, seed: 1, tick: 0, commands: [{ kind: "tag", tick: -1, tile: 0 }] }),
    ).toEqual({
      ok: false,
      error: { kind: "invalidCommand", index: 0, reason: "invalidTick" },
    });
  });

  it("rejects malformed JSON and non-object saves", () => {
    expect(parseSave("{")).toEqual({ ok: false, error: { kind: "invalidJson" } });
    expect(parseSave("null")).toEqual({ ok: false, error: { kind: "invalidJson" } });
    expect(parseSave("[]")).toEqual({ ok: false, error: { kind: "invalidJson" } });
  });
});

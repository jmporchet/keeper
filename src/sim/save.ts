import { asImpId, asTick, asTileIndex } from "./ids";
import { IMP_CAPACITY } from "./imps";
import { MAP_HEIGHT, MAP_WIDTH } from "./map";
import {
  createWorld,
  requireSorted,
  sortCommands,
  step,
  type Command,
  type CommandLog,
} from "./world";
import type { World } from "./worldCore";

export const SAVE_STORAGE_KEY = "keeper.save.v1";
export const SAVE_VERSION = 1;
export const MAX_SAVE_SEED = 0xffffffff;
export const MAX_SAVE_TICK = 2_147_483_647;
export const MAX_SAVE_COMMANDS = 1_000_000;
export const MAX_GOLD_AMOUNT = 1_000_000_000;

export type Save = {
  version: 1;
  seed: number;
  tick: number;
  commands: Command[];
};

export type CommandErrorReason =
  | "notObject"
  | "unknownKind"
  | "invalidTick"
  | "invalidAmount"
  | "invalidTile"
  | "invalidRoom"
  | "invalidImpId"
  | "invalidDropTile";

export type SaveError =
  | { kind: "invalidJson" }
  | { kind: "invalidVersion" }
  | { kind: "invalidSeed" }
  | { kind: "invalidTick" }
  | { kind: "invalidCommands" }
  | { kind: "invalidCommand"; index: number; reason: CommandErrorReason };

export type SaveResult = { ok: true; save: Save } | { ok: false; error: SaveError };

type CommandResult = { ok: true; command: Command } | { ok: false; reason: CommandErrorReason };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

function commandError(index: number, reason: CommandErrorReason): SaveResult {
  return { ok: false, error: { kind: "invalidCommand", index, reason } };
}

function parseCommand(value: unknown): CommandResult {
  if (!isRecord(value)) {
    return { ok: false, reason: "notObject" };
  }
  if (!isIntegerInRange(value.tick, 0, MAX_SAVE_TICK)) {
    return { ok: false, reason: "invalidTick" };
  }
  const tick = asTick(value.tick);
  const kind = value.kind;
  if (typeof kind !== "string") {
    return { ok: false, reason: "unknownKind" };
  }
  switch (kind) {
    case "noop":
      return { ok: true, command: { kind: "noop", tick } };
    case "addGold": {
      if (!isIntegerInRange(value.amount, 0, MAX_GOLD_AMOUNT)) {
        return { ok: false, reason: "invalidAmount" };
      }
      return { ok: true, command: { kind: "addGold", tick, amount: value.amount } };
    }
    case "tag":
    case "untag": {
      if (!isIntegerInRange(value.tile, 0, MAP_WIDTH * MAP_HEIGHT - 1)) {
        return { ok: false, reason: "invalidTile" };
      }
      return { ok: true, command: { kind, tick, tile: asTileIndex(value.tile) } };
    }
    case "paintRoom": {
      if (!isIntegerInRange(value.tile, 0, MAP_WIDTH * MAP_HEIGHT - 1)) {
        return { ok: false, reason: "invalidTile" };
      }
      const room = value.room;
      if (room !== "treasury" && room !== "lair") {
        return { ok: false, reason: "invalidRoom" };
      }
      return { ok: true, command: { kind: "paintRoom", tick, tile: asTileIndex(value.tile), room } };
    }
    case "spawnImp":
      return { ok: true, command: { kind: "spawnImp", tick } };
    case "pickUp":
    case "slap": {
      if (!isIntegerInRange(value.impId, 0, IMP_CAPACITY - 1)) {
        return { ok: false, reason: "invalidImpId" };
      }
      return { ok: true, command: { kind, tick, impId: asImpId(value.impId) } };
    }
    case "drop": {
      if (!isIntegerInRange(value.impId, 0, IMP_CAPACITY - 1)) {
        return { ok: false, reason: "invalidImpId" };
      }
      if (
        !isIntegerInRange(value.tileX, 0, MAP_WIDTH - 1) ||
        !isIntegerInRange(value.tileY, 0, MAP_HEIGHT - 1)
      ) {
        return { ok: false, reason: "invalidDropTile" };
      }
      return {
        ok: true,
        command: {
          kind: "drop",
          tick,
          impId: asImpId(value.impId),
          tileX: value.tileX,
          tileY: value.tileY,
        },
      };
    }
    default:
      return { ok: false, reason: "unknownKind" };
  }
}

export function parseSaveValue(value: unknown): SaveResult {
  if (!isRecord(value)) {
    return { ok: false, error: { kind: "invalidJson" } };
  }
  if (value.version !== SAVE_VERSION) {
    return { ok: false, error: { kind: "invalidVersion" } };
  }
  if (!isIntegerInRange(value.seed, 0, MAX_SAVE_SEED)) {
    return { ok: false, error: { kind: "invalidSeed" } };
  }
  if (!isIntegerInRange(value.tick, 0, MAX_SAVE_TICK)) {
    return { ok: false, error: { kind: "invalidTick" } };
  }
  if (!Array.isArray(value.commands)) {
    return { ok: false, error: { kind: "invalidCommands" } };
  }
  const values: readonly unknown[] = value.commands;
  if (values.length > MAX_SAVE_COMMANDS) {
    return { ok: false, error: { kind: "invalidCommands" } };
  }
  const commands: Command[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const parsed = parseCommand(values[i]);
    if (!parsed.ok) {
      return commandError(i, parsed.reason);
    }
    commands.push(parsed.command);
  }
  const sorted = sortCommands(commands);
  return {
    ok: true,
    save: { version: SAVE_VERSION, seed: value.seed, tick: value.tick, commands: sorted.slice() },
  };
}

export function parseSave(text: string): SaveResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: { kind: "invalidJson" } };
  }
  return parseSaveValue(parsed);
}

export function serializeSave(save: Save): string {
  return JSON.stringify(save);
}

export function buildSave(world: World, commands: readonly Command[]): Save {
  const sorted = sortCommands(commands);
  return {
    version: SAVE_VERSION,
    seed: world.seed,
    tick: world.tick,
    commands: sorted.slice(),
  };
}

export function saveCommandLog(save: Save): CommandLog {
  return requireSorted(save.commands);
}

export function replaySave(save: Save): World {
  const world = createWorld(save.seed);
  const log = saveCommandLog(save);
  while (world.tick < save.tick) {
    step(world, log);
  }
  return world;
}

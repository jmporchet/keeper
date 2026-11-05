import { describe, expect, it } from "vitest";
import { ARRIVE_TICKS, liveCreatureCount } from "./creatures";
import { HERO_ARRIVE_TICKS, liveHeroCount } from "./heroes";
import { asTick, asTileIndex, type TileIndex } from "./ids";
import { HEART_HP, MAP_WIDTH, REPAIR_HEART_COST } from "./map";
import { parseSaveValue } from "./save";
import {
  createWorld,
  hashWorld,
  run,
  sortCommands,
  step,
  type Command,
  type World,
} from "./world";

const LAIR_A = asTileIndex(30 * MAP_WIDTH + 30);
const TREASURY_A = asTileIndex(31 * MAP_WIDTH + 30);

function addGold(tick: number, amount: number): Command {
  return { kind: "addGold", tick: asTick(tick), amount };
}

function paintLair(tick: number, tile: TileIndex): Command {
  return { kind: "paintRoom", tick: asTick(tick), tile, room: "lair" };
}

function repairHeart(tick: number): Command {
  return { kind: "repairHeart", tick: asTick(tick) };
}

function lairSetup(): Command[] {
  return [addGold(0, 1000), paintLair(0, LAIR_A)];
}

function totalGold(world: World): number {
  let total = world.goldStored + world.goldSpent + world.goldPaidOut;
  for (let i = 0; i < world.goldStock.length; i += 1) {
    const stock = world.goldStock[i];
    if (stock !== undefined) {
      total += stock;
    }
  }
  for (let i = 0; i < world.treasuryStock.length; i += 1) {
    const stock = world.treasuryStock[i];
    if (stock !== undefined) {
      total += stock;
    }
  }
  for (let i = 0; i < world.imps.slots.length; i += 1) {
    const slot = world.imps.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live":
        if (slot.imp.carry.kind === "gold") {
          total += slot.imp.carry.amount;
        }
        break;
      default: {
        const never: never = slot;
        throw never;
      }
    }
  }
  return total;
}

describe("heart repair", () => {
  it("restores heart hp and clears the breach when paid from stored gold", () => {
    const world = createWorld(1);
    world.goldStored = REPAIR_HEART_COST;
    world.heartHp = 0;
    world.heartBreached = true;
    const before = totalGold(world);
    step(world, sortCommands([repairHeart(0)]));
    expect(world.heartHp).toBe(HEART_HP);
    expect(world.heartMaxHp).toBe(HEART_HP);
    expect(world.heartBreached).toBe(false);
    expect(world.goldStored).toBe(0);
    expect(world.goldSpent).toBe(REPAIR_HEART_COST);
    expect(totalGold(world)).toBe(before);
  });

  it("pays the remainder from treasury stock when stored gold is short", () => {
    const world = createWorld(1);
    world.goldStored = 40;
    world.treasuryStock[TREASURY_A] = REPAIR_HEART_COST - 40;
    world.heartHp = 0;
    world.heartBreached = true;
    const before = totalGold(world);
    step(world, sortCommands([repairHeart(0)]));
    expect(world.goldStored).toBe(0);
    expect(world.treasuryStock[TREASURY_A]).toBe(0);
    expect(world.goldSpent).toBe(REPAIR_HEART_COST);
    expect(world.heartHp).toBe(HEART_HP);
    expect(world.heartBreached).toBe(false);
    expect(totalGold(world)).toBe(before);
  });

  it("refuses when the heart is not breached", () => {
    const world = createWorld(1);
    world.goldStored = REPAIR_HEART_COST;
    world.heartHp = HEART_HP - 3;
    step(world, sortCommands([repairHeart(0)]));
    expect(world.heartHp).toBe(HEART_HP - 3);
    expect(world.heartBreached).toBe(false);
    expect(world.goldStored).toBe(REPAIR_HEART_COST);
    expect(world.goldSpent).toBe(0);
  });

  it("refuses without partial payment when gold is short", () => {
    const world = createWorld(1);
    world.goldStored = REPAIR_HEART_COST - 1;
    world.heartHp = 0;
    world.heartBreached = true;
    step(world, sortCommands([repairHeart(0)]));
    expect(world.heartHp).toBe(0);
    expect(world.heartBreached).toBe(true);
    expect(world.goldStored).toBe(REPAIR_HEART_COST - 1);
    expect(world.goldSpent).toBe(0);
  });

  it("allows a later hero wave to spawn after repair", () => {
    const base = lairSetup();
    const world = run(1, sortCommands(base), ARRIVE_TICKS + 1);
    expect(liveCreatureCount(world.creatures)).toBe(1);
    world.heartHp = 0;
    world.heartBreached = true;
    const log = sortCommands([...base, repairHeart(world.tick)]);
    step(world, log);
    expect(world.heartHp).toBe(HEART_HP);
    expect(world.heartBreached).toBe(false);
    while (world.tick <= HERO_ARRIVE_TICKS) {
      step(world, log);
    }
    expect(liveCreatureCount(world.creatures)).toBeGreaterThan(0);
    expect(liveHeroCount(world.heroes)).toBeGreaterThan(0);
  });

  it("is deterministic across two repaired runs", () => {
    function repairedHash(): number {
      const base = lairSetup();
      const world = run(1, sortCommands(base), ARRIVE_TICKS + 1);
      world.heartHp = 0;
      world.heartBreached = true;
      const log = sortCommands([...base, repairHeart(world.tick)]);
      for (let i = 0; i < HERO_ARRIVE_TICKS; i += 1) {
        step(world, log);
      }
      return hashWorld(world);
    }
    expect(repairedHash()).toBe(repairedHash());
  });

  it("round-trips repairHeart through save parsing", () => {
    const parsed = parseSaveValue({
      version: 1,
      seed: 1,
      tick: 0,
      commands: [{ kind: "repairHeart", tick: 4 }],
    });
    expect(parsed).toEqual({
      ok: true,
      save: { version: 1, seed: 1, tick: 0, commands: [{ kind: "repairHeart", tick: 4 }] },
    });
  });
});

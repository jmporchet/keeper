import { describe, expect, it } from "vitest";
import { asTick } from "./ids";
import { DEFEAT_TICKS, HEART_HP, REPAIR_HEART_COST } from "./map";
import {
  createWorld,
  hashWorld,
  sortCommands,
  step,
  type Command,
  type World,
} from "./world";

const emptyLog = sortCommands([]);

function breach(world: World): void {
  world.heartHp = 0;
  world.heartBreached = true;
}

function repairHeart(tick: number): Command {
  return { kind: "repairHeart", tick: asTick(tick) };
}

function stepMany(world: World, ticks: number): void {
  for (let i = 0; i < ticks; i += 1) {
    step(world, emptyLog);
  }
}

describe("defeat timer", () => {
  it("does not defeat before DEFEAT_TICKS breached ticks", () => {
    const world = createWorld(1);
    breach(world);
    stepMany(world, DEFEAT_TICKS - 1);
    expect(world.breachTicks).toBe(DEFEAT_TICKS - 1);
    expect(world.defeated).toBe(false);
  });

  it("defeats on the DEFEAT_TICKS-th breached tick and stays defeated", () => {
    const world = createWorld(1);
    breach(world);
    stepMany(world, DEFEAT_TICKS);
    expect(world.breachTicks).toBe(DEFEAT_TICKS);
    expect(world.defeated).toBe(true);
    stepMany(world, 20);
    expect(world.breachTicks).toBe(DEFEAT_TICKS);
    expect(world.defeated).toBe(true);
  });

  it("resets the timer on repair and does not defeat without a new breach", () => {
    const world = createWorld(1);
    breach(world);
    stepMany(world, 20);
    expect(world.breachTicks).toBe(20);
    world.goldStored = REPAIR_HEART_COST;
    step(world, sortCommands([repairHeart(world.tick)]));
    expect(world.heartHp).toBe(HEART_HP);
    expect(world.heartBreached).toBe(false);
    expect(world.breachTicks).toBe(0);
    expect(world.defeated).toBe(false);
    stepMany(world, DEFEAT_TICKS + 20);
    expect(world.breachTicks).toBe(0);
    expect(world.defeated).toBe(false);
  });

  it("refuses repair after defeat", () => {
    const world = createWorld(1);
    breach(world);
    stepMany(world, DEFEAT_TICKS);
    expect(world.defeated).toBe(true);
    world.goldStored = REPAIR_HEART_COST;
    step(world, sortCommands([repairHeart(world.tick)]));
    expect(world.heartHp).toBe(0);
    expect(world.heartBreached).toBe(true);
    expect(world.breachTicks).toBe(DEFEAT_TICKS);
    expect(world.defeated).toBe(true);
    expect(world.goldStored).toBe(REPAIR_HEART_COST);
    expect(world.goldSpent).toBe(0);
  });

  it("hashes breachTicks and defeated", () => {
    const base = createWorld(7);
    breach(base);
    const other = createWorld(7);
    breach(other);
    other.breachTicks = 1;
    expect(hashWorld(base)).not.toBe(hashWorld(other));
    const defeated = createWorld(7);
    breach(defeated);
    defeated.defeated = true;
    expect(hashWorld(base)).not.toBe(hashWorld(defeated));
  });

  it("is deterministic for the same seed and commands including the timer", () => {
    const first = createWorld(11);
    const second = createWorld(11);
    breach(first);
    breach(second);
    stepMany(first, DEFEAT_TICKS - 3);
    stepMany(second, DEFEAT_TICKS - 3);
    expect(first.breachTicks).toBe(second.breachTicks);
    expect(first.defeated).toBe(second.defeated);
    expect(hashWorld(first)).toBe(hashWorld(second));
  });
});

import { describe, expect, it } from "vitest";
import { liveCreatureCount } from "./creatures";
import { createHero, HERO_HP, liveHeroCount } from "./heroes";
import { asTick } from "./ids";
import { liveImpCount } from "./imps";
import { DEFEAT_TICKS, HEART_X, HEART_Y, VICTORY_WAVES } from "./map";
import { restartWorld } from "./restart";
import {
  createWorld,
  hashWorld,
  sortCommands,
  step,
  type CommandLog,
  type World,
} from "./world";

const emptyLog = sortCommands([]);

function stepMany(world: World, ticks: number, log: CommandLog = emptyLog): void {
  for (let i = 0; i < ticks; i += 1) {
    step(world, log);
  }
}

function clearWaves(world: World, count: number): void {
  for (let i = 0; i < count; i += 1) {
    world.heroes.slots[0] = { kind: "live", hero: createHero(0, HEART_X, HEART_Y, HERO_HP) };
    step(world, emptyLog);
    world.heroes.slots[0] = { kind: "empty" };
    step(world, emptyLog);
  }
}

function expectFresh(world: World, seed: number): void {
  const fresh = createWorld(seed);
  expect(world.seed).toBe(seed);
  expect(world.tick).toBe(0);
  expect(hashWorld(world)).toBe(hashWorld(fresh));
  expect(world.defeated).toBe(false);
  expect(world.victorious).toBe(false);
  expect(world.heartBreached).toBe(false);
  expect(world.heartHp).toBe(fresh.heartHp);
  expect(world.wavesCleared).toBe(0);
  expect(world.breachTicks).toBe(0);
  expect(world.commandCursor).toBe(0);
  expect(liveImpCount(world.imps)).toBe(liveImpCount(fresh.imps));
  expect(liveCreatureCount(world.creatures)).toBe(0);
  expect(liveHeroCount(world.heroes)).toBe(0);
}

describe("restart", () => {
  it("rebuilds the same seed from defeat and clears the command log", () => {
    const seed = 12345;
    const defeated = createWorld(seed);
    defeated.heartHp = 0;
    defeated.heartBreached = true;
    const log = sortCommands([{ kind: "addGold", tick: asTick(0), amount: 250 }]);
    stepMany(defeated, DEFEAT_TICKS, log);
    expect(defeated.defeated).toBe(true);
    expect(defeated.goldStored).toBe(250);

    const restarted = restartWorld(defeated.seed);
    expectFresh(restarted.world, seed);
    expect(restarted.commands).toEqual([]);
    expect(restarted.commandLog).toEqual([]);
  });

  it("rebuilds the same seed from victory and clears the command log", () => {
    const seed = 9876;
    const victorious = createWorld(seed);
    const log = sortCommands([{ kind: "addGold", tick: asTick(0), amount: 100 }]);
    step(victorious, log);
    clearWaves(victorious, VICTORY_WAVES);
    expect(victorious.victorious).toBe(true);
    expect(victorious.wavesCleared).toBe(VICTORY_WAVES);

    const restarted = restartWorld(victorious.seed);
    expectFresh(restarted.world, seed);
    expect(restarted.commands).toEqual([]);
    expect(restarted.commandLog).toEqual([]);
  });

  it("does not carry stale creatures, heroes or imps into the restarted world", () => {
    const seed = 4321;
    const world = createWorld(seed);
    world.heroes.slots[0] = { kind: "live", hero: createHero(0, HEART_X, HEART_Y, HERO_HP) };
    step(world, sortCommands([{ kind: "spawnImp", tick: asTick(world.tick) }]));
    expect(liveHeroCount(world.heroes)).toBe(1);
    expect(liveImpCount(world.imps)).toBeGreaterThan(liveImpCount(createWorld(seed).imps));

    const restarted = restartWorld(world.seed);
    expectFresh(restarted.world, seed);
  });
});

import { describe, expect, it } from "vitest";
import { createHero, HERO_HP } from "./heroes";
import { HEART_X, HEART_Y, VICTORY_WAVES } from "./map";
import { createWorld, hashWorld, sortCommands, step, type World } from "./world";

const emptyLog = sortCommands([]);

function spawnWave(world: World): void {
  world.heroes.slots[0] = { kind: "live", hero: createHero(0, HEART_X, HEART_Y, HERO_HP) };
  step(world, emptyLog);
}

function clearWave(world: World): void {
  world.heroes.slots[0] = { kind: "empty" };
  step(world, emptyLog);
}

function clearWaves(world: World, count: number): void {
  for (let i = 0; i < count; i += 1) {
    spawnWave(world);
    clearWave(world);
  }
}

function stepMany(world: World, ticks: number): void {
  for (let i = 0; i < ticks; i += 1) {
    step(world, emptyLog);
  }
}

describe("victory waves", () => {
  it("does not win after clearing fewer than VICTORY_WAVES waves", () => {
    const world = createWorld(1);
    clearWaves(world, VICTORY_WAVES - 1);
    expect(world.wavesCleared).toBe(VICTORY_WAVES - 1);
    expect(world.victorious).toBe(false);
    stepMany(world, 5);
    expect(world.victorious).toBe(false);
  });

  it("wins on the VICTORY_WAVES-th cleared wave and stays victorious", () => {
    const world = createWorld(1);
    clearWaves(world, VICTORY_WAVES);
    expect(world.wavesCleared).toBe(VICTORY_WAVES);
    expect(world.victorious).toBe(true);
    stepMany(world, 20);
    expect(world.wavesCleared).toBe(VICTORY_WAVES);
    expect(world.victorious).toBe(true);
  });

  it("does not count a wave that ends because the heart breached", () => {
    const world = createWorld(1);
    spawnWave(world);
    expect(world.waveActive).toBe(true);
    world.heartHp = 0;
    world.heartBreached = true;
    world.heroes.slots[0] = { kind: "empty" };
    step(world, emptyLog);
    expect(world.wavesCleared).toBe(0);
    expect(world.waveActive).toBe(false);
    expect(world.victorious).toBe(false);
  });

  it("refuses repair after victory", () => {
    const world = createWorld(1);
    clearWaves(world, VICTORY_WAVES);
    expect(world.victorious).toBe(true);
    world.heartHp = 0;
    world.heartBreached = true;
    world.goldStored = 100;
    step(world, sortCommands([{ kind: "repairHeart", tick: world.tick }]));
    expect(world.heartHp).toBe(0);
    expect(world.heartBreached).toBe(true);
    expect(world.victorious).toBe(true);
    expect(world.goldStored).toBe(100);
  });

  it("hashes wavesCleared and victorious", () => {
    const base = createWorld(7);
    const cleared = createWorld(7);
    cleared.wavesCleared = 1;
    expect(hashWorld(base)).not.toBe(hashWorld(cleared));
    const won = createWorld(7);
    won.victorious = true;
    expect(hashWorld(base)).not.toBe(hashWorld(won));
  });

  it("is deterministic for the same seed and cleared waves", () => {
    const first = createWorld(11);
    const second = createWorld(11);
    clearWaves(first, VICTORY_WAVES);
    clearWaves(second, VICTORY_WAVES);
    expect(first.wavesCleared).toBe(second.wavesCleared);
    expect(first.victorious).toBe(second.victorious);
    expect(hashWorld(first)).toBe(hashWorld(second));
  });
});

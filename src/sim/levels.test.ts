import { describe, expect, it } from "vitest";
import {
  CREATURE_HP_PER_LEVEL,
  CREATURE_MAX_LEVEL,
  LIBRARY_TRAIN_TICKS,
  TRAIN_TICKS,
  beginTraining,
  creatureMeleeDamage,
  createCreature,
  finishTraining,
  trainingTicksForLevel,
  type Creature,
} from "./creatures";
import { COMBAT_DAMAGE, createHero } from "./heroes";
import { asTick, asTileIndex, type TileIndex } from "./ids";
import {
  createWorld,
  hashWorld,
  MAP_WIDTH,
  run,
  sortCommands,
  step,
  type Command,
  type World,
} from "./world";

const LAIR_A = asTileIndex(30 * MAP_WIDTH + 30);
const TRAIN_A = asTileIndex(30 * MAP_WIDTH + 31);
const LIBRARY_A = asTileIndex(30 * MAP_WIDTH + 32);

function addGold(tick: number, amount: number): Command {
  return { kind: "addGold", tick: asTick(tick), amount };
}

function paint(tick: number, tile: TileIndex, room: "lair" | "training" | "library"): Command {
  return { kind: "paintRoom", tick: asTick(tick), tile, room };
}

function creatures(world: World): Creature[] {
  const result: Creature[] = [];
  for (let i = 0; i < world.creatures.slots.length; i += 1) {
    const slot = world.creatures.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live":
        result.push(slot.creature);
        break;
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  return result;
}

function clearHeroes(world: World): void {
  for (let i = 0; i < world.heroes.slots.length; i += 1) {
    world.heroes.slots[i] = { kind: "empty" };
  }
}

function clearImps(world: World): void {
  for (let i = 0; i < world.imps.slots.length; i += 1) {
    world.imps.slots[i] = { kind: "empty" };
  }
  world.imps.liveCount = 0;
}

describe("creature levels", () => {
  it("caps training at level three and stops re-training", () => {
    const world = createWorld(1);
    const commands = sortCommands([
      addGold(0, 5000),
      paint(0, LAIR_A, "lair"),
      paint(0, TRAIN_A, "training"),
      paint(0, LIBRARY_A, "library"),
    ]);
    let reached = -1;
    let creature: Creature | undefined;
    for (let t = 0; t < 2000; t += 1) {
      step(world, commands);
      clearHeroes(world);
      creature = creatures(world)[0];
      if (creature === undefined) {
        continue;
      }
      if (creature.level >= CREATURE_MAX_LEVEL) {
        if (reached < 0) {
          reached = world.tick;
        }
        expect(creature.level).toBe(CREATURE_MAX_LEVEL);
        expect(creature.state.kind === "toTraining" || creature.state.kind === "training").toBe(false);
        if (world.tick - reached > 100) {
          break;
        }
      }
    }
    expect(reached).toBeGreaterThanOrEqual(0);
    expect(creature?.level).toBe(CREATURE_MAX_LEVEL);
  });

  it("scales training ticks by the starting level with and without a library", () => {
    const boostedWorld = run(
      1,
      sortCommands([addGold(0, 1000), paint(0, LIBRARY_A, "library")]),
      2,
    );
    const boosted = createCreature(0, 30, 30, LAIR_A, "fly");
    boostedWorld.creatures.slots[0] = { kind: "live", creature: boosted };
    const plainWorld = run(1, sortCommands([addGold(0, 1000)]), 2);
    const plain = createCreature(0, 30, 30, LAIR_A, "fly");
    plainWorld.creatures.slots[0] = { kind: "live", creature: plain };
    for (let level = 0; level < CREATURE_MAX_LEVEL; level += 1) {
      boosted.level = level;
      beginTraining(boostedWorld, boosted, TRAIN_A);
      expect(boosted.training.remaining).toBe(LIBRARY_TRAIN_TICKS * (level + 1));
      plain.level = level;
      beginTraining(plainWorld, plain, TRAIN_A);
      expect(plain.training.remaining).toBe(TRAIN_TICKS * (level + 1));
      expect(trainingTicksForLevel(level, true)).toBe(LIBRARY_TRAIN_TICKS * (level + 1));
      expect(trainingTicksForLevel(level, false)).toBe(TRAIN_TICKS * (level + 1));
    }
  });

  it("adds HP and max HP on every level-up and refuses a fourth", () => {
    const world = createWorld(1);
    const creature = createCreature(0, 30, 30, LAIR_A, "fly");
    world.creatures.slots[0] = { kind: "live", creature };
    const hp = creature.hp;
    const maxHp = creature.maxHp;
    for (let level = 1; level <= CREATURE_MAX_LEVEL; level += 1) {
      finishTraining(world, creature);
      expect(creature.level).toBe(level);
      expect(creature.hp).toBe(hp + level * CREATURE_HP_PER_LEVEL);
      expect(creature.maxHp).toBe(maxHp + level * CREATURE_HP_PER_LEVEL);
    }
    finishTraining(world, creature);
    expect(creature.level).toBe(CREATURE_MAX_LEVEL);
    expect(creature.hp).toBe(hp + CREATURE_MAX_LEVEL * CREATURE_HP_PER_LEVEL);
    expect(creature.maxHp).toBe(maxHp + CREATURE_MAX_LEVEL * CREATURE_HP_PER_LEVEL);
  });

  it("scales creature melee damage by level while imps and heroes stay flat", () => {
    expect(creatureMeleeDamage(0)).toBe(COMBAT_DAMAGE);
    expect(creatureMeleeDamage(1)).toBe(COMBAT_DAMAGE);
    expect(creatureMeleeDamage(2)).toBe(2);
    expect(creatureMeleeDamage(3)).toBe(3);
  });

  it("hashes level two and level three differently", () => {
    const two = createWorld(1);
    const twoCreature = createCreature(0, 30, 30, LAIR_A, "fly");
    twoCreature.level = 2;
    two.creatures.slots[0] = { kind: "live", creature: twoCreature };
    const three = createWorld(1);
    const threeCreature = createCreature(0, 30, 30, LAIR_A, "fly");
    threeCreature.level = 3;
    three.creatures.slots[0] = { kind: "live", creature: threeCreature };
    expect(twoCreature.hp).toBe(threeCreature.hp);
    expect(twoCreature.maxHp).toBe(threeCreature.maxHp);
    expect(hashWorld(two)).not.toBe(hashWorld(three));
  });

  it("deals level three melee damage to an adjacent hero", () => {
    const world = createWorld(1);
    const creature = createCreature(0, 30, 30, LAIR_A, "fly");
    creature.level = 3;
    creature.hp = 20;
    creature.maxHp = 20;
    creature.state = creature.sleeping;
    world.creatures.slots[0] = { kind: "live", creature };
    const hero = createHero(0, 31, 30, 10);
    world.heroes.slots[0] = { kind: "live", hero };
    clearImps(world);
    const heroHp = hero.hp;
    step(world, sortCommands([]));
    expect(hero.hp).toBe(heroHp - creatureMeleeDamage(3));
    expect(creature.hp).toBe(19);
  });
});

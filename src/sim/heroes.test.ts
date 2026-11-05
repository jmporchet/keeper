import { describe, expect, it } from "vitest";
import { beginWander, freeBedTiles, liveCreatureCount, type Creature } from "./creatures";
import {
  FIGHT_TICKS,
  HERO_ARRIVE_TICKS,
  HERO_PARTY_SIZE,
  liveHeroCount,
  type Hero,
} from "./heroes";
import { asTick, asTileIndex, type TileIndex } from "./ids";
import { liveImpCount } from "./imps";
import { sortCommands, hashWorld, MAP_WIDTH, run, step, type Command, type World } from "./world";

const LAIR_A = asTileIndex(30 * MAP_WIDTH + 30);

function addGold(tick: number, amount: number): Command {
  return { kind: "addGold", tick: asTick(tick), amount };
}

function paintLair(tick: number, tile: TileIndex): Command {
  return { kind: "paintRoom", tick: asTick(tick), tile, room: "lair" };
}

function lairSetup(): Command[] {
  return [addGold(0, 1000), paintLair(0, LAIR_A)];
}

function liveHero(world: World, index: number): Hero {
  const slot = world.heroes.slots[index];
  if (slot === undefined) {
    throw new Error("missing hero slot");
  }
  switch (slot.kind) {
    case "empty":
      throw new Error("empty hero slot");
    case "live":
      return slot.hero;
    default: {
      const never: never = slot;
      return never;
    }
  }
}

function liveCreature(world: World, index: number): Creature {
  const slot = world.creatures.slots[index];
  if (slot === undefined) {
    throw new Error("missing creature slot");
  }
  switch (slot.kind) {
    case "empty":
      throw new Error("empty creature slot");
    case "live":
      return slot.creature;
    default: {
      const never: never = slot;
      return never;
    }
  }
}

function heroSlotIsEmpty(world: World, index: number): boolean {
  const slot = world.heroes.slots[index];
  if (slot === undefined) {
    return true;
  }
  switch (slot.kind) {
    case "empty":
      return true;
    case "live":
      return false;
    default: {
      const never: never = slot;
      return never;
    }
  }
}

describe("hero invasion", () => {
  it("does not spawn without a live creature", () => {
    const world = run(1, sortCommands([]), HERO_ARRIVE_TICKS * 3 + 1);
    expect(liveHeroCount(world.heroes)).toBe(0);
  });

  it("spawns one party at the portal on the arrival tick when a creature exists", () => {
    const commands = sortCommands(lairSetup());
    const before = run(1, commands, HERO_ARRIVE_TICKS);
    expect(liveCreatureCount(before.creatures)).toBe(1);
    expect(liveHeroCount(before.heroes)).toBe(0);
    const after = run(1, commands, HERO_ARRIVE_TICKS + 1);
    expect(liveHeroCount(after.heroes)).toBe(HERO_PARTY_SIZE);
    const first = liveHero(after, 0);
    const second = liveHero(after, 1);
    expect(first.tileX).toBe(32);
    expect(first.tileY).toBe(35);
    expect(second.tileY).toBe(34);
  });

  it("moves a hero toward the nearest creature", () => {
    const world = run(1, sortCommands(lairSetup()), HERO_ARRIVE_TICKS + 1);
    const hero = liveHero(world, 0);
    const startX = hero.tileX;
    const startY = hero.tileY;
    for (let i = 0; i < 30; i += 1) {
      step(world, sortCommands(lairSetup()));
    }
    expect(hero.tileX !== startX || hero.tileY !== startY).toBe(true);
  });

  it("damages both sides when a hero and a creature fight", () => {
    const world = run(1, sortCommands(lairSetup()), HERO_ARRIVE_TICKS + 1);
    const hero = liveHero(world, 0);
    const creature = liveCreature(world, 0);
    creature.state = creature.sleeping;
    hero.tileX = creature.tileX + 1;
    hero.tileY = creature.tileY;
    hero.attackCooldown = 0;
    creature.attackCooldown = 0;
    const creatureHp = creature.hp;
    const heroHp = hero.hp;
    step(world, sortCommands(lairSetup()));
    expect(creature.hp).toBeLessThan(creatureHp);
    expect(hero.hp).toBeLessThan(heroHp);
  });

  it("damages a wandering creature", () => {
    const world = run(1, sortCommands(lairSetup()), HERO_ARRIVE_TICKS + 1);
    const hero = liveHero(world, 0);
    const creature = liveCreature(world, 0);
    creature.state = creature.sleeping;
    expect(beginWander(world, creature)).toBe(true);
    expect(creature.state.kind).toBe("wandering");
    hero.tileX = creature.tileX + 1;
    hero.tileY = creature.tileY;
    hero.attackCooldown = 0;
    creature.attackCooldown = FIGHT_TICKS;
    const creatureHp = creature.hp;
    step(world, sortCommands(lairSetup()));
    expect(creature.hp).toBeLessThan(creatureHp);
  });

  it("frees a creature bed when a hero kills it", () => {
    const world = run(1, sortCommands(lairSetup()), HERO_ARRIVE_TICKS + 1);
    const hero = liveHero(world, 0);
    const creature = liveCreature(world, 0);
    const bed = creature.bedTile;
    creature.state = creature.sleeping;
    creature.hp = 1;
    hero.tileX = creature.tileX + 1;
    hero.tileY = creature.tileY;
    hero.attackCooldown = 0;
    creature.attackCooldown = FIGHT_TICKS;
    step(world, sortCommands(lairSetup()));
    expect(liveCreatureCount(world.creatures)).toBe(0);
    expect(freeBedTiles(world)).toContain(bed);
  });

  it("damages an imp and clears its slot when no creature remains", () => {
    const world = run(1, sortCommands(lairSetup()), HERO_ARRIVE_TICKS + 1);
    const hero = liveHero(world, 0);
    world.creatures.slots[0] = { kind: "empty" };
    const impIndex = 0;
    const impSlot = world.imps.slots[impIndex];
    if (impSlot === undefined || impSlot.kind !== "live") {
      throw new Error("missing live imp");
    }
    const imp = impSlot.imp;
    imp.hp = 1;
    imp.state = imp.idle;
    hero.tileX = imp.tileX + 1;
    hero.tileY = imp.tileY;
    hero.state = hero.marching;
    hero.attackCooldown = 0;
    const before = liveImpCount(world.imps);
    step(world, sortCommands(lairSetup()));
    expect(liveImpCount(world.imps)).toBe(before - 1);
    const after = world.imps.slots[impIndex];
    expect(after === undefined || after.kind === "empty").toBe(true);
  });

  it("clears a hero slot when a creature kills it", () => {
    const world = run(1, sortCommands(lairSetup()), HERO_ARRIVE_TICKS + 1);
    const hero = liveHero(world, 0);
    const creature = liveCreature(world, 0);
    creature.state = creature.sleeping;
    hero.tileX = creature.tileX + 1;
    hero.tileY = creature.tileY;
    hero.hp = 1;
    hero.attackCooldown = FIGHT_TICKS;
    creature.attackCooldown = 0;
    step(world, sortCommands(lairSetup()));
    expect(heroSlotIsEmpty(world, 0)).toBe(true);
  });

  it("is deterministic after 10000 ticks with heroes, creatures and imps", () => {
    const commands = sortCommands(lairSetup());
    const a = hashWorld(run(9, commands, 10000));
    const b = hashWorld(run(9, commands, 10000));
    expect(a).toBe(b);
    expect(a).not.toBe(hashWorld(run(9, sortCommands([addGold(0, 1000)]), 10000)));
  });
});

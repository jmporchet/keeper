import { describe, expect, it } from "vitest";
import { ARRIVE_TICKS, BEETLE_HP, beginWander, freeBedTiles, liveCreatureCount, type Creature } from "./creatures";
import {
  COMBAT_DAMAGE,
  FIGHT_TICKS,
  HERO_ARRIVE_TICKS,
  HERO_HP,
  HERO_PARTY_SIZE,
  HERO_WAVE_HP_CAP,
  HERO_WAVE_PARTY_CAP,
  liveHeroCount,
  type Hero,
} from "./heroes";
import { asTick, asTileIndex, type TileIndex } from "./ids";
import { liveImpCount } from "./imps";
import { HEART_HP, HEART_X, HEART_Y, REPAIR_HEART_COST } from "./map";
import {
  createWorld,
  sortCommands,
  hashWorld,
  MAP_WIDTH,
  run,
  step,
  type Command,
  type World,
} from "./world";

const LAIR_A = asTileIndex(30 * MAP_WIDTH + 30);

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

function clearCreatures(world: World): void {
  for (let i = 0; i < world.creatures.slots.length; i += 1) {
    world.creatures.slots[i] = { kind: "empty" };
  }
}

function clearImps(world: World): void {
  for (let i = 0; i < world.imps.slots.length; i += 1) {
    world.imps.slots[i] = { kind: "empty" };
  }
}

function distanceToHeart(hero: Hero): number {
  return Math.abs(hero.tileX - HEART_X) + Math.abs(hero.tileY - HEART_Y);
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
    expect(after.repairsDone).toBe(0);
    expect(first.hp).toBe(HERO_HP);
    expect(first.maxHp).toBe(HERO_HP);
    expect(second.hp).toBe(HERO_HP);
    expect(second.maxHp).toBe(HERO_HP);
  });

  it("paths toward the heart when no adjacent foe exists", () => {
    const commands = sortCommands(lairSetup());
    const world = run(1, commands, HERO_ARRIVE_TICKS + 1);
    const hero = liveHero(world, 0);
    expect(hero.state.kind).toBe("marching");
    if (hero.state.kind !== "marching") {
      throw new Error("hero did not start marching");
    }
    expect(hero.state.goal).toBe("heart");
    const startDistance = distanceToHeart(hero);
    for (let i = 0; i < 12; i += 1) {
      step(world, commands);
    }
    expect(distanceToHeart(hero)).toBeLessThan(startDistance);
  });

  it("fights an adjacent foe and then resumes marching to the heart", () => {
    const commands = sortCommands(lairSetup());
    const world = run(1, commands, HERO_ARRIVE_TICKS + 1);
    const hero = liveHero(world, 0);
    const creature = liveCreature(world, 0);
    clearImps(world);
    const bedY = (creature.bedTile / MAP_WIDTH) | 0;
    const bedX = creature.bedTile - bedY * MAP_WIDTH;
    creature.tileX = bedX;
    creature.tileY = bedY;
    creature.state = creature.sleeping;
    creature.hp = 1;
    creature.attackCooldown = FIGHT_TICKS;
    hero.tileX = bedX + 1;
    hero.tileY = bedY;
    hero.state = hero.marching;
    hero.marching.goal = "heart";
    hero.attackCooldown = 0;
    step(world, commands);
    expect(liveCreatureCount(world.creatures)).toBe(0);
    expect(hero.state.kind).toBe("fighting");
    step(world, commands);
    expect(hero.state.kind).toBe("marching");
    if (hero.state.kind !== "marching") {
      throw new Error("hero did not resume marching");
    }
    expect(hero.state.goal).toBe("heart");
    const startDistance = distanceToHeart(hero);
    for (let i = 0; i < 12; i += 1) {
      step(world, commands);
    }
    expect(distanceToHeart(hero)).toBeLessThan(startDistance);
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

  it("damages a beetle and frees its bed when it dies", () => {
    const world = run(1, sortCommands(lairSetup()), HERO_ARRIVE_TICKS + 1);
    const hero = liveHero(world, 0);
    const creature = liveCreature(world, 0);
    const bed = creature.bedTile;
    creature.kind = "beetle";
    creature.hp = BEETLE_HP;
    creature.maxHp = BEETLE_HP;
    creature.state = creature.sleeping;
    hero.tileX = creature.tileX + 1;
    hero.tileY = creature.tileY;
    hero.attackCooldown = 0;
    creature.attackCooldown = FIGHT_TICKS;
    const before = creature.hp;
    step(world, sortCommands(lairSetup()));
    expect(creature.hp).toBe(before - COMBAT_DAMAGE);
    creature.hp = 1;
    hero.attackCooldown = 0;
    step(world, sortCommands(lairSetup()));
    expect(liveCreatureCount(world.creatures)).toBe(0);
    expect(freeBedTiles(world)).toContain(bed);
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

  it("damages the heart when a hero is on it and breaches it at zero", () => {
    const commands = sortCommands(lairSetup());
    const world = run(1, commands, HERO_ARRIVE_TICKS + 1);
    clearCreatures(world);
    clearImps(world);
    const hero = liveHero(world, 0);
    hero.tileX = HEART_X;
    hero.tileY = HEART_Y;
    hero.state = hero.marching;
    hero.marching.goal = "heart";
    hero.attackCooldown = 0;
    const before = world.heartHp;
    step(world, commands);
    expect(world.heartHp).toBe(before - COMBAT_DAMAGE);
    world.heartHp = 1;
    hero.attackCooldown = 0;
    step(world, commands);
    expect(world.heartHp).toBe(0);
    expect(world.heartBreached).toBe(true);
    expect(hero.state.kind).toBe("leaving");
    for (let i = 0; i < 40; i += 1) {
      step(world, commands);
    }
    expect(liveHeroCount(world.heroes)).toBe(0);
  });

  it("refuses new waves after the heart is breached while a creature lives", () => {
    const commands = sortCommands(lairSetup());
    const world = run(1, commands, HERO_ARRIVE_TICKS + 1);
    clearImps(world);
    const hero = liveHero(world, 0);
    hero.tileX = HEART_X;
    hero.tileY = HEART_Y;
    hero.state = hero.marching;
    hero.marching.goal = "heart";
    hero.attackCooldown = 0;
    world.heartHp = 1;
    step(world, commands);
    expect(world.heartBreached).toBe(true);
    while (world.tick < HERO_ARRIVE_TICKS * 2 + 1) {
      step(world, commands);
    }
    expect(liveCreatureCount(world.creatures)).toBeGreaterThan(0);
    expect(liveHeroCount(world.heroes)).toBe(0);
  });

  it("escalates the next wave after a successful repair", () => {
    const base = lairSetup();
    const world = run(1, sortCommands(base), ARRIVE_TICKS + 1);
    expect(liveCreatureCount(world.creatures)).toBe(1);
    expect(liveHeroCount(world.heroes)).toBe(0);
    world.heartHp = 0;
    world.heartBreached = true;
    const log = sortCommands([...base, repairHeart(world.tick)]);
    step(world, log);
    expect(world.repairsDone).toBe(1);
    expect(world.heartBreached).toBe(false);
    while (world.tick < HERO_ARRIVE_TICKS) {
      step(world, log);
    }
    step(world, log);
    expect(liveHeroCount(world.heroes)).toBe(HERO_PARTY_SIZE + 1);
    const hero = liveHero(world, 0);
    expect(hero.maxHp).toBe(HERO_HP + 1);
    expect(hero.hp).toBeLessThanOrEqual(HERO_HP + 1);
  });

  it("caps wave party size and hero hp after many repairs", () => {
    const base = lairSetup();
    const world = run(1, sortCommands(base), ARRIVE_TICKS + 1);
    expect(liveCreatureCount(world.creatures)).toBe(1);
    const repairs: Command[] = [];
    for (let i = 0; i < 10; i += 1) {
      repairs.push(repairHeart(ARRIVE_TICKS + 1 + i));
    }
    const log = sortCommands([...base, ...repairs]);
    for (let i = 0; i < repairs.length; i += 1) {
      world.heartHp = 0;
      world.heartBreached = true;
      world.goldStored = REPAIR_HEART_COST + 1000;
      step(world, log);
    }
    expect(world.repairsDone).toBe(10);
    expect(liveHeroCount(world.heroes)).toBe(0);
    while (world.tick < HERO_ARRIVE_TICKS) {
      step(world, log);
    }
    step(world, log);
    expect(liveHeroCount(world.heroes)).toBe(HERO_WAVE_PARTY_CAP);
    for (let i = 0; i < HERO_WAVE_PARTY_CAP; i += 1) {
      const hero = liveHero(world, i);
      expect(hero.maxHp).toBe(HERO_WAVE_HP_CAP);
      expect(hero.hp).toBeLessThanOrEqual(HERO_WAVE_HP_CAP);
    }
  });

  it("includes heart hp and breach in the world hash", () => {
    const world = createWorld(1);
    const before = hashWorld(world);
    world.heartHp = HEART_HP - 1;
    const damaged = hashWorld(world);
    expect(damaged).not.toBe(before);
    world.heartHp = 0;
    world.heartBreached = true;
    expect(hashWorld(world)).not.toBe(damaged);
  });

  it("includes repairsDone in the world hash", () => {
    const world = createWorld(1);
    const before = hashWorld(world);
    world.repairsDone = 1;
    expect(hashWorld(world)).not.toBe(before);
    world.repairsDone = 2;
    expect(hashWorld(world)).not.toBe(before);
  });

  it("is deterministic after 10000 ticks with heroes, creatures and imps", () => {
    const commands = sortCommands(lairSetup());
    const a = hashWorld(run(9, commands, 10000));
    const b = hashWorld(run(9, commands, 10000));
    expect(a).toBe(b);
    expect(a).not.toBe(hashWorld(run(9, sortCommands([addGold(0, 1000)]), 10000)));
  });
});

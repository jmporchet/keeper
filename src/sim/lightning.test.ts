import { describe, expect, it } from "vitest";
import { createHero, EMPTY_IMP_SLOT, HERO_HP, type Hero } from "./heroes";
import { asHeroId, asTick } from "./ids";
import {
  LIGHTNING_COOLDOWN_TICKS,
  LIGHTNING_COST,
  LIGHTNING_DAMAGE,
} from "./lightning";
import { parseSaveValue } from "./save";
import {
  createWorld,
  hashWorld,
  sortCommands,
  step,
  type Command,
  type World,
} from "./world";

function addHero(world: World, index: number, maxHp: number): Hero {
  const hero = createHero(index, 32, 30, maxHp);
  world.heroes.slots[index] = { kind: "live", hero };
  return hero;
}

function clearImps(world: World): void {
  for (let i = 0; i < world.imps.slots.length; i += 1) {
    world.imps.slots[i] = EMPTY_IMP_SLOT;
  }
}

function cast(tick: number, heroId: number): Command {
  return { kind: "castLightning", tick: asTick(tick), heroId: asHeroId(heroId) };
}

function stepCommands(world: World, commands: Command[]): void {
  world.commandCursor = 0;
  step(world, sortCommands(commands));
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
        return never;
      }
    }
  }
  return total;
}

describe("spell lightning", () => {
  it("refuses when gold is short and mutates nothing", () => {
    const world = createWorld(1);
    clearImps(world);
    const hero = addHero(world, 0, HERO_HP);
    world.goldStored = LIGHTNING_COST - 1;
    const hp = hero.hp;
    stepCommands(world, [cast(0, hero.id)]);
    expect(hero.hp).toBe(hp);
    expect(world.goldStored).toBe(LIGHTNING_COST - 1);
    expect(world.goldSpent).toBe(0);
    expect(world.lightningCooldown).toBe(0);
  });

  it("refuses an empty hero slot", () => {
    const world = createWorld(1);
    world.goldStored = LIGHTNING_COST;
    stepCommands(world, [cast(0, 3)]);
    expect(world.goldStored).toBe(LIGHTNING_COST);
    expect(world.goldSpent).toBe(0);
    expect(world.lightningCooldown).toBe(0);
  });

  it("refuses after defeat and victory", () => {
    const defeated = createWorld(1);
    clearImps(defeated);
    const defeatedHero = addHero(defeated, 0, HERO_HP);
    defeated.goldStored = LIGHTNING_COST;
    defeated.defeated = true;
    stepCommands(defeated, [cast(0, defeatedHero.id)]);
    expect(defeatedHero.hp).toBe(HERO_HP);
    expect(defeated.goldSpent).toBe(0);
    expect(defeated.lightningCooldown).toBe(0);

    const victorious = createWorld(1);
    clearImps(victorious);
    const victoriousHero = addHero(victorious, 0, HERO_HP);
    victorious.goldStored = LIGHTNING_COST;
    victorious.victorious = true;
    stepCommands(victorious, [cast(0, victoriousHero.id)]);
    expect(victoriousHero.hp).toBe(HERO_HP);
    expect(victorious.goldSpent).toBe(0);
    expect(victorious.lightningCooldown).toBe(0);
  });

  it("applies damage exactly once and blocks a second cast in the same tick", () => {
    const world = createWorld(1);
    clearImps(world);
    const hero = addHero(world, 0, 10);
    world.goldStored = 1000;
    stepCommands(world, [cast(0, hero.id), cast(0, hero.id)]);
    expect(hero.hp).toBe(10 - LIGHTNING_DAMAGE);
    expect(world.goldStored).toBe(1000 - LIGHTNING_COST);
    expect(world.goldSpent).toBe(LIGHTNING_COST);
    expect(world.lightningCooldown).toBe(LIGHTNING_COOLDOWN_TICKS - 1);
  });

  it("blocks a recast until the cooldown elapses and then allows it", () => {
    const world = createWorld(1);
    clearImps(world);
    const hero = addHero(world, 0, 10);
    world.goldStored = 1000;
    stepCommands(world, [cast(0, hero.id)]);
    expect(hero.hp).toBe(10 - LIGHTNING_DAMAGE);
    expect(world.lightningCooldown).toBe(LIGHTNING_COOLDOWN_TICKS - 1);

    stepCommands(world, [cast(world.tick, hero.id)]);
    expect(hero.hp).toBe(10 - LIGHTNING_DAMAGE);
    expect(world.goldSpent).toBe(LIGHTNING_COST);
    expect(world.lightningCooldown).toBe(LIGHTNING_COOLDOWN_TICKS - 2);

    while (world.lightningCooldown > 0) {
      stepCommands(world, []);
    }
    expect(world.lightningCooldown).toBe(0);

    stepCommands(world, [cast(world.tick, hero.id)]);
    expect(hero.hp).toBe(10 - LIGHTNING_DAMAGE * 2);
    expect(world.goldStored).toBe(1000 - LIGHTNING_COST * 2);
    expect(world.goldSpent).toBe(LIGHTNING_COST * 2);
    expect(world.lightningCooldown).toBe(LIGHTNING_COOLDOWN_TICKS - 1);
  });

  it("clears the hero slot when damage reaches zero hp", () => {
    const world = createWorld(1);
    clearImps(world);
    const hero = addHero(world, 0, LIGHTNING_DAMAGE);
    world.goldStored = LIGHTNING_COST;
    stepCommands(world, [cast(0, hero.id)]);
    expect(world.heroes.slots[0]?.kind).toBe("empty");
    expect(world.goldSpent).toBe(LIGHTNING_COST);
    expect(world.lightningCooldown).toBe(LIGHTNING_COOLDOWN_TICKS - 1);
  });

  it("conserves gold and records the cost as spent", () => {
    const world = createWorld(1);
    clearImps(world);
    const hero = addHero(world, 0, HERO_HP);
    stepCommands(world, [{ kind: "addGold", tick: asTick(0), amount: 1000 }]);
    const before = totalGold(world);
    const storedBefore = world.goldStored;
    stepCommands(world, [cast(world.tick, hero.id)]);
    expect(totalGold(world)).toBe(before);
    expect(world.goldStored).toBe(storedBefore - LIGHTNING_COST);
    expect(world.goldSpent).toBe(LIGHTNING_COST);
  });

  it("ticks the cooldown down by one each step and hashes it", () => {
    const world = createWorld(1);
    world.lightningCooldown = 3;
    stepCommands(world, []);
    expect(world.lightningCooldown).toBe(2);
    stepCommands(world, []);
    expect(world.lightningCooldown).toBe(1);
    stepCommands(world, []);
    expect(world.lightningCooldown).toBe(0);
    stepCommands(world, []);
    expect(world.lightningCooldown).toBe(0);

    const base = createWorld(7);
    const cooling = createWorld(7);
    cooling.lightningCooldown = 1;
    expect(hashWorld(base)).not.toBe(hashWorld(cooling));
  });

  it("round-trips castLightning through save parsing", () => {
    expect(
      parseSaveValue({
        version: 1,
        seed: 1,
        tick: 0,
        commands: [{ kind: "castLightning", tick: 4, heroId: 2 }],
      }),
    ).toEqual({
      ok: true,
      save: { version: 1, seed: 1, tick: 0, commands: [{ kind: "castLightning", tick: 4, heroId: 2 }] },
    });
  });
});

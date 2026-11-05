import {
  beginFighting,
  beginMarching,
  captureHeroCurr,
  captureHeroPrev,
  COMBAT_DAMAGE,
  EMPTY_CREATURE_SLOT,
  EMPTY_HERO_SLOT,
  EMPTY_IMP_SLOT,
  FIGHT_TICKS,
  heroMarchStep,
  liveCreatureExists,
  tryHeroArrival,
  type Hero,
} from "./heroes";
import { removeOccupancy, workerOf, type Imp } from "./imps";
import { releaseWorker } from "./jobs";
import type { World } from "./worldCore";

export function stepHeroes(world: World): void {
  tryHeroArrival(world);
  const slots = world.heroes.slots;
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live":
        stepLiveHero(world, slot.hero);
        break;
      default: {
        const never: never = slot;
        throw never;
      }
    }
  }
}

function stepLiveHero(world: World, hero: Hero): void {
  captureHeroPrev(hero);
  const state = hero.state;
  switch (state.kind) {
    case "marching":
      if (heroHasAdjacentEnemy(world, hero)) {
        beginFighting(hero);
        break;
      }
      heroMarchStep(world, hero);
      break;
    case "fighting":
      if (!heroHasAdjacentEnemy(world, hero)) {
        beginMarching(hero);
      }
      break;
    default: {
      const never: never = state;
      throw never;
    }
  }
  captureHeroCurr(hero);
}

function isAdjacent(ax: number, ay: number, bx: number, by: number): boolean {
  let dx = ax - bx;
  let dy = ay - by;
  if (dx < 0) {
    dx = -dx;
  }
  if (dy < 0) {
    dy = -dy;
  }
  return dx + dy <= 1;
}

function adjacentCreatureIndex(world: World, hero: Hero): number {
  const slots = world.creatures.slots;
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live": {
        const creature = slot.creature;
        if (isAdjacent(hero.tileX, hero.tileY, creature.tileX, creature.tileY)) {
          return i;
        }
        break;
      }
      default: {
        const never: never = slot;
        throw never;
      }
    }
  }
  return -1;
}

function adjacentImpIndex(world: World, hero: Hero): number {
  const slots = world.imps.slots;
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live": {
        const imp = slot.imp;
        if (imp.state.kind === "held") {
          break;
        }
        if (isAdjacent(hero.tileX, hero.tileY, imp.tileX, imp.tileY)) {
          return i;
        }
        break;
      }
      default: {
        const never: never = slot;
        throw never;
      }
    }
  }
  return -1;
}

function adjacentHeroIndex(world: World, tileX: number, tileY: number): number {
  const slots = world.heroes.slots;
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live": {
        const hero = slot.hero;
        if (isAdjacent(tileX, tileY, hero.tileX, hero.tileY)) {
          return i;
        }
        break;
      }
      default: {
        const never: never = slot;
        throw never;
      }
    }
  }
  return -1;
}

function heroHasAdjacentEnemy(world: World, hero: Hero): boolean {
  if (adjacentCreatureIndex(world, hero) >= 0) {
    return true;
  }
  if (liveCreatureExists(world)) {
    return false;
  }
  return adjacentImpIndex(world, hero) >= 0;
}

function killImp(world: World, index: number, imp: Imp): void {
  releaseWorker(world.jobs, workerOf(imp));
  removeOccupancy(world.imps, imp.tileY * world.width + imp.tileX);
  if (imp.carry.kind === "gold") {
    world.goldStored += imp.carry.amount;
  }
  world.imps.slots[index] = EMPTY_IMP_SLOT;
  if (world.imps.liveCount > 0) {
    world.imps.liveCount -= 1;
  }
}

function resolveHeroAttacks(world: World): void {
  const slots = world.heroes.slots;
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live": {
        const hero = slot.hero;
        if (hero.hp <= 0) {
          break;
        }
        if (hero.attackCooldown > 0) {
          hero.attackCooldown -= 1;
        }
        if (hero.attackCooldown > 0) {
          break;
        }
        const creatureIndex = adjacentCreatureIndex(world, hero);
        if (creatureIndex >= 0) {
          const creatureSlot = world.creatures.slots[creatureIndex];
          if (creatureSlot !== undefined && creatureSlot.kind === "live") {
            const creature = creatureSlot.creature;
            creature.hp -= COMBAT_DAMAGE;
            hero.attackCooldown = FIGHT_TICKS;
            if (creature.hp <= 0) {
              world.creatures.slots[creatureIndex] = EMPTY_CREATURE_SLOT;
            }
          }
          break;
        }
        if (liveCreatureExists(world)) {
          break;
        }
        const impIndex = adjacentImpIndex(world, hero);
        if (impIndex >= 0) {
          const impSlot = world.imps.slots[impIndex];
          if (impSlot !== undefined && impSlot.kind === "live") {
            const imp = impSlot.imp;
            imp.hp -= COMBAT_DAMAGE;
            hero.attackCooldown = FIGHT_TICKS;
            if (imp.hp <= 0) {
              killImp(world, impIndex, imp);
            }
          }
        }
        break;
      }
      default: {
        const never: never = slot;
        throw never;
      }
    }
  }
}

function resolveCreatureAttacks(world: World): void {
  const slots = world.creatures.slots;
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live": {
        const creature = slot.creature;
        if (creature.hp <= 0) {
          break;
        }
        if (creature.attackCooldown > 0) {
          creature.attackCooldown -= 1;
        }
        if (creature.attackCooldown > 0) {
          break;
        }
        const heroIndex = adjacentHeroIndex(world, creature.tileX, creature.tileY);
        if (heroIndex < 0) {
          break;
        }
        const heroSlot = world.heroes.slots[heroIndex];
        if (heroSlot !== undefined && heroSlot.kind === "live") {
          const hero = heroSlot.hero;
          hero.hp -= COMBAT_DAMAGE;
          creature.attackCooldown = FIGHT_TICKS;
          if (hero.hp <= 0) {
            world.heroes.slots[heroIndex] = EMPTY_HERO_SLOT;
          }
        }
        break;
      }
      default: {
        const never: never = slot;
        throw never;
      }
    }
  }
}

function resolveImpAttacks(world: World): void {
  const slots = world.imps.slots;
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live": {
        const imp = slot.imp;
        if (imp.state.kind === "held") {
          break;
        }
        if (imp.attackCooldown > 0) {
          imp.attackCooldown -= 1;
        }
        if (imp.attackCooldown > 0) {
          break;
        }
        const heroIndex = adjacentHeroIndex(world, imp.tileX, imp.tileY);
        if (heroIndex < 0) {
          break;
        }
        const heroSlot = world.heroes.slots[heroIndex];
        if (heroSlot !== undefined && heroSlot.kind === "live") {
          const hero = heroSlot.hero;
          hero.hp -= COMBAT_DAMAGE;
          imp.attackCooldown = FIGHT_TICKS;
          if (hero.hp <= 0) {
            world.heroes.slots[heroIndex] = EMPTY_HERO_SLOT;
          }
        }
        break;
      }
      default: {
        const never: never = slot;
        throw never;
      }
    }
  }
}

export function resolveCombat(world: World): void {
  resolveHeroAttacks(world);
  resolveCreatureAttacks(world);
  resolveImpAttacks(world);
}

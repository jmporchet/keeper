import {
  beginAllLeaving,
  beginFighting,
  beginMarching,
  captureHeroCurr,
  captureHeroPrev,
  COMBAT_DAMAGE,
  EMPTY_CREATURE_SLOT,
  EMPTY_HERO_SLOT,
  EMPTY_IMP_SLOT,
  FIGHT_TICKS,
  heroAdvanceAlongPath,
  heroMarchStep,
  tryHeroArrival,
  type Hero,
} from "./heroes";
import { removeOccupancy, workerOf, type Imp } from "./imps";
import { releaseWorker } from "./jobs";
import {
  DOOR_DAMAGE_TICKS,
  HEART_DAMAGE_TICKS,
  HEART_X,
  HEART_Y,
  TRAP_DAMAGE,
  TRAP_GAS_LIVE,
  TRAP_GAS_SPENT,
} from "./map";
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
      case "live": {
        const alive = stepLiveHero(world, slot.hero);
        if (!alive) {
          world.heroes.slots[i] = EMPTY_HERO_SLOT;
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

function stepLiveHero(world: World, hero: Hero): boolean {
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
    case "leaving":
      if (heroAdvanceAlongPath(hero, world.width)) {
        world.heroes.slots[hero.id] = EMPTY_HERO_SLOT;
        return false;
      }
      break;
    default: {
      const never: never = state;
      throw never;
    }
  }
  captureHeroCurr(hero);
  return triggerTrap(world, hero);
}

function triggerTrap(world: World, hero: Hero): boolean {
  const tile = hero.tileY * world.width + hero.tileX;
  const state = world.trapState[tile];
  if (state !== TRAP_GAS_LIVE) {
    return hero.hp > 0;
  }
  world.trapState[tile] = TRAP_GAS_SPENT;
  world.trapVersion += 1;
  hero.hp -= TRAP_DAMAGE;
  return hero.hp > 0;
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
  return adjacentImpIndex(world, hero) >= 0;
}

function doorTileAt(world: World, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) {
    return -1;
  }
  const tile = y * world.width + x;
  const hp = world.doorHp[tile];
  if (hp === undefined || hp <= 0) {
    return -1;
  }
  return tile;
}

function adjacentDoorTile(world: World, hero: Hero): number {
  const north = doorTileAt(world, hero.tileX, hero.tileY - 1);
  if (north >= 0) {
    return north;
  }
  const east = doorTileAt(world, hero.tileX + 1, hero.tileY);
  if (east >= 0) {
    return east;
  }
  const south = doorTileAt(world, hero.tileX, hero.tileY + 1);
  if (south >= 0) {
    return south;
  }
  return doorTileAt(world, hero.tileX - 1, hero.tileY);
}

function damageDoor(world: World, hero: Hero, tile: number): void {
  const hp = world.doorHp[tile];
  if (hp === undefined || hp <= 0) {
    return;
  }
  const next = hp - COMBAT_DAMAGE;
  world.doorHp[tile] = next > 0 ? next : 0;
  if (next <= 0) {
    world.doorVersion += 1;
  }
  hero.attackCooldown = DOOR_DAMAGE_TICKS;
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
        if (hero.state.kind === "leaving") {
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
          break;
        }
        const heartDoor = doorTileAt(world, HEART_X, HEART_Y);
        if (!world.heartBreached && isAdjacent(hero.tileX, hero.tileY, HEART_X, HEART_Y)) {
          if (heartDoor >= 0) {
            damageDoor(world, hero, heartDoor);
            break;
          }
          world.heartHp -= COMBAT_DAMAGE;
          hero.attackCooldown = HEART_DAMAGE_TICKS;
          if (world.heartHp <= 0) {
            world.heartHp = 0;
            world.heartBreached = true;
            beginAllLeaving(world);
          }
          break;
        }
        const doorTile = adjacentDoorTile(world, hero);
        if (doorTile >= 0) {
          damageDoor(world, hero, doorTile);
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

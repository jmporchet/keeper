import type { CreatureSlot } from "./creatures";
import {
  asHeroId,
  asTileIndex,
  type HeroId,
  type TileIndex,
} from "./ids";
import type { ImpSlot } from "./imps";
import {
  HEART_X,
  HEART_Y,
  PORTAL_X,
  PORTAL_Y,
  TILE_KIND,
  tileKindAt,
} from "./map";
import { bumpPathGen, isWalkableCode, PATH_CELL_COUNT } from "./path";
import { floodWalkable } from "./path.hot";
import { findPath, STEPS_PER_TILE } from "./pathfind";
import type { World } from "./worldCore";

export const HERO_CAPACITY = 8;
export const HERO_PARTY_SIZE = 2;
export const HERO_ARRIVE_TICKS = 500;
export const HERO_HP = 4;
export const HERO_WAVE_PARTY_CAP = 5;
export const HERO_WAVE_HP_CAP = 6;
export const FIGHT_TICKS = 20;
export const COMBAT_DAMAGE = 1;

export type HeroGoal = "heart" | "creature" | "claimed";

export type HeroMarching = {
  kind: "marching";
  goal: HeroGoal;
  pathStep: number;
  pathLength: number;
  progress: number;
};

export type HeroFighting = { kind: "fighting" };

export type HeroLeaving = {
  kind: "leaving";
  pathStep: number;
  pathLength: number;
  progress: number;
};

export type HeroState = HeroMarching | HeroFighting | HeroLeaving;

export type Hero = {
  id: HeroId;
  tileX: number;
  tileY: number;
  headingX: number;
  headingY: number;
  prevX: number;
  prevZ: number;
  currX: number;
  currZ: number;
  hp: number;
  maxHp: number;
  attackCooldown: number;
  path: Int16Array;
  marching: HeroMarching;
  fighting: HeroFighting;
  leaving: HeroLeaving;
  state: HeroState;
};

export type HeroSlot = { kind: "empty" } | { kind: "live"; hero: Hero };

export type HeroBoard = {
  slots: HeroSlot[];
};

export const EMPTY_HERO_SLOT: HeroSlot = { kind: "empty" };
export const EMPTY_CREATURE_SLOT: CreatureSlot = { kind: "empty" };
export const EMPTY_IMP_SLOT: ImpSlot = { kind: "empty" };

export function heroWavePartySize(repairsDone: number): number {
  return Math.min(HERO_PARTY_SIZE + repairsDone, HERO_WAVE_PARTY_CAP);
}

export function heroWaveHp(repairsDone: number): number {
  return Math.min(HERO_HP + repairsDone, HERO_WAVE_HP_CAP);
}

export function createHero(index: number, tileX: number, tileY: number, maxHp: number): Hero {
  const marching: HeroMarching = {
    kind: "marching",
    goal: "heart",
    pathStep: 0,
    pathLength: 0,
    progress: 0,
  };
  const fighting: HeroFighting = { kind: "fighting" };
  const leaving: HeroLeaving = {
    kind: "leaving",
    pathStep: 0,
    pathLength: 0,
    progress: 0,
  };
  return {
    id: asHeroId(index),
    tileX,
    tileY,
    headingX: 0,
    headingY: 0,
    prevX: tileX,
    prevZ: tileY,
    currX: tileX,
    currZ: tileY,
    hp: maxHp,
    maxHp,
    attackCooldown: 0,
    path: new Int16Array(PATH_CELL_COUNT),
    marching,
    fighting,
    leaving,
    state: marching,
  };
}

export function createHeroBoard(): HeroBoard {
  const slots: HeroSlot[] = [];
  for (let i = 0; i < HERO_CAPACITY; i += 1) {
    slots.push({ kind: "empty" });
  }
  return { slots };
}

export function liveHeroCount(board: HeroBoard): number {
  let n = 0;
  for (let i = 0; i < board.slots.length; i += 1) {
    const slot = board.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live":
        n += 1;
        break;
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  return n;
}

export function liveCreatureExists(world: World): boolean {
  for (let i = 0; i < world.creatures.slots.length; i += 1) {
    const slot = world.creatures.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live":
        return true;
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  return false;
}

function portalTile(world: World): TileIndex {
  return asTileIndex(PORTAL_Y * world.width + PORTAL_X);
}

function portalExists(world: World): boolean {
  return tileKindAt(world.tiles, portalTile(world)) === "portal";
}

function heroOccupied(world: World, tileX: number, tileY: number): boolean {
  for (let i = 0; i < world.heroes.slots.length; i += 1) {
    const slot = world.heroes.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live": {
        const hero = slot.hero;
        if (hero.tileX === tileX && hero.tileY === tileY) {
          return true;
        }
        break;
      }
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  return false;
}

function spawnTile(world: World, member: number): TileIndex | undefined {
  if (member === 0) {
    const tile = portalTile(world);
    const code = world.tiles[tile];
    if (code === undefined || !isWalkableCode(code)) {
      return undefined;
    }
    if (heroOccupied(world, PORTAL_X, PORTAL_Y)) {
      return undefined;
    }
    return tile;
  }
  let best: TileIndex | undefined;
  let bestDistance = 0;
  for (let i = 0; i < world.tiles.length; i += 1) {
    const code = world.tiles[i];
    if (code === undefined || !isWalkableCode(code)) {
      continue;
    }
    const y = (i / world.width) | 0;
    const x = i - y * world.width;
    const distance = Math.max(Math.abs(x - PORTAL_X), Math.abs(y - PORTAL_Y));
    if (distance === 0 || heroOccupied(world, x, y)) {
      continue;
    }
    if (best === undefined || distance < bestDistance || (distance === bestDistance && i < best)) {
      best = asTileIndex(i);
      bestDistance = distance;
    }
  }
  return best;
}

function spawnHero(world: World, tile: TileIndex, maxHp: number): boolean {
  const y = (tile / world.width) | 0;
  const x = tile - y * world.width;
  for (let i = 0; i < world.heroes.slots.length; i += 1) {
    const slot = world.heroes.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        world.heroes.slots[i] = { kind: "live", hero: createHero(i, x, y, maxHp) };
        return true;
      case "live":
        break;
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  return false;
}

export function tryHeroArrival(world: World): void {
  if (world.tick === 0 || world.tick % HERO_ARRIVE_TICKS !== 0) {
    return;
  }
  if (world.heartBreached) {
    return;
  }
  if (!liveCreatureExists(world)) {
    return;
  }
  if (liveHeroCount(world.heroes) > 0) {
    return;
  }
  if (!portalExists(world)) {
    return;
  }
  const partySize = heroWavePartySize(world.repairsDone);
  const maxHp = heroWaveHp(world.repairsDone);
  for (let member = 0; member < partySize; member += 1) {
    const tile = spawnTile(world, member);
    if (tile === undefined) {
      return;
    }
    if (!spawnHero(world, tile, maxHp)) {
      return;
    }
  }
}

export function beginMarching(hero: Hero): void {
  hero.headingX = 0;
  hero.headingY = 0;
  hero.marching.goal = "heart";
  hero.marching.pathStep = 0;
  hero.marching.pathLength = 0;
  hero.marching.progress = 0;
  hero.attackCooldown = 0;
  hero.state = hero.marching;
}

export function beginFighting(hero: Hero): void {
  hero.headingX = 0;
  hero.headingY = 0;
  hero.state = hero.fighting;
}

export function beginLeaving(world: World, hero: Hero): void {
  hero.headingX = 0;
  hero.headingY = 0;
  hero.leaving.pathStep = 0;
  hero.leaving.pathLength = 0;
  hero.leaving.progress = 0;
  const start = hero.tileY * world.width + hero.tileX;
  const portal = asTileIndex(PORTAL_Y * world.width + PORTAL_X);
  const length = findPath(world.tiles, world.width, world.height, start, portal, world.pathScratch, hero.path);
  if (length > 0) {
    hero.leaving.pathLength = length;
    if (length > 1) {
      hero.state = hero.leaving;
      setHeroHeading(hero, world.width);
      return;
    }
  }
  hero.state = hero.leaving;
}

export function beginAllLeaving(world: World): void {
  for (let i = 0; i < world.heroes.slots.length; i += 1) {
    const slot = world.heroes.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live":
        if (slot.hero.state.kind !== "leaving") {
          beginLeaving(world, slot.hero);
        }
        break;
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
}

export function setHeroHeading(hero: Hero, width: number): void {
  const state = hero.state;
  switch (state.kind) {
    case "fighting":
      hero.headingX = 0;
      hero.headingY = 0;
      return;
    case "marching":
    case "leaving":
      break;
    default: {
      const never: never = state;
      return never;
    }
  }
  const nextIndex = state.pathStep + 1;
  if (nextIndex >= state.pathLength) {
    hero.headingX = 0;
    hero.headingY = 0;
    return;
  }
  const nextTile = hero.path[nextIndex];
  if (nextTile === undefined) {
    hero.headingX = 0;
    hero.headingY = 0;
    return;
  }
  const ny = (nextTile / width) | 0;
  const nx = nextTile - ny * width;
  hero.headingX = nx - hero.tileX;
  hero.headingY = ny - hero.tileY;
}

function nearestCreatureTile(world: World, start: number, gen: number): TileIndex | undefined {
  const generation = world.pathScratch.generation;
  const distance = world.pathScratch.distance;
  let best: TileIndex | undefined;
  let bestDistance = 0;
  let bestId = 0;
  for (let i = 0; i < world.creatures.slots.length; i += 1) {
    const slot = world.creatures.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live": {
        const creature = slot.creature;
        const tile = creature.tileY * world.width + creature.tileX;
        if (tile === start) {
          return asTileIndex(tile);
        }
        const reached = generation[tile];
        if (reached !== gen) {
          break;
        }
        const steps = distance[tile];
        if (steps === undefined) {
          break;
        }
        if (
          best === undefined ||
          steps < bestDistance ||
          (steps === bestDistance && creature.id < bestId)
        ) {
          best = asTileIndex(tile);
          bestDistance = steps;
          bestId = creature.id;
        }
        break;
      }
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  return best;
}

function nearestClaimedTile(world: World, gen: number): TileIndex | undefined {
  const generation = world.pathScratch.generation;
  const distance = world.pathScratch.distance;
  let best: TileIndex | undefined;
  let bestDistance = 0;
  for (let i = 0; i < world.tiles.length; i += 1) {
    const code = world.tiles[i];
    if (code !== TILE_KIND.claimed) {
      continue;
    }
    const reached = generation[i];
    if (reached !== gen) {
      continue;
    }
    const steps = distance[i];
    if (steps === undefined) {
      continue;
    }
    if (best === undefined || steps < bestDistance || (steps === bestDistance && i < best)) {
      best = asTileIndex(i);
      bestDistance = steps;
    }
  }
  return best;
}

function heroTarget(world: World, hero: Hero): TileIndex | undefined {
  const start = hero.tileY * world.width + hero.tileX;
  const gen = bumpPathGen(world.pathScratch);
  const count = floodWalkable(
    world.tiles,
    world.width,
    world.height,
    start,
    world.pathScratch.queue,
    world.pathScratch.generation,
    gen,
    world.pathScratch.cameFrom,
    world.pathScratch.reachable,
    world.pathScratch.distance,
  );
  if (count === 0) {
    return undefined;
  }
  const heart = asTileIndex(HEART_Y * world.width + HEART_X);
  if (world.pathScratch.generation[heart] === gen) {
    hero.marching.goal = "heart";
    return heart;
  }
  const creature = nearestCreatureTile(world, start, gen);
  if (creature !== undefined) {
    hero.marching.goal = "creature";
    return creature;
  }
  const claimed = nearestClaimedTile(world, gen);
  if (claimed !== undefined) {
    hero.marching.goal = "claimed";
    return claimed;
  }
  return undefined;
}

export function heroAdvanceAlongPath(hero: Hero, width: number): boolean {
  const state = hero.state;
  switch (state.kind) {
    case "fighting":
      return true;
    case "marching":
    case "leaving":
      break;
    default: {
      const never: never = state;
      return never;
    }
  }
  if (state.pathLength <= 1) {
    return true;
  }
  state.progress += 1;
  if (state.progress < STEPS_PER_TILE) {
    return false;
  }
  state.progress = 0;
  const nextIndex = state.pathStep + 1;
  const nextTile = hero.path[nextIndex];
  if (nextTile === undefined) {
    return true;
  }
  const ny = (nextTile / width) | 0;
  const nx = nextTile - ny * width;
  hero.tileX = nx;
  hero.tileY = ny;
  state.pathStep = nextIndex;
  if (state.pathStep + 1 >= state.pathLength) {
    return true;
  }
  setHeroHeading(hero, width);
  return false;
}

export function heroMarchStep(world: World, hero: Hero): void {
  const state = hero.state;
  if (state.kind !== "marching") {
    return;
  }
  if (state.progress === 0) {
    const target = heroTarget(world, hero);
    if (target === undefined) {
      hero.headingX = 0;
      hero.headingY = 0;
      return;
    }
    const start = hero.tileY * world.width + hero.tileX;
    const length = findPath(world.tiles, world.width, world.height, start, target, world.pathScratch, hero.path);
    if (length <= 0) {
      hero.headingX = 0;
      hero.headingY = 0;
      return;
    }
    state.pathStep = 0;
    state.pathLength = length;
    setHeroHeading(hero, world.width);
  }
  heroAdvanceAlongPath(hero, world.width);
}

export function captureHeroPrev(hero: Hero): void {
  hero.prevX = hero.currX;
  hero.prevZ = hero.currZ;
}

export function worldHeroX(tileX: number, headingX: number, progress: number): number {
  return tileX + headingX * (progress / STEPS_PER_TILE);
}

export function worldHeroZ(tileY: number, headingY: number, progress: number): number {
  return tileY + headingY * (progress / STEPS_PER_TILE);
}

export function captureHeroCurr(hero: Hero): void {
  const state = hero.state;
  const progress = state.kind === "marching" ? state.progress : 0;
  hero.currX = worldHeroX(hero.tileX, hero.headingX, progress);
  hero.currZ = worldHeroZ(hero.tileY, hero.headingY, progress);
}

function mix(h: number, v: number): number {
  return Math.imul(h ^ (v >>> 0), 16777619) >>> 0;
}

function mixPath(h: number, path: Int16Array, length: number): number {
  let next = h;
  for (let i = 0; i < length; i += 1) {
    const tile = path[i];
    if (tile === undefined) {
      continue;
    }
    next = mix(next, tile);
  }
  return next;
}

function heroStateCode(kind: HeroState["kind"]): number {
  switch (kind) {
    case "marching":
      return 1;
    case "fighting":
      return 2;
    case "leaving":
      return 3;
    default: {
      const never: never = kind;
      return never;
    }
  }
}

function heroGoalCode(goal: HeroGoal): number {
  switch (goal) {
    case "heart":
      return 1;
    case "creature":
      return 2;
    case "claimed":
      return 3;
    default: {
      const never: never = goal;
      return never;
    }
  }
}

export function hashHeroes(board: HeroBoard): number {
  let h = 2166136261;
  h = mix(h, board.slots.length);
  for (let i = 0; i < board.slots.length; i += 1) {
    const slot = board.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        h = mix(h, 0);
        break;
      case "live": {
        const hero = slot.hero;
        h = mix(h, 1);
        h = mix(h, hero.id);
        h = mix(h, hero.hp);
        h = mix(h, hero.maxHp);
        h = mix(h, hero.tileX);
        h = mix(h, hero.tileY);
        h = mix(h, hero.attackCooldown);
        h = mix(h, heroStateCode(hero.state.kind));
        switch (hero.state.kind) {
          case "marching": {
            const state = hero.state;
            h = mix(h, heroGoalCode(state.goal));
            h = mix(h, state.pathStep);
            h = mix(h, state.pathLength);
            h = mix(h, state.progress);
            h = mixPath(h, hero.path, state.pathLength);
            break;
          }
          case "fighting":
            break;
          case "leaving": {
            const state = hero.state;
            h = mix(h, state.pathStep);
            h = mix(h, state.pathLength);
            h = mix(h, state.progress);
            h = mixPath(h, hero.path, state.pathLength);
            break;
          }
          default: {
            const never: never = hero.state;
            return never;
          }
        }
        break;
      }
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  return h >>> 0;
}

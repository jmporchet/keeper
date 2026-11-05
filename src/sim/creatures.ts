import { removeChicken } from "./chickens";
import { asChickenId, asCreatureId, asTileIndex, type ChickenId, type CreatureId, type TileIndex } from "./ids";
import { PORTAL_X, PORTAL_Y, ROOM_KIND, tileKindAt } from "./map";
import { bumpPathGen, PATH_CELL_COUNT } from "./path";
import { floodWalkable, reconstructPath } from "./path.hot";
import { findPath, STEPS_PER_TILE } from "./pathfind";
import { advanceRng } from "./rng";
import type { World } from "./worldCore";

export const CREATURE_CAPACITY = 8;
export const ARRIVE_TICKS = 200;
export const CREATURE_STEPS_PER_TILE = STEPS_PER_TILE;
export const HUNGER_TICKS = 300;
export const HUNGER_RETRY_TICKS = 40;
export const EAT_TICKS = 20;
export const TRAIN_TICKS = 80;
export const WANDER_PERIOD = 40;
export const WANDER_CHANCE = 1;
export const WANDER_ROLL = 2;
export const CREATURE_MAX_LEVEL = 1;
export const CREATURE_HP = 3;
export const CREATURE_HP_PER_LEVEL = 1;

export type CreatureArriving = { kind: "arriving" };
export type CreatureToBed = {
  kind: "toBed";
  pathStep: number;
  pathLength: number;
  progress: number;
};
export type CreatureSleeping = { kind: "sleeping"; remaining: number };
export type CreatureToTraining = {
  kind: "toTraining";
  tile: TileIndex;
  pathStep: number;
  pathLength: number;
  progress: number;
};
export type CreatureTraining = { kind: "training"; tile: TileIndex; remaining: number };
export type CreatureWandering = {
  kind: "wandering";
  pathStep: number;
  pathLength: number;
  progress: number;
  remaining: number;
};
export type CreatureHungry = { kind: "hungry"; retry: number };
export type CreatureToFood = {
  kind: "toFood";
  chickenId: ChickenId;
  pathStep: number;
  pathLength: number;
  progress: number;
};
export type CreatureEating = { kind: "eating"; chickenId: ChickenId; remaining: number };
export type CreatureState =
  | CreatureArriving
  | CreatureToBed
  | CreatureSleeping
  | CreatureToTraining
  | CreatureTraining
  | CreatureWandering
  | CreatureHungry
  | CreatureToFood
  | CreatureEating;

export type Creature = {
  id: CreatureId;
  bedTile: TileIndex;
  tileX: number;
  tileY: number;
  headingX: number;
  headingY: number;
  prevX: number;
  prevZ: number;
  currX: number;
  currZ: number;
  level: number;
  hp: number;
  maxHp: number;
  attackCooldown: number;
  path: Int16Array;
  arriving: CreatureArriving;
  toBed: CreatureToBed;
  sleeping: CreatureSleeping;
  toTraining: CreatureToTraining;
  training: CreatureTraining;
  wandering: CreatureWandering;
  hungry: CreatureHungry;
  toFood: CreatureToFood;
  eating: CreatureEating;
  state: CreatureState;
};

export type CreatureSlot = { kind: "empty" } | { kind: "live"; creature: Creature };

export type CreatureBoard = {
  slots: CreatureSlot[];
};

export function createCreature(index: number, tileX: number, tileY: number, bedTile: TileIndex): Creature {
  const arriving: CreatureArriving = { kind: "arriving" };
  const toBed: CreatureToBed = { kind: "toBed", pathStep: 0, pathLength: 0, progress: 0 };
  const sleeping: CreatureSleeping = { kind: "sleeping", remaining: HUNGER_TICKS };
  const toTraining: CreatureToTraining = {
    kind: "toTraining",
    tile: bedTile,
    pathStep: 0,
    pathLength: 0,
    progress: 0,
  };
  const training: CreatureTraining = { kind: "training", tile: bedTile, remaining: TRAIN_TICKS };
  const wandering: CreatureWandering = {
    kind: "wandering",
    pathStep: 0,
    pathLength: 0,
    progress: 0,
    remaining: HUNGER_TICKS,
  };
  const hungry: CreatureHungry = { kind: "hungry", retry: 0 };
  const toFood: CreatureToFood = {
    kind: "toFood",
    chickenId: asChickenId(0),
    pathStep: 0,
    pathLength: 0,
    progress: 0,
  };
  const eating: CreatureEating = { kind: "eating", chickenId: asChickenId(0), remaining: EAT_TICKS };
  return {
    id: asCreatureId(index),
    bedTile,
    tileX,
    tileY,
    headingX: 0,
    headingY: 0,
    prevX: tileX,
    prevZ: tileY,
    currX: tileX,
    currZ: tileY,
    level: 0,
    hp: CREATURE_HP,
    maxHp: CREATURE_HP,
    attackCooldown: 0,
    path: new Int16Array(PATH_CELL_COUNT),
    arriving,
    toBed,
    sleeping,
    toTraining,
    training,
    wandering,
    hungry,
    toFood,
    eating,
    state: arriving,
  };
}

export function createCreatureBoard(): CreatureBoard {
  const slots: CreatureSlot[] = [];
  for (let i = 0; i < CREATURE_CAPACITY; i += 1) {
    slots.push({ kind: "empty" });
  }
  return { slots };
}

export function liveCreatureCount(board: CreatureBoard): number {
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

function portalTileIndex(world: World): TileIndex {
  return asTileIndex(PORTAL_Y * world.width + PORTAL_X);
}

function portalExists(world: World): boolean {
  return tileKindAt(world.tiles, portalTileIndex(world)) === "portal";
}

function refreshLairCache(world: World): void {
  if (world.lairCacheVersion === world.roomsVersion) {
    return;
  }
  world.lairCacheVersion = world.roomsVersion;
  let count = 0;
  for (let i = 0; i < world.rooms.length; i += 1) {
    const room = world.rooms[i];
    if (room !== ROOM_KIND.lair) {
      continue;
    }
    world.lairCache[count] = i;
    count += 1;
  }
  world.lairCacheCount = count;
}

function refreshTrainingCache(world: World): void {
  if (world.trainingCacheVersion === world.roomsVersion) {
    return;
  }
  world.trainingCacheVersion = world.roomsVersion;
  let count = 0;
  for (let i = 0; i < world.rooms.length; i += 1) {
    const room = world.rooms[i];
    if (room !== ROOM_KIND.training) {
      continue;
    }
    world.trainingCache[count] = i;
    count += 1;
  }
  world.trainingCacheCount = count;
}

function trainingTileClaimed(world: World, tile: TileIndex): boolean {
  for (let i = 0; i < world.creatures.slots.length; i += 1) {
    const slot = world.creatures.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live": {
        const state = slot.creature.state;
        if (state.kind === "toTraining" || state.kind === "training") {
          if (state.tile === tile) {
            return true;
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
  return false;
}

function bedClaimed(world: World, tile: TileIndex): boolean {
  for (let i = 0; i < world.creatures.slots.length; i += 1) {
    const slot = world.creatures.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live":
        if (slot.creature.bedTile === tile) {
          return true;
        }
        break;
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  return false;
}

function findFreeBed(world: World): TileIndex | undefined {
  refreshLairCache(world);
  for (let i = 0; i < world.lairCacheCount; i += 1) {
    const tile = world.lairCache[i];
    if (tile === undefined) {
      continue;
    }
    if (!bedClaimed(world, asTileIndex(tile))) {
      return asTileIndex(tile);
    }
  }
  return undefined;
}

export function freeBedTiles(world: World): TileIndex[] {
  refreshLairCache(world);
  const free: TileIndex[] = [];
  for (let i = 0; i < world.lairCacheCount; i += 1) {
    const tile = world.lairCache[i];
    if (tile === undefined) {
      continue;
    }
    const bed = asTileIndex(tile);
    if (!bedClaimed(world, bed)) {
      free.push(bed);
    }
  }
  return free;
}

function spawnCreature(world: World, bedTile: TileIndex): boolean {
  for (let i = 0; i < world.creatures.slots.length; i += 1) {
    const slot = world.creatures.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        world.creatures.slots[i] = { kind: "live", creature: createCreature(i, PORTAL_X, PORTAL_Y, bedTile) };
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

export function tryArrival(world: World): void {
  if (world.tick === 0 || world.tick % ARRIVE_TICKS !== 0) {
    return;
  }
  if (!portalExists(world)) {
    return;
  }
  if (liveCreatureCount(world.creatures) >= CREATURE_CAPACITY) {
    return;
  }
  const bed = findFreeBed(world);
  if (bed === undefined) {
    return;
  }
  spawnCreature(world, bed);
}

function tileIndex(x: number, y: number, width: number): number {
  return y * width + x;
}

export function setCreatureHeading(creature: Creature, width: number): void {
  const state = creature.state;
  if (
    state.kind !== "toBed" &&
    state.kind !== "toFood" &&
    state.kind !== "toTraining" &&
    state.kind !== "wandering"
  ) {
    creature.headingX = 0;
    creature.headingY = 0;
    return;
  }
  const nextIndex = state.pathStep + 1;
  if (nextIndex >= state.pathLength) {
    creature.headingX = 0;
    creature.headingY = 0;
    return;
  }
  const nextTile = creature.path[nextIndex];
  if (nextTile === undefined) {
    creature.headingX = 0;
    creature.headingY = 0;
    return;
  }
  const ny = (nextTile / width) | 0;
  const nx = nextTile - ny * width;
  creature.headingX = nx - creature.tileX;
  creature.headingY = ny - creature.tileY;
}

export function beginToBed(world: World, creature: Creature): void {
  const start = tileIndex(creature.tileX, creature.tileY, world.width);
  const length = findPath(world.tiles, world.width, world.height, start, creature.bedTile, world.pathScratch, creature.path);
  if (length <= 0) {
    creature.state = creature.arriving;
    creature.headingX = 0;
    creature.headingY = 0;
    return;
  }
  if (length <= 1) {
    creature.state = creature.sleeping;
    creature.headingX = 0;
    creature.headingY = 0;
    return;
  }
  creature.toBed.pathStep = 0;
  creature.toBed.pathLength = length;
  creature.toBed.progress = 0;
  creature.state = creature.toBed;
  setCreatureHeading(creature, world.width);
}

export function resumeSleeping(creature: Creature, remaining: number): void {
  creature.headingX = 0;
  creature.headingY = 0;
  creature.sleeping.remaining = remaining;
  creature.state = creature.sleeping;
}

export function beginSleeping(creature: Creature): void {
  resumeSleeping(creature, HUNGER_TICKS);
}

export function beginWander(world: World, creature: Creature): boolean {
  const start = tileIndex(creature.tileX, creature.tileY, world.width);
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
  if (count <= 1) {
    return false;
  }
  advanceRng(world);
  const slot = 1 + (world.rng % (count - 1));
  const dest = world.pathScratch.reachable[slot];
  if (dest === undefined) {
    return false;
  }
  const length = reconstructPath(
    start,
    dest,
    world.pathScratch.cameFrom,
    world.pathScratch.reverseBuf,
    creature.path,
  );
  if (length <= 1) {
    return false;
  }
  creature.wandering.pathStep = 0;
  creature.wandering.pathLength = length;
  creature.wandering.progress = 0;
  creature.wandering.remaining = creature.sleeping.remaining;
  creature.state = creature.wandering;
  setCreatureHeading(creature, world.width);
  return true;
}

export function beginTraining(creature: Creature, tile: TileIndex): void {
  creature.headingX = 0;
  creature.headingY = 0;
  creature.training.tile = tile;
  creature.training.remaining = TRAIN_TICKS;
  creature.state = creature.training;
}

export function finishTraining(world: World, creature: Creature): void {
  creature.level = CREATURE_MAX_LEVEL;
  creature.maxHp += CREATURE_HP_PER_LEVEL;
  creature.hp += CREATURE_HP_PER_LEVEL;
  beginToBed(world, creature);
}

export function beginToTraining(world: World, creature: Creature): boolean {
  refreshTrainingCache(world);
  if (world.trainingCacheCount === 0) {
    return false;
  }
  const start = tileIndex(creature.tileX, creature.tileY, world.width);
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
    return false;
  }
  const generation = world.pathScratch.generation;
  for (let i = 0; i < world.trainingCacheCount; i += 1) {
    const tile = world.trainingCache[i];
    if (tile === undefined) {
      continue;
    }
    const goal = asTileIndex(tile);
    if (trainingTileClaimed(world, goal)) {
      continue;
    }
    const reached = generation[goal];
    if (reached !== gen) {
      continue;
    }
    const length = reconstructPath(
      start,
      goal,
      world.pathScratch.cameFrom,
      world.pathScratch.reverseBuf,
      creature.path,
    );
    if (length <= 0) {
      continue;
    }
    if (length <= 1) {
      beginTraining(creature, goal);
      return true;
    }
    creature.toTraining.tile = goal;
    creature.toTraining.pathStep = 0;
    creature.toTraining.pathLength = length;
    creature.toTraining.progress = 0;
    creature.state = creature.toTraining;
    setCreatureHeading(creature, world.width);
    return true;
  }
  return false;
}

export function beginHungry(creature: Creature): void {
  creature.headingX = 0;
  creature.headingY = 0;
  creature.hungry.retry = 0;
  creature.state = creature.hungry;
}

function nearestChicken(world: World, start: number): ChickenId | undefined {
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
  const generation = world.pathScratch.generation;
  const distance = world.pathScratch.distance;
  let best: ChickenId | undefined;
  let bestDistance = 0;
  for (let i = 0; i < world.chickens.slots.length; i += 1) {
    const slot = world.chickens.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live": {
        const chicken = slot.chicken;
        const reached = generation[chicken.tile];
        if (reached !== gen) {
          break;
        }
        const steps = distance[chicken.tile];
        if (steps === undefined) {
          break;
        }
        if (best === undefined || steps < bestDistance || (steps === bestDistance && chicken.id < best)) {
          best = chicken.id;
          bestDistance = steps;
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

function chickenTile(world: World, id: ChickenId): TileIndex | undefined {
  const slot = world.chickens.slots[id];
  if (slot === undefined) {
    return undefined;
  }
  switch (slot.kind) {
    case "empty":
      return undefined;
    case "live":
      return slot.chicken.tile;
    default: {
      const never: never = slot;
      return never;
    }
  }
}

export function beginEating(creature: Creature, chickenId: ChickenId): void {
  creature.headingX = 0;
  creature.headingY = 0;
  creature.eating.chickenId = chickenId;
  creature.eating.remaining = EAT_TICKS;
  creature.state = creature.eating;
}

export function beginToFood(world: World, creature: Creature): void {
  const start = tileIndex(creature.tileX, creature.tileY, world.width);
  const id = nearestChicken(world, start);
  if (id === undefined) {
    creature.hungry.retry = HUNGER_RETRY_TICKS;
    creature.headingX = 0;
    creature.headingY = 0;
    creature.state = creature.hungry;
    return;
  }
  const goal = chickenTile(world, id);
  if (goal === undefined) {
    creature.hungry.retry = HUNGER_RETRY_TICKS;
    creature.headingX = 0;
    creature.headingY = 0;
    creature.state = creature.hungry;
    return;
  }
  const length = reconstructPath(
    start,
    goal,
    world.pathScratch.cameFrom,
    world.pathScratch.reverseBuf,
    creature.path,
  );
  if (length <= 0) {
    creature.hungry.retry = HUNGER_RETRY_TICKS;
    creature.headingX = 0;
    creature.headingY = 0;
    creature.state = creature.hungry;
    return;
  }
  if (length <= 1) {
    beginEating(creature, id);
    return;
  }
  creature.toFood.chickenId = id;
  creature.toFood.pathStep = 0;
  creature.toFood.pathLength = length;
  creature.toFood.progress = 0;
  creature.state = creature.toFood;
  setCreatureHeading(creature, world.width);
}

export function finishEating(world: World, creature: Creature, chickenId: ChickenId): void {
  const tile = removeChicken(world.chickens, chickenId);
  if (tile === undefined) {
    beginHungry(creature);
    return;
  }
  const count = world.chickenTileCount[tile];
  if (count !== undefined && count > 0) {
    world.chickenTileCount[tile] = count - 1;
  }
  world.chickensVersion += 1;
  beginToBed(world, creature);
}

export function captureCreaturePrev(creature: Creature): void {
  creature.prevX = creature.currX;
  creature.prevZ = creature.currZ;
}

export function worldCreatureX(tileX: number, headingX: number, progress: number): number {
  return tileX + headingX * (progress / CREATURE_STEPS_PER_TILE);
}

export function worldCreatureZ(tileY: number, headingY: number, progress: number): number {
  return tileY + headingY * (progress / CREATURE_STEPS_PER_TILE);
}

export function captureCreatureCurr(creature: Creature): void {
  const state = creature.state;
  const progress =
    state.kind === "toBed" ||
    state.kind === "toFood" ||
    state.kind === "toTraining" ||
    state.kind === "wandering"
      ? state.progress
      : 0;
  creature.currX = worldCreatureX(creature.tileX, creature.headingX, progress);
  creature.currZ = worldCreatureZ(creature.tileY, creature.headingY, progress);
}

export function lairTileCount(world: World): number {
  let total = 0;
  for (let i = 0; i < world.rooms.length; i += 1) {
    const room = world.rooms[i];
    if (room === ROOM_KIND.lair) {
      total += 1;
    }
  }
  return total;
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

function creatureStateCode(kind: CreatureState["kind"]): number {
  switch (kind) {
    case "arriving":
      return 1;
    case "toBed":
      return 2;
    case "sleeping":
      return 3;
    case "toTraining":
      return 4;
    case "training":
      return 5;
    case "hungry":
      return 6;
    case "toFood":
      return 7;
    case "eating":
      return 8;
    case "wandering":
      return 9;
    default: {
      const never: never = kind;
      return never;
    }
  }
}

export function hashCreatures(board: CreatureBoard): number {
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
        const creature = slot.creature;
        h = mix(h, 1);
        h = mix(h, creature.id);
        h = mix(h, creature.bedTile);
        h = mix(h, creature.level);
        h = mix(h, creature.hp);
        h = mix(h, creature.maxHp);
        h = mix(h, creature.attackCooldown);
        h = mix(h, creature.tileX);
        h = mix(h, creature.tileY);
        h = mix(h, creatureStateCode(creature.state.kind));
        switch (creature.state.kind) {
          case "arriving":
            break;
          case "sleeping": {
            const state = creature.state;
            h = mix(h, state.remaining);
            break;
          }
          case "toTraining": {
            const state = creature.state;
            h = mix(h, state.tile);
            h = mix(h, state.pathStep);
            h = mix(h, state.pathLength);
            h = mix(h, state.progress);
            h = mixPath(h, creature.path, state.pathLength);
            break;
          }
          case "training": {
            const state = creature.state;
            h = mix(h, state.tile);
            h = mix(h, state.remaining);
            break;
          }
          case "wandering": {
            const state = creature.state;
            h = mix(h, state.remaining);
            h = mix(h, state.pathStep);
            h = mix(h, state.pathLength);
            h = mix(h, state.progress);
            h = mixPath(h, creature.path, state.pathLength);
            break;
          }
          case "hungry": {
            const state = creature.state;
            h = mix(h, state.retry);
            break;
          }
          case "toBed": {
            const state = creature.state;
            h = mix(h, state.pathStep);
            h = mix(h, state.pathLength);
            h = mix(h, state.progress);
            h = mixPath(h, creature.path, state.pathLength);
            break;
          }
          case "toFood": {
            const state = creature.state;
            h = mix(h, state.chickenId);
            h = mix(h, state.pathStep);
            h = mix(h, state.pathLength);
            h = mix(h, state.progress);
            h = mixPath(h, creature.path, state.pathLength);
            break;
          }
          case "eating": {
            const state = creature.state;
            h = mix(h, state.chickenId);
            h = mix(h, state.remaining);
            break;
          }
          default: {
            const never: never = creature.state;
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

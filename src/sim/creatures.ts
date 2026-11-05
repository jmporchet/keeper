import { asCreatureId, asTileIndex, type CreatureId, type TileIndex } from "./ids";
import { PORTAL_X, PORTAL_Y, ROOM_KIND, tileKindAt } from "./map";
import { PATH_CELL_COUNT } from "./path";
import { findPath, STEPS_PER_TILE } from "./pathfind";
import type { World } from "./worldCore";

export const CREATURE_CAPACITY = 8;
export const ARRIVE_TICKS = 200;
export const CREATURE_STEPS_PER_TILE = STEPS_PER_TILE;

export type CreatureArriving = { kind: "arriving" };
export type CreatureToBed = {
  kind: "toBed";
  pathStep: number;
  pathLength: number;
  progress: number;
};
export type CreatureSleeping = { kind: "sleeping" };
export type CreatureState = CreatureArriving | CreatureToBed | CreatureSleeping;

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
  path: Int16Array;
  arriving: CreatureArriving;
  toBed: CreatureToBed;
  sleeping: CreatureSleeping;
  state: CreatureState;
};

export type CreatureSlot = { kind: "empty" } | { kind: "live"; creature: Creature };

export type CreatureBoard = {
  slots: CreatureSlot[];
};

export function createCreature(index: number, tileX: number, tileY: number, bedTile: TileIndex): Creature {
  const arriving: CreatureArriving = { kind: "arriving" };
  const toBed: CreatureToBed = { kind: "toBed", pathStep: 0, pathLength: 0, progress: 0 };
  const sleeping: CreatureSleeping = { kind: "sleeping" };
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
    path: new Int16Array(PATH_CELL_COUNT),
    arriving,
    toBed,
    sleeping,
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
  if (state.kind !== "toBed") {
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

export function beginSleeping(creature: Creature): void {
  creature.headingX = 0;
  creature.headingY = 0;
  creature.state = creature.sleeping;
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
  const progress = state.kind === "toBed" ? state.progress : 0;
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
        h = mix(h, creature.tileX);
        h = mix(h, creature.tileY);
        h = mix(h, creatureStateCode(creature.state.kind));
        switch (creature.state.kind) {
          case "arriving":
          case "sleeping":
            break;
          case "toBed": {
            const state = creature.state;
            h = mix(h, state.pathStep);
            h = mix(h, state.pathLength);
            h = mix(h, state.progress);
            h = mixPath(h, creature.path, state.pathLength);
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

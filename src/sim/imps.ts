import { asImpId, type ImpId } from "./ids";
import { bumpPathGen, isWalkableCode, PATH_CELL_COUNT, type PathScratch } from "./path";
import { bfsToGoal, floodWalkable, reconstructPath } from "./path.hot";
import { advanceRng } from "./rng";
import type { TileRead } from "./world";

export const IMP_CAPACITY = 200;
export const STARTING_IMP_COUNT = 4;
export const STEPS_PER_TILE = 6;

export type ImpIdle = { kind: "idle" };
export type ImpWandering = {
  kind: "wandering";
  pathStep: number;
  pathLength: number;
  progress: number;
};
export type ImpWalking = {
  kind: "walking";
  pathStep: number;
  pathLength: number;
  progress: number;
};
export type ImpState = ImpIdle | ImpWandering | ImpWalking;

export type Imp = {
  id: ImpId;
  tileX: number;
  tileY: number;
  headingX: number;
  headingY: number;
  prevX: number;
  prevZ: number;
  currX: number;
  currZ: number;
  path: Int16Array;
  idle: ImpIdle;
  wandering: ImpWandering;
  walking: ImpWalking;
  state: ImpState;
};

export type ImpSlot = { kind: "empty" } | { kind: "live"; imp: Imp };

export type ImpBoard = {
  slots: ImpSlot[];
};

const SPAWN_X = [31, 32, 33, 32];
const SPAWN_Y = [31, 31, 31, 32];

export function createImp(index: number, tileX: number, tileY: number): Imp {
  const idle: ImpIdle = { kind: "idle" };
  const wandering: ImpWandering = { kind: "wandering", pathStep: 0, pathLength: 0, progress: 0 };
  const walking: ImpWalking = { kind: "walking", pathStep: 0, pathLength: 0, progress: 0 };
  return {
    id: asImpId(index),
    tileX,
    tileY,
    headingX: 0,
    headingY: 0,
    prevX: tileX,
    prevZ: tileY,
    currX: tileX,
    currZ: tileY,
    path: new Int16Array(PATH_CELL_COUNT),
    idle,
    wandering,
    walking,
    state: idle,
  };
}

export function createImpBoard(): ImpBoard {
  const slots: ImpSlot[] = [];
  for (let i = 0; i < IMP_CAPACITY; i += 1) {
    slots.push({ kind: "empty" });
  }
  return { slots };
}

export function spawnStartingImps(board: ImpBoard): void {
  for (let i = 0; i < STARTING_IMP_COUNT; i += 1) {
    const sx = SPAWN_X[i];
    const sy = SPAWN_Y[i];
    if (sx === undefined || sy === undefined) {
      continue;
    }
    board.slots[i] = { kind: "live", imp: createImp(i, sx, sy) };
  }
}

export function tileIndex(x: number, y: number, width: number): number {
  return y * width + x;
}

export function findPath(
  tiles: TileRead,
  width: number,
  height: number,
  start: number,
  goal: number,
  scratch: PathScratch,
  outPath: Int16Array,
): number {
  const gen = bumpPathGen(scratch);
  const reached = bfsToGoal(
    tiles,
    width,
    height,
    start,
    goal,
    scratch.queue,
    scratch.generation,
    gen,
    scratch.cameFrom,
  );
  if (!reached) {
    return 0;
  }
  return reconstructPath(start, goal, scratch.cameFrom, scratch.reverseBuf, outPath);
}

export type ImpWorld = {
  tiles: TileRead;
  width: number;
  height: number;
  rng: number;
  imps: ImpBoard;
  pathScratch: PathScratch;
};

export function beginWander(world: ImpWorld, imp: Imp): void {
  const start = tileIndex(imp.tileX, imp.tileY, world.width);
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
  );
  if (count <= 1) {
    imp.state = imp.idle;
    return;
  }
  advanceRng(world);
  const slot = (world.rng % (count - 1)) + 1;
  const dest = world.pathScratch.reachable[slot];
  if (dest === undefined) {
    imp.state = imp.idle;
    return;
  }
  const length = reconstructPath(start, dest, world.pathScratch.cameFrom, world.pathScratch.reverseBuf, imp.path);
  if (length <= 1) {
    imp.state = imp.idle;
    return;
  }
  imp.wandering.pathStep = 0;
  imp.wandering.pathLength = length;
  imp.wandering.progress = 0;
  imp.state = imp.wandering;
  setHeading(imp, world.width);
}

export function setHeading(imp: Imp, width: number): void {
  const moving = movingState(imp);
  if (moving === undefined) {
    imp.headingX = 0;
    imp.headingY = 0;
    return;
  }
  const nextIndex = moving.pathStep + 1;
  if (nextIndex >= moving.pathLength) {
    imp.headingX = 0;
    imp.headingY = 0;
    return;
  }
  const nextTile = imp.path[nextIndex];
  if (nextTile === undefined) {
    imp.headingX = 0;
    imp.headingY = 0;
    return;
  }
  const ny = (nextTile / width) | 0;
  const nx = nextTile - ny * width;
  imp.headingX = nx - imp.tileX;
  imp.headingY = ny - imp.tileY;
}

export function movingState(imp: Imp): ImpWandering | ImpWalking | undefined {
  const state = imp.state;
  switch (state.kind) {
    case "idle":
      return undefined;
    case "wandering":
      return state;
    case "walking":
      return state;
    default: {
      const never: never = state;
      return never;
    }
  }
}

export function occupyWalkable(imp: Imp, tiles: TileRead, width: number): boolean {
  const i = tileIndex(imp.tileX, imp.tileY, width);
  const code = tiles[i];
  if (code === undefined) {
    return false;
  }
  return isWalkableCode(code);
}

export function worldX(tileX: number, headingX: number, progress: number): number {
  return tileX + headingX * (progress / STEPS_PER_TILE);
}

export function worldZ(tileY: number, headingY: number, progress: number): number {
  return tileY + headingY * (progress / STEPS_PER_TILE);
}

export function capturePrev(imp: Imp): void {
  imp.prevX = imp.currX;
  imp.prevZ = imp.currZ;
}

export function captureCurr(imp: Imp): void {
  const moving = movingState(imp);
  const progress = moving === undefined ? 0 : moving.progress;
  imp.currX = worldX(imp.tileX, imp.headingX, progress);
  imp.currZ = worldZ(imp.tileY, imp.headingY, progress);
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

function impStateCode(kind: ImpState["kind"]): number {
  switch (kind) {
    case "idle":
      return 1;
    case "wandering":
      return 2;
    case "walking":
      return 3;
    default: {
      const never: never = kind;
      return never;
    }
  }
}

export function hashImps(board: ImpBoard): number {
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
        const imp = slot.imp;
        h = mix(h, 1);
        h = mix(h, imp.id);
        h = mix(h, imp.tileX);
        h = mix(h, imp.tileY);
        h = mix(h, impStateCode(imp.state.kind));
        const moving = imp.state;
        switch (moving.kind) {
          case "idle":
            break;
          case "wandering":
            h = mix(h, moving.pathStep);
            h = mix(h, moving.pathLength);
            h = mix(h, moving.progress);
            h = mixPath(h, imp.path, moving.pathLength);
            break;
          case "walking":
            h = mix(h, moving.pathStep);
            h = mix(h, moving.pathLength);
            h = mix(h, moving.progress);
            h = mixPath(h, imp.path, moving.pathLength);
            break;
          default: {
            const never: never = moving;
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

export function liveImpCount(board: ImpBoard): number {
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

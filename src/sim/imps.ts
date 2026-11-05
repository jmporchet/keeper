import { openClaimJobsAround } from "./claims";
import { asImpId, asTileIndex, asWorkerId, type ImpId, type TileIndex, type WorkerId } from "./ids";
import { betterJob, completeJob, jobForFilledSlot, jobHeldBy, releaseWorker, reserveJob, type Job } from "./jobs";
import {
  HEART_X,
  HEART_Y,
  MAP_HEIGHT,
  MAP_WIDTH,
  ROOM_KIND,
  TILE_KIND,
  TREASURY_CAPACITY,
  type TileRead,
} from "./map";
import { bumpPathGen, isWalkableCode, PATH_CELL_COUNT } from "./path";
import { floodWalkable, reconstructPath } from "./path.hot";
import { findPath, STEPS_PER_TILE } from "./pathfind";
import { advanceRng } from "./rng";
import { setTile, type World } from "./worldCore";

export const IMP_CAPACITY = 200;
export const STARTING_IMP_COUNT = 4;
export const DIG_TICKS = 40;
export const CLAIM_TICKS = 30;
export const MINE_TICKS = 30;
export const MINE_CHUNK = 20;
export const SLAP_TICKS = 60;

export type ImpIdle = { kind: "idle" };
export type ImpWandering = {
  kind: "wandering";
  pathStep: number;
  pathLength: number;
  progress: number;
  blockedTicks: number;
};
export type ImpWalking = {
  kind: "walking";
  tile: TileIndex;
  pathStep: number;
  pathLength: number;
  progress: number;
  blockedTicks: number;
};
export type ImpDelivering = {
  kind: "delivering";
  tile: TileIndex;
  pathStep: number;
  pathLength: number;
  progress: number;
  blockedTicks: number;
};
export type WorkKind = "dig" | "claim" | "mine";
export type ImpWorking = {
  kind: "working";
  tile: TileIndex;
  work: WorkKind;
  remaining: number;
};
export type ImpHeld = { kind: "held" };
export type ImpCarryEmpty = { kind: "empty" };
export type ImpCarryGold = { kind: "gold"; amount: number };
export type ImpCarry = ImpCarryEmpty | ImpCarryGold;
export type ImpBoostNone = { kind: "none" };
export type ImpBoostBoosted = { kind: "boosted"; remaining: number };
export type ImpBoost = ImpBoostNone | ImpBoostBoosted;
export type ImpState = ImpIdle | ImpWandering | ImpWalking | ImpWorking | ImpDelivering | ImpHeld;

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
  working: ImpWorking;
  delivering: ImpDelivering;
  carry: ImpCarry;
  carryEmpty: ImpCarryEmpty;
  carryGold: ImpCarryGold;
  boost: ImpBoost;
  boostNone: ImpBoostNone;
  boostBoosted: ImpBoostBoosted;
  held: ImpHeld;
  state: ImpState;
};

export type ImpSlot = { kind: "empty" } | { kind: "live"; imp: Imp };

export type ImpBoard = {
  slots: ImpSlot[];
  occupancy: Uint16Array;
  liveCount: number;
  heldCount: number;
};

export const BLOCK_TICKS = 12;
export const HEART_TILE = HEART_Y * MAP_WIDTH + HEART_X;

const SPAWN_X = [31, 32, 33, 32];
const SPAWN_Y = [31, 31, 31, 32];

export function occupancyAt(board: ImpBoard, tile: number): number {
  const count = board.occupancy[tile];
  return count === undefined ? 0 : count;
}

export function addOccupancy(board: ImpBoard, tile: number): void {
  const count = board.occupancy[tile];
  if (count === undefined) {
    return;
  }
  board.occupancy[tile] = count + 1;
}

export function removeOccupancy(board: ImpBoard, tile: number): void {
  const count = board.occupancy[tile];
  if (count === undefined || count === 0) {
    return;
  }
  board.occupancy[tile] = count - 1;
}

export function impTileIndex(imp: Imp, width: number): number {
  return imp.tileY * width + imp.tileX;
}

export function createImp(index: number, tileX: number, tileY: number): Imp {
  const idle: ImpIdle = { kind: "idle" };
  const wandering: ImpWandering = {
    kind: "wandering",
    pathStep: 0,
    pathLength: 0,
    progress: 0,
    blockedTicks: 0,
  };
  const walking: ImpWalking = {
    kind: "walking",
    tile: asTileIndex(tileY * MAP_WIDTH + tileX),
    pathStep: 0,
    pathLength: 0,
    progress: 0,
    blockedTicks: 0,
  };
  const working: ImpWorking = {
    kind: "working",
    tile: asTileIndex(tileY * MAP_WIDTH + tileX),
    work: "dig",
    remaining: 0,
  };
  const delivering: ImpDelivering = {
    kind: "delivering",
    tile: asTileIndex(tileY * MAP_WIDTH + tileX),
    pathStep: 0,
    pathLength: 0,
    progress: 0,
    blockedTicks: 0,
  };
  const carryEmpty: ImpCarryEmpty = { kind: "empty" };
  const carryGold: ImpCarryGold = { kind: "gold", amount: 0 };
  const boostNone: ImpBoostNone = { kind: "none" };
  const boostBoosted: ImpBoostBoosted = { kind: "boosted", remaining: 0 };
  const held: ImpHeld = { kind: "held" };
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
    working,
    delivering,
    carry: carryEmpty,
    carryEmpty,
    carryGold,
    boost: boostNone,
    boostNone,
    boostBoosted,
    held,
    state: idle,
  };
}

export function createImpBoard(): ImpBoard {
  const slots: ImpSlot[] = [];
  for (let i = 0; i < IMP_CAPACITY; i += 1) {
    slots.push({ kind: "empty" });
  }
  return { slots, occupancy: new Uint16Array(MAP_WIDTH * MAP_HEIGHT), liveCount: 0, heldCount: 0 };
}

export function spawnImp(board: ImpBoard, tileX: number, tileY: number): boolean {
  for (let i = 0; i < board.slots.length; i += 1) {
    const slot = board.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        board.slots[i] = { kind: "live", imp: createImp(i, tileX, tileY) };
        board.liveCount += 1;
        addOccupancy(board, tileY * MAP_WIDTH + tileX);
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

export function spawnStartingImps(board: ImpBoard): void {
  for (let i = 0; i < STARTING_IMP_COUNT; i += 1) {
    const sx = SPAWN_X[i];
    const sy = SPAWN_Y[i];
    if (sx === undefined || sy === undefined) {
      continue;
    }
    board.slots[i] = { kind: "live", imp: createImp(i, sx, sy) };
    board.liveCount += 1;
    addOccupancy(board, sy * MAP_WIDTH + sx);
  }
}

export function tileIndex(x: number, y: number, width: number): number {
  return y * width + x;
}

export type ImpWorld = World;

export function workerOf(imp: Imp): WorkerId {
  return asWorkerId(imp.id);
}

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
    world.pathScratch.distance,
  );
  if (count <= 1) {
    imp.state = imp.idle;
    return;
  }
  let freeCount = 0;
  for (let i = 0; i < count; i += 1) {
    const tile = world.pathScratch.reachable[i];
    if (tile === undefined || tile === start) {
      continue;
    }
    if (occupancyAt(world.imps, tile) === 0) {
      freeCount += 1;
    }
  }
  advanceRng(world);
  let dest: number | undefined;
  if (freeCount > 0) {
    const pick = world.rng % freeCount;
    let seen = 0;
    for (let i = 0; i < count; i += 1) {
      const tile = world.pathScratch.reachable[i];
      if (tile === undefined || tile === start) {
        continue;
      }
      if (occupancyAt(world.imps, tile) !== 0) {
        continue;
      }
      if (seen === pick) {
        dest = tile;
        break;
      }
      seen += 1;
    }
  } else {
    const slot = (world.rng % (count - 1)) + 1;
    dest = world.pathScratch.reachable[slot];
  }
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
  imp.wandering.blockedTicks = 0;
  imp.state = imp.wandering;
  setHeading(imp, world.width);
}

function isReached(world: ImpWorld, index: number, gen: number): boolean {
  const reached = world.pathScratch.generation[index];
  return reached !== undefined && reached === gen;
}

function neighbourTarget(world: ImpWorld, x: number, y: number, gen: number): number | undefined {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) {
    return undefined;
  }
  const n = tileIndex(x, y, world.width);
  if (!isReached(world, n, gen)) {
    return undefined;
  }
  return n;
}

function digTarget(world: ImpWorld, jobTile: TileIndex, gen: number): number | undefined {
  const width = world.width;
  const y = (jobTile / width) | 0;
  const x = jobTile - y * width;
  const north = neighbourTarget(world, x, y - 1, gen);
  if (north !== undefined) {
    return north;
  }
  const east = neighbourTarget(world, x + 1, y, gen);
  if (east !== undefined) {
    return east;
  }
  const south = neighbourTarget(world, x, y + 1, gen);
  if (south !== undefined) {
    return south;
  }
  return neighbourTarget(world, x - 1, y, gen);
}

function targetForJob(world: ImpWorld, job: Job, gen: number): number | undefined {
  switch (job.jobKind) {
    case "dig":
    case "mineGold":
      return digTarget(world, job.tile, gen);
    case "claim":
      return isReached(world, job.tile, gen) ? job.tile : undefined;
    case "carryGold":
    case "reinforce":
      return undefined;
    default: {
      const never: never = job.jobKind;
      return never;
    }
  }
}

export type MovingImpState = ImpWandering | ImpWalking | ImpDelivering;

export function canEnterNextTile(
  world: ImpWorld,
  imp: Imp,
  state: MovingImpState,
  nextIndex: number,
): boolean {
  const nextTile = imp.path[nextIndex];
  if (nextTile === undefined) {
    return true;
  }
  if (nextTile === HEART_TILE) {
    return true;
  }
  if (state.kind === "delivering" && nextTile === state.tile) {
    return true;
  }
  switch (state.kind) {
    case "walking":
    case "delivering":
      if (nextIndex + 1 >= state.pathLength) {
        return true;
      }
      break;
    case "wandering":
      break;
    default: {
      const never: never = state;
      return never;
    }
  }
  if (occupancyAt(world.imps, nextTile) === 0) {
    return true;
  }
  if (world.walkableSaturated) {
    return true;
  }
  if (state.kind === "wandering") {
    return false;
  }
  return state.blockedTicks >= BLOCK_TICKS;
}

function bestReachableJob(world: ImpWorld, imp: Imp): Job | undefined {
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
    world.pathScratch.distance,
  );
  if (count === 0) {
    return undefined;
  }
  let best: Job | undefined;
  const board = world.jobs;
  for (let i = 0; i < board.filledCount; i += 1) {
    const job = jobForFilledSlot(board, i);
    if (job === undefined) {
      continue;
    }
    switch (job.lifecycle.kind) {
      case "open":
        if (targetForJob(world, job, gen) !== undefined && (best === undefined || betterJob(best, job))) {
          best = job;
        }
        break;
      case "reserved":
        break;
      default: {
        const never: never = job.lifecycle;
        return never;
      }
    }
  }
  return best;
}

export function reserveBestReachableJob(world: ImpWorld, imp: Imp): Job | undefined {
  const job = bestReachableJob(world, imp);
  if (job === undefined) {
    return undefined;
  }
  const gen = world.pathScratch.gen;
  const target = targetForJob(world, job, gen);
  if (target === undefined) {
    return undefined;
  }
  const start = tileIndex(imp.tileX, imp.tileY, world.width);
  const length = findPath(world.tiles, world.width, world.height, start, target, world.pathScratch, imp.path);
  if (length <= 0) {
    return undefined;
  }
  if (!reserveJob(world.jobs, workerOf(imp), job)) {
    return undefined;
  }
  imp.walking.tile = job.tile;
  imp.walking.pathStep = 0;
  imp.walking.pathLength = length;
  imp.walking.progress = 0;
  imp.walking.blockedTicks = 0;
  imp.state = imp.walking;
  setHeading(imp, world.width);
  return job;
}

export function beginIdle(world: ImpWorld, imp: Imp): void {
  if (imp.carry.kind === "gold") {
    beginDelivering(world, imp);
    return;
  }
  if (reserveBestReachableJob(world, imp) !== undefined) {
    return;
  }
  beginWander(world, imp);
}

export function jobHeldOnTile(world: ImpWorld, imp: Imp, tile: TileIndex): boolean {
  const job = jobHeldBy(world.jobs, workerOf(imp));
  if (job === undefined) {
    return false;
  }
  return job.tile === tile;
}

export function beginWorking(world: ImpWorld, imp: Imp, tile: TileIndex): void {
  const job = jobHeldBy(world.jobs, workerOf(imp));
  if (job === undefined) {
    goIdle(imp);
    return;
  }
  switch (job.jobKind) {
    case "dig":
      imp.working.work = "dig";
      imp.working.remaining = DIG_TICKS;
      break;
    case "claim":
      imp.working.work = "claim";
      imp.working.remaining = CLAIM_TICKS;
      break;
    case "mineGold":
      imp.working.work = "mine";
      imp.working.remaining = MINE_TICKS;
      break;
    case "carryGold":
    case "reinforce":
      goIdle(imp);
      return;
    default: {
      const never: never = job.jobKind;
      return never;
    }
  }
  imp.working.tile = tile;
  imp.headingX = 0;
  imp.headingY = 0;
  imp.state = imp.working;
}

export function goIdle(imp: Imp): void {
  imp.state = imp.idle;
  imp.headingX = 0;
  imp.headingY = 0;
}

export function boostImp(imp: Imp): void {
  imp.boostBoosted.remaining = SLAP_TICKS;
  imp.boost = imp.boostBoosted;
}

export function clearBoost(imp: Imp): void {
  imp.boost = imp.boostNone;
}

export function finishDig(world: ImpWorld, imp: Imp, tile: TileIndex): void {
  setTile(world, tile, TILE_KIND.dirt);
  completeJob(world.jobs, workerOf(imp));
  openClaimJobsAround(world, tile);
  goIdle(imp);
}

export function finishClaim(world: ImpWorld, imp: Imp, tile: TileIndex): void {
  setTile(world, tile, TILE_KIND.claimed);
  completeJob(world.jobs, workerOf(imp));
  openClaimJobsAround(world, tile);
  goIdle(imp);
}

function refreshTreasuryCache(world: ImpWorld): void {
  if (world.treasuryCacheVersion === world.tilesVersion) {
    return;
  }
  world.treasuryCacheVersion = world.tilesVersion;
  let count = 0;
  for (let i = 0; i < world.rooms.length; i += 1) {
    const room = world.rooms[i];
    if (room !== ROOM_KIND.treasury) {
      continue;
    }
    world.treasuryCache[count] = i;
    count += 1;
  }
  world.treasuryCacheCount = count;
}

function nearestTreasuryWithCapacity(world: ImpWorld, gen: number): number | undefined {
  refreshTreasuryCache(world);
  const generation = world.pathScratch.generation;
  const distance = world.pathScratch.distance;
  let best: number | undefined;
  let bestDistance = 0;
  for (let i = 0; i < world.treasuryCacheCount; i += 1) {
    const tile = world.treasuryCache[i];
    if (tile === undefined) {
      continue;
    }
    const stock = world.treasuryStock[tile];
    if (stock === undefined || stock >= TREASURY_CAPACITY) {
      continue;
    }
    const reached = generation[tile];
    if (reached !== gen) {
      continue;
    }
    const steps = distance[tile];
    if (steps === undefined) {
      continue;
    }
    if (best === undefined || steps < bestDistance) {
      best = tile;
      bestDistance = steps;
    }
  }
  return best;
}

export function beginDelivering(world: ImpWorld, imp: Imp): void {
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
    world.pathScratch.distance,
  );
  if (count === 0) {
    goIdle(imp);
    return;
  }
  const heart = tileIndex(HEART_X, HEART_Y, world.width);
  const treasury = nearestTreasuryWithCapacity(world, gen);
  const reachedHeart = world.pathScratch.generation[heart] === gen;
  const dest = treasury ?? (reachedHeart ? heart : undefined);
  if (dest === undefined) {
    goIdle(imp);
    return;
  }
  const length = reconstructPath(start, dest, world.pathScratch.cameFrom, world.pathScratch.reverseBuf, imp.path);
  if (length <= 0) {
    goIdle(imp);
    return;
  }
  imp.delivering.tile = asTileIndex(dest);
  imp.delivering.pathStep = 0;
  imp.delivering.pathLength = length;
  imp.delivering.progress = 0;
  imp.delivering.blockedTicks = 0;
  imp.state = imp.delivering;
  setHeading(imp, world.width);
}

export function finishDelivery(world: ImpWorld, imp: Imp): void {
  const carry = imp.carry;
  switch (carry.kind) {
    case "empty":
      goIdle(imp);
      return;
    case "gold": {
      const tile = tileIndex(imp.tileX, imp.tileY, world.width);
      const room = world.rooms[tile];
      if (room === ROOM_KIND.treasury) {
        const stock = world.treasuryStock[tile];
        const current = stock === undefined ? 0 : stock;
        const roomLeft = TREASURY_CAPACITY - current;
        const chunk = carry.amount < roomLeft ? carry.amount : roomLeft;
        if (chunk > 0) {
          world.treasuryStock[tile] = current + chunk;
          carry.amount -= chunk;
          world.treasuryVersion += 1;
        }
        if (carry.amount === 0) {
          imp.carry = imp.carryEmpty;
          goIdle(imp);
          return;
        }
      }
      const heart = tileIndex(HEART_X, HEART_Y, world.width);
      if (tile === heart) {
        world.goldStored += carry.amount;
        carry.amount = 0;
        imp.carry = imp.carryEmpty;
        goIdle(imp);
        return;
      }
      beginDelivering(world, imp);
      return;
    }
    default: {
      const never: never = carry;
      throw never;
    }
  }
}

export function finishMine(world: ImpWorld, imp: Imp, tile: TileIndex): void {
  const stock = world.goldStock[tile];
  const available = stock === undefined ? 0 : stock;
  const chunk = available < MINE_CHUNK ? available : MINE_CHUNK;
  if (chunk <= 0) {
    setTile(world, tile, TILE_KIND.dirt);
    completeJob(world.jobs, workerOf(imp));
    openClaimJobsAround(world, tile);
    goIdle(imp);
    return;
  }
  world.goldStock[tile] = available - chunk;
  imp.carryGold.amount = chunk;
  imp.carry = imp.carryGold;
  const remaining = world.goldStock[tile];
  if (remaining === 0) {
    setTile(world, tile, TILE_KIND.dirt);
    completeJob(world.jobs, workerOf(imp));
    openClaimJobsAround(world, tile);
  } else {
    releaseWorker(world.jobs, workerOf(imp));
  }
  beginDelivering(world, imp);
}

export function carryingCount(board: ImpBoard): number {
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
        if (slot.imp.carry.kind === "gold") {
          n += 1;
        }
        break;
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  return n;
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

export function movingState(imp: Imp): ImpWandering | ImpWalking | ImpDelivering | undefined {
  const state = imp.state;
  switch (state.kind) {
    case "idle":
      return undefined;
    case "wandering":
      return state;
    case "walking":
      return state;
    case "working":
      return undefined;
    case "delivering":
      return state;
    case "held":
      return undefined;
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
    case "working":
      return 4;
    case "delivering":
      return 5;
    case "held":
      return 6;
    default: {
      const never: never = kind;
      return never;
    }
  }
}

function workCode(work: WorkKind): number {
  switch (work) {
    case "dig":
      return 1;
    case "claim":
      return 2;
    case "mine":
      return 3;
    default: {
      const never: never = work;
      return never;
    }
  }
}

function carryCode(carry: ImpCarry): number {
  switch (carry.kind) {
    case "empty":
      return 1;
    case "gold":
      return 2;
    default: {
      const never: never = carry;
      return never;
    }
  }
}

function boostCode(boost: ImpBoost): number {
  switch (boost.kind) {
    case "none":
      return 1;
    case "boosted":
      return 2;
    default: {
      const never: never = boost;
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
        h = mix(h, carryCode(imp.carry));
        if (imp.carry.kind === "gold") {
          h = mix(h, imp.carry.amount);
        }
        h = mix(h, boostCode(imp.boost));
        switch (imp.boost.kind) {
          case "none":
            break;
          case "boosted":
            h = mix(h, imp.boost.remaining);
            break;
          default: {
            const never: never = imp.boost;
            return never;
          }
        }
        h = mix(h, impStateCode(imp.state.kind));
        const moving = imp.state;
        switch (moving.kind) {
          case "idle":
            break;
          case "wandering":
            h = mix(h, moving.pathStep);
            h = mix(h, moving.pathLength);
            h = mix(h, moving.progress);
            h = mix(h, moving.blockedTicks);
            h = mixPath(h, imp.path, moving.pathLength);
            break;
          case "walking":
            h = mix(h, moving.tile);
            h = mix(h, moving.pathStep);
            h = mix(h, moving.pathLength);
            h = mix(h, moving.progress);
            h = mix(h, moving.blockedTicks);
            h = mixPath(h, imp.path, moving.pathLength);
            break;
          case "working":
            h = mix(h, moving.tile);
            h = mix(h, workCode(moving.work));
            h = mix(h, moving.remaining);
            break;
          case "delivering":
            h = mix(h, moving.tile);
            h = mix(h, moving.pathStep);
            h = mix(h, moving.pathLength);
            h = mix(h, moving.progress);
            h = mix(h, moving.blockedTicks);
            h = mixPath(h, imp.path, moving.pathLength);
            break;
          case "held":
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

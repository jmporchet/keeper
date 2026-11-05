import {
  CHICKEN_TILE_CAP,
  createChickenBoard,
  HATCH_TICKS,
  hashChickens,
  spawnChicken,
} from "./chickens";
import { createCreatureBoard, hashCreatures } from "./creatures";
import { createHeroBoard, hashHeroes } from "./heroes";
import { resolveCombat, stepHeroes } from "./heroes.hot";
import { stepCreatures } from "./creatures.hot";
import { addHeld, createHand, hashHand, isHeld, removeHeld } from "./hand";
import { asTick, asTileIndex, type CreatureId, type ImpId, type Tick, type TileIndex } from "./ids";
import {
  addOccupancy,
  boostImp,
  clearBoost,
  createImpBoard,
  hashImps,
  removeOccupancy,
  spawnImp,
  spawnStartingImps,
  workerOf,
  type Imp,
} from "./imps";
import { stepImps } from "./imps.hot";
import { cancelJobAtTile, createJobBoard, hashJobs, openJob, releaseWorker } from "./jobs";
import {
  DOOR_COST,
  DOOR_HP,
  HATCHERY_COST,
  HEART_HP,
  HEART_X,
  HEART_Y,
  LAIR_COST,
  LIBRARY_COST,
  MAP_HEIGHT,
  MAP_HALF,
  MAP_WIDTH,
  PORTAL_X,
  PORTAL_Y,
  REPAIR_HEART_COST,
  ROOM_KIND,
  TILE_KIND,
  TRAP_COST,
  TRAP_GAS_LIVE,
  TRAP_NONE,
  TRAINING_COST,
  TREASURY_COST,
  WORKSHOP_COST,
  tileKindAt,
  type RoomTool,
} from "./map";
import { createPathScratch, isWalkableCode } from "./path";
import {
  applyPossess,
  applyPossessMove,
  applyReleasePossess,
  hashPossession,
  noPossession,
  syncPossession,
} from "./possession";
import { advanceRng } from "./rng";
import { availableGold, drainTreasury, runPayday } from "./wages";
import { attachTiles, setTile, type World } from "./worldCore";

export {
  DOOR_COST,
  DOOR_DAMAGE_TICKS,
  DOOR_HP,
  HATCHERY_COST,
  HEART_DAMAGE_TICKS,
  HEART_HP,
  HEART_X,
  HEART_Y,
  MAP_HALF,
  MAP_HEIGHT,
  LAIR_COST,
  LIBRARY_COST,
  MAP_WIDTH,
  PORTAL_X,
  PORTAL_Y,
  REPAIR_HEART_COST,
  ROOM_KIND,
  ROOM_KIND_COUNT,
  ROOM_KINDS,
  roomKindAt,
  TILE_KIND,
  TILE_KIND_COUNT,
  TILE_KINDS,
  TRAP_COST,
  TRAP_DAMAGE,
  TRAP_GAS_LIVE,
  TRAP_GAS_SPENT,
  TRAP_NONE,
  TRAINING_COST,
  TREASURY_CAPACITY,
  TREASURY_COST,
  WORKSHOP_COST,
  tileKindAt,
  type PaintTool,
  type RoomKind,
  type RoomKindCode,
  type RoomTool,
  type TileKind,
  type TileKindCode,
  type TileRead,
} from "./map";
export { setTile, type World } from "./worldCore";
export { openClaimJobsAround } from "./claims";
export { CHICKEN_CAPACITY, CHICKEN_TILE_CAP, HATCH_TICKS, liveChickenCount } from "./chickens";
export { freeBedTiles, lairTileCount, liveCreatureCount } from "./creatures";
export {
  COMBAT_DAMAGE,
  FIGHT_TICKS,
  HERO_ARRIVE_TICKS,
  HERO_CAPACITY,
  HERO_HP,
  HERO_PARTY_SIZE,
  HERO_WAVE_HP_CAP,
  HERO_WAVE_PARTY_CAP,
  hashHeroes,
  liveHeroCount,
  type Hero,
  type HeroBoard,
  type HeroSlot,
  type HeroState,
} from "./heroes";
export { CREATURE_WAGE, PAY_TICKS, ticksUntilPayday } from "./wages";

export const TICK_HZ = 20;
export const TICK_DT = 1 / TICK_HZ;
export const MAX_FRAME_DELTA = 0.1;
export const MAX_STEPS_PER_FRAME = 4;
export const GOLD_PER_TILE = 40;

export type Command =
  | { kind: "noop"; tick: Tick }
  | { kind: "addGold"; tick: Tick; amount: number }
  | { kind: "tag"; tick: Tick; tile: TileIndex }
  | { kind: "untag"; tick: Tick; tile: TileIndex }
  | { kind: "paintRoom"; tick: Tick; tile: TileIndex; room: RoomTool }
  | { kind: "paintDoor"; tick: Tick; tile: TileIndex }
  | { kind: "paintTrap"; tick: Tick; tile: TileIndex }
  | { kind: "spawnImp"; tick: Tick }
  | { kind: "pickUp"; tick: Tick; impId: ImpId }
  | { kind: "drop"; tick: Tick; impId: ImpId; tileX: number; tileY: number }
  | { kind: "slap"; tick: Tick; impId: ImpId }
  | { kind: "possess"; tick: Tick; creatureId: CreatureId }
  | { kind: "releasePossess"; tick: Tick }
  | { kind: "possessMove"; tick: Tick; creatureId: CreatureId; dx: number; dy: number }
  | { kind: "repairHeart"; tick: Tick };

export type CommandLog = readonly Command[] & { readonly __brand: "CommandLog" };

export function requireSorted(commands: readonly Command[]): CommandLog {
  const sorted = sortCommands(commands);
  for (let i = 0; i < commands.length; i += 1) {
    if (commands[i] !== sorted[i]) {
      throw new Error("commands are not in stable sorted order");
    }
  }
  return commands as CommandLog;
}

export function tileIndexFromWorld(x: number, z: number): TileIndex | undefined {
  const tx = Math.floor(x + MAP_HALF + 0.5);
  const ty = Math.floor(z + MAP_HALF + 0.5);
  if (tx < 0 || ty < 0 || tx >= MAP_WIDTH || ty >= MAP_HEIGHT) {
    return undefined;
  }
  return asTileIndex(ty * MAP_WIDTH + tx);
}

export function countTagged(world: World): number {
  const tiles = world.tiles;
  let n = 0;
  for (let i = 0; i < tiles.length; i += 1) {
    const kind = tileKindAt(tiles, i);
    switch (kind) {
      case "taggedEarth":
      case "taggedGold":
        n += 1;
        break;
      case "earth":
      case "goldSeam":
      case "rock":
      case "dirt":
      case "claimed":
      case "room":
      case "portal":
        break;
      default: {
        const never: never = kind;
        return never;
      }
    }
  }
  return n;
}

function isBorder(x: number, y: number, width: number, height: number): boolean {
  return x < 2 || y < 2 || x >= width - 2 || y >= height - 2;
}

function isClaimedStart(x: number, y: number): boolean {
  return x >= 30 && x <= 34 && y >= 30 && y <= 34;
}

function isGoldSeamStart(x: number, y: number): boolean {
  const east = x >= 38 && x <= 42 && y >= 31 && y <= 32;
  const south = x >= 31 && x <= 32 && y >= 38 && y <= 42;
  return east || south;
}

function fillStartingMap(tiles: Uint8Array, width: number, height: number): void {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (isBorder(x, y, width, height)) {
        tiles[i] = TILE_KIND.rock;
      } else if (isGoldSeamStart(x, y)) {
        tiles[i] = TILE_KIND.goldSeam;
      } else if (x === PORTAL_X && y === PORTAL_Y) {
        tiles[i] = TILE_KIND.portal;
      } else if (isClaimedStart(x, y)) {
        tiles[i] = TILE_KIND.claimed;
      } else {
        tiles[i] = TILE_KIND.earth;
      }
    }
  }
}

export function createWorld(seed: number): World {
  const width = MAP_WIDTH;
  const height = MAP_HEIGHT;
  const tiles = new Uint8Array(width * height);
  fillStartingMap(tiles, width, height);
  const goldStock = new Uint32Array(width * height);
  const rooms = new Uint8Array(width * height);
  const doorHp = new Uint8Array(width * height);
  const trapState = new Uint8Array(width * height);
  const treasuryStock = new Uint16Array(width * height);
  const treasuryCache = new Int32Array(width * height);
  const lairCache = new Int32Array(width * height);
  const hatcheryCache = new Int32Array(width * height);
  const trainingCache = new Int32Array(width * height);
  const workshopCache = new Int32Array(width * height);
  const libraryCache = new Int32Array(width * height);
  const chickenTileCount = new Uint16Array(width * height);
  let walkableTileCount = 0;
  for (let i = 0; i < tiles.length; i += 1) {
    const code = tiles[i];
    if (code === undefined) {
      continue;
    }
    if (code === TILE_KIND.goldSeam) {
      goldStock[i] = GOLD_PER_TILE;
    }
    if (isWalkableCode(code)) {
      walkableTileCount += 1;
    }
  }
  const imps = createImpBoard();
  spawnStartingImps(imps);
  const world: World = {
    seed: seed >>> 0,
    tick: asTick(0),
    rng: seed >>> 0,
    width,
    height,
    tiles,
    rooms,
    doorHp,
    trapState,
    treasuryStock,
    treasuryCache,
    treasuryCacheCount: 0,
    treasuryCacheVersion: -1,
    lairCache,
    lairCacheCount: 0,
    lairCacheVersion: -1,
    hatcheryCache,
    hatcheryCacheCount: 0,
    hatcheryCacheVersion: -1,
    trainingCache,
    trainingCacheCount: 0,
    trainingCacheVersion: -1,
    workshopCache,
    workshopCacheCount: 0,
    workshopCacheVersion: -1,
    libraryCache,
    libraryCacheCount: 0,
    libraryCacheVersion: -1,
    chickenTileCount,
    chickens: createChickenBoard(),
    chickensVersion: 0,
    tilesVersion: 1,
    roomsVersion: 0,
    doorVersion: 0,
    trapVersion: 0,
    treasuryVersion: 0,
    goldStored: 0,
    goldSpent: 0,
    goldPaidOut: 0,
    goldStock,
    heartHp: HEART_HP,
    heartMaxHp: HEART_HP,
    heartBreached: false,
    repairsDone: 0,
    commandCursor: 0,
    jobs: createJobBoard(width * height),
    imps,
    creatures: createCreatureBoard(),
    heroes: createHeroBoard(),
    hand: createHand(),
    possession: noPossession(),
    pathScratch: createPathScratch(),
    walkableSaturated: false,
    walkableTileCount,
  };
  attachTiles(world, tiles);
  return world;
}

function mix(h: number, v: number): number {
  return Math.imul(h ^ (v >>> 0), 16777619) >>> 0;
}

export function hashWorld(world: World): number {
  let h = 2166136261;
  h = mix(h, world.seed);
  h = mix(h, world.tick);
  h = mix(h, world.rng);
  h = mix(h, world.width);
  h = mix(h, world.height);
  h = mix(h, world.goldStored);
  h = mix(h, world.goldSpent);
  h = mix(h, world.goldPaidOut);
  h = mix(h, world.heartHp);
  h = mix(h, world.heartMaxHp);
  h = mix(h, world.heartBreached ? 1 : 0);
  h = mix(h, world.repairsDone);
  h = mix(h, world.goldStock.length);
  for (let i = 0; i < world.goldStock.length; i += 1) {
    const stock = world.goldStock[i];
    if (stock === undefined) {
      continue;
    }
    h = mix(h, stock);
  }
  for (let i = 0; i < world.rooms.length; i += 1) {
    const room = world.rooms[i];
    if (room === undefined) {
      continue;
    }
    h = mix(h, room);
  }
  for (let i = 0; i < world.doorHp.length; i += 1) {
    const hp = world.doorHp[i];
    if (hp === undefined) {
      continue;
    }
    h = mix(h, hp);
  }
  for (let i = 0; i < world.trapState.length; i += 1) {
    const state = world.trapState[i];
    if (state === undefined) {
      continue;
    }
    h = mix(h, state);
  }
  for (let i = 0; i < world.treasuryStock.length; i += 1) {
    const stock = world.treasuryStock[i];
    if (stock === undefined) {
      continue;
    }
    h = mix(h, stock);
  }
  h = mix(h, world.tilesVersion);
  h = mix(h, hashJobs(world.jobs));
  h = mix(h, hashHand(world.hand));
  h = mix(h, hashPossession(world.possession));
  const tiles = world.tiles;
  for (let i = 0; i < tiles.length; i += 1) {
    const cell = tiles[i];
    if (cell === undefined) {
      continue;
    }
    h = mix(h, cell);
  }
  h = mix(h, hashImps(world.imps));
  h = mix(h, hashCreatures(world.creatures));
  h = mix(h, hashHeroes(world.heroes));
  h = mix(h, hashChickens(world.chickens));
  return h >>> 0;
}

function applyTag(world: World, tile: TileIndex): void {
  const kind = tileKindAt(world.tiles, tile);
  switch (kind) {
    case "earth":
      setTile(world, tile, TILE_KIND.taggedEarth);
      openJob(world.jobs, tile, "dig");
      return;
    case "goldSeam":
      setTile(world, tile, TILE_KIND.taggedGold);
      openJob(world.jobs, tile, "mineGold");
      return;
    case "taggedEarth":
    case "taggedGold":
    case "rock":
    case "dirt":
    case "claimed":
    case "room":
    case "portal":
      return;
    default: {
      const never: never = kind;
      return never;
    }
  }
}

function applyUntag(world: World, tile: TileIndex): void {
  const kind = tileKindAt(world.tiles, tile);
  switch (kind) {
    case "taggedEarth":
      setTile(world, tile, TILE_KIND.earth);
      cancelJobAtTile(world.jobs, tile);
      return;
    case "taggedGold":
      setTile(world, tile, TILE_KIND.goldSeam);
      cancelJobAtTile(world.jobs, tile);
      return;
    case "earth":
    case "goldSeam":
    case "rock":
    case "dirt":
    case "claimed":
    case "room":
    case "portal":
      return;
    default: {
      const never: never = kind;
      return never;
    }
  }
}

function applyPaintRoom(world: World, tile: TileIndex, room: RoomTool): void {
  const kind = tileKindAt(world.tiles, tile);
  if (kind !== "claimed") {
    return;
  }
  const current = world.rooms[tile];
  if (current === undefined || current !== ROOM_KIND.none) {
    return;
  }
  const door = world.doorHp[tile];
  if (door !== undefined && door > 0) {
    return;
  }
  const trap = world.trapState[tile];
  if (trap !== undefined && trap !== TRAP_NONE) {
    return;
  }
  switch (room) {
    case "treasury": {
      if (world.goldStored < TREASURY_COST) {
        return;
      }
      world.goldStored -= TREASURY_COST;
      world.goldSpent += TREASURY_COST;
      setTile(world, tile, TILE_KIND.room);
      world.rooms[tile] = ROOM_KIND.treasury;
      world.treasuryStock[tile] = 0;
      world.treasuryVersion += 1;
      world.roomsVersion += 1;
      return;
    }
    case "lair": {
      if (world.goldStored < LAIR_COST) {
        return;
      }
      world.goldStored -= LAIR_COST;
      world.goldSpent += LAIR_COST;
      setTile(world, tile, TILE_KIND.room);
      world.rooms[tile] = ROOM_KIND.lair;
      world.roomsVersion += 1;
      return;
    }
    case "hatchery": {
      if (world.goldStored < HATCHERY_COST) {
        return;
      }
      world.goldStored -= HATCHERY_COST;
      world.goldSpent += HATCHERY_COST;
      setTile(world, tile, TILE_KIND.room);
      world.rooms[tile] = ROOM_KIND.hatchery;
      world.roomsVersion += 1;
      return;
    }
    case "training": {
      if (world.goldStored < TRAINING_COST) {
        return;
      }
      world.goldStored -= TRAINING_COST;
      world.goldSpent += TRAINING_COST;
      setTile(world, tile, TILE_KIND.room);
      world.rooms[tile] = ROOM_KIND.training;
      world.roomsVersion += 1;
      return;
    }
    case "workshop": {
      if (world.goldStored < WORKSHOP_COST) {
        return;
      }
      world.goldStored -= WORKSHOP_COST;
      world.goldSpent += WORKSHOP_COST;
      setTile(world, tile, TILE_KIND.room);
      world.rooms[tile] = ROOM_KIND.workshop;
      world.roomsVersion += 1;
      return;
    }
    case "library": {
      if (world.goldStored < LIBRARY_COST) {
        return;
      }
      world.goldStored -= LIBRARY_COST;
      world.goldSpent += LIBRARY_COST;
      setTile(world, tile, TILE_KIND.room);
      world.rooms[tile] = ROOM_KIND.library;
      world.roomsVersion += 1;
      return;
    }
    default: {
      const never: never = room;
      return never;
    }
  }
}

function applyPaintDoor(world: World, tile: TileIndex): void {
  const kind = tileKindAt(world.tiles, tile);
  if (kind !== "claimed") {
    return;
  }
  const room = world.rooms[tile];
  if (room === undefined || room !== ROOM_KIND.none) {
    return;
  }
  const hp = world.doorHp[tile];
  if (hp === undefined || hp > 0) {
    return;
  }
  const trap = world.trapState[tile];
  if (trap === undefined || trap !== TRAP_NONE) {
    return;
  }
  if (world.goldStored < DOOR_COST) {
    return;
  }
  world.goldStored -= DOOR_COST;
  world.goldSpent += DOOR_COST;
  world.doorHp[tile] = DOOR_HP;
  world.doorVersion += 1;
}

function applyPaintTrap(world: World, tile: TileIndex): void {
  const kind = tileKindAt(world.tiles, tile);
  if (kind !== "claimed") {
    return;
  }
  const room = world.rooms[tile];
  if (room === undefined || room !== ROOM_KIND.none) {
    return;
  }
  const state = world.trapState[tile];
  if (state === undefined || state !== TRAP_NONE) {
    return;
  }
  const hp = world.doorHp[tile];
  if (hp === undefined || hp > 0) {
    return;
  }
  if (world.goldStored < TRAP_COST) {
    return;
  }
  world.goldStored -= TRAP_COST;
  world.goldSpent += TRAP_COST;
  world.trapState[tile] = TRAP_GAS_LIVE;
  world.trapVersion += 1;
}

export function doorCount(world: World): number {
  let total = 0;
  for (let i = 0; i < world.doorHp.length; i += 1) {
    const hp = world.doorHp[i];
    if (hp !== undefined && hp > 0) {
      total += 1;
    }
  }
  return total;
}

export function trapCount(world: World): number {
  let total = 0;
  for (let i = 0; i < world.trapState.length; i += 1) {
    const state = world.trapState[i];
    if (state === TRAP_GAS_LIVE) {
      total += 1;
    }
  }
  return total;
}

export function treasuryStockTotal(world: World): number {
  let total = 0;
  for (let i = 0; i < world.treasuryStock.length; i += 1) {
    const stock = world.treasuryStock[i];
    if (stock === undefined) {
      continue;
    }
    total += stock;
  }
  return total;
}

export function treasuryTileCount(world: World): number {
  let total = 0;
  for (let i = 0; i < world.rooms.length; i += 1) {
    const room = world.rooms[i];
    if (room === ROOM_KIND.treasury) {
      total += 1;
    }
  }
  return total;
}

export function hatcheryTileCount(world: World): number {
  let total = 0;
  for (let i = 0; i < world.rooms.length; i += 1) {
    const room = world.rooms[i];
    if (room === ROOM_KIND.hatchery) {
      total += 1;
    }
  }
  return total;
}

export function trainingTileCount(world: World): number {
  let total = 0;
  for (let i = 0; i < world.rooms.length; i += 1) {
    const room = world.rooms[i];
    if (room === ROOM_KIND.training) {
      total += 1;
    }
  }
  return total;
}

export function workshopTileCount(world: World): number {
  let total = 0;
  for (let i = 0; i < world.rooms.length; i += 1) {
    const room = world.rooms[i];
    if (room === ROOM_KIND.workshop) {
      total += 1;
    }
  }
  return total;
}

export function libraryTileCount(world: World): number {
  let total = 0;
  for (let i = 0; i < world.rooms.length; i += 1) {
    const room = world.rooms[i];
    if (room === ROOM_KIND.library) {
      total += 1;
    }
  }
  return total;
}

function refreshHatcheryCache(world: World): void {
  if (world.hatcheryCacheVersion === world.roomsVersion) {
    return;
  }
  world.hatcheryCacheVersion = world.roomsVersion;
  let count = 0;
  for (let i = 0; i < world.rooms.length; i += 1) {
    const room = world.rooms[i];
    if (room !== ROOM_KIND.hatchery) {
      continue;
    }
    world.hatcheryCache[count] = i;
    count += 1;
  }
  world.hatcheryCacheCount = count;
}

function hatchChickens(world: World): void {
  if (world.tick === 0 || world.tick % HATCH_TICKS !== 0) {
    return;
  }
  refreshHatcheryCache(world);
  for (let i = 0; i < world.hatcheryCacheCount; i += 1) {
    const tile = world.hatcheryCache[i];
    if (tile === undefined) {
      continue;
    }
    const count = world.chickenTileCount[tile];
    if (count === undefined || count >= CHICKEN_TILE_CAP) {
      continue;
    }
    if (!spawnChicken(world.chickens, asTileIndex(tile))) {
      return;
    }
    world.chickenTileCount[tile] = count + 1;
    world.chickensVersion += 1;
  }
}

function liveImpById(world: World, impId: ImpId): Imp | undefined {
  const slot = world.imps.slots[impId];
  if (slot === undefined) {
    return undefined;
  }
  switch (slot.kind) {
    case "empty":
      return undefined;
    case "live":
      return slot.imp;
    default: {
      const never: never = slot;
      return never;
    }
  }
}

function applyPickUp(world: World, impId: ImpId): void {
  const imp = liveImpById(world, impId);
  if (imp === undefined) {
    return;
  }
  const state = imp.state;
  switch (state.kind) {
    case "held":
      return;
    case "idle":
    case "wandering":
    case "walking":
    case "working":
    case "delivering": {
      if (!addHeld(world.hand, imp.id)) {
        return;
      }
      releaseWorker(world.jobs, workerOf(imp));
      removeOccupancy(world.imps, imp.tileY * world.width + imp.tileX);
      clearBoost(imp);
      imp.headingX = 0;
      imp.headingY = 0;
      imp.state = imp.held;
      world.imps.heldCount += 1;
      return;
    }
    default: {
      const never: never = state;
      return never;
    }
  }
}

function applySlap(world: World, impId: ImpId): void {
  const imp = liveImpById(world, impId);
  if (imp === undefined) {
    return;
  }
  if (imp.state.kind === "held") {
    return;
  }
  boostImp(imp);
}

function applyDrop(world: World, impId: ImpId, tileX: number, tileY: number): void {
  if (tileX < 0 || tileY < 0 || tileX >= world.width || tileY >= world.height) {
    return;
  }
  const tile = asTileIndex(tileY * world.width + tileX);
  const code = world.tiles[tile];
  if (code === undefined || !isWalkableCode(code)) {
    return;
  }
  const imp = liveImpById(world, impId);
  if (imp === undefined) {
    return;
  }
  const state = imp.state;
  switch (state.kind) {
    case "held": {
      if (!isHeld(world.hand, imp.id)) {
        return;
      }
      if (!removeHeld(world.hand, imp.id)) {
        return;
      }
      imp.tileX = tileX;
      imp.tileY = tileY;
      imp.prevX = tileX;
      imp.prevZ = tileY;
      imp.currX = tileX;
      imp.currZ = tileY;
      imp.headingX = 0;
      imp.headingY = 0;
      imp.state = imp.idle;
      addOccupancy(world.imps, tileY * world.width + tileX);
      if (world.imps.heldCount > 0) {
        world.imps.heldCount -= 1;
      }
      return;
    }
    case "idle":
    case "wandering":
    case "walking":
    case "working":
    case "delivering":
      return;
    default: {
      const never: never = state;
      return never;
    }
  }
}

function applyRepairHeart(world: World): void {
  if (!world.heartBreached) {
    return;
  }
  if (availableGold(world) < REPAIR_HEART_COST) {
    return;
  }
  const fromStored = world.goldStored < REPAIR_HEART_COST ? world.goldStored : REPAIR_HEART_COST;
  world.goldStored -= fromStored;
  drainTreasury(world, REPAIR_HEART_COST - fromStored);
  world.goldSpent += REPAIR_HEART_COST;
  world.heartHp = HEART_HP;
  world.heartBreached = false;
  world.repairsDone += 1;
}

function applyCommand(world: World, command: Command): void {
  switch (command.kind) {
    case "noop":
      return;
    case "addGold":
      world.goldStored += command.amount;
      return;
    case "tag":
      applyTag(world, command.tile);
      return;
    case "untag":
      applyUntag(world, command.tile);
      return;
    case "paintRoom":
      applyPaintRoom(world, command.tile, command.room);
      return;
    case "paintDoor":
      applyPaintDoor(world, command.tile);
      return;
    case "paintTrap":
      applyPaintTrap(world, command.tile);
      return;
    case "spawnImp":
      spawnImp(world.imps, HEART_X, HEART_Y);
      return;
    case "pickUp":
      applyPickUp(world, command.impId);
      return;
    case "drop":
      applyDrop(world, command.impId, command.tileX, command.tileY);
      return;
    case "slap":
      applySlap(world, command.impId);
      return;
    case "possess":
      applyPossess(world, command.creatureId);
      return;
    case "releasePossess":
      applyReleasePossess(world);
      return;
    case "possessMove":
      applyPossessMove(world, command.creatureId, command.dx, command.dy);
      return;
    case "repairHeart":
      applyRepairHeart(world);
      return;
    default: {
      const never: never = command;
      return never;
    }
  }
}

export function sortCommands(commands: readonly Command[]): CommandLog {
  const indexed = commands.map((command, index) => ({ command, index }));
  indexed.sort((a, b) => {
    if (a.command.tick !== b.command.tick) {
      return a.command.tick - b.command.tick;
    }
    return a.index - b.index;
  });
  const sorted: readonly Command[] = indexed.map((entry) => entry.command);
  return sorted as CommandLog;
}

export function step(world: World, commands: CommandLog): void {
  const tick = world.tick;
  let i = world.commandCursor;
  while (i < commands.length) {
    const command = commands[i];
    if (command === undefined) {
      i += 1;
      continue;
    }
    if (command.tick !== tick) {
      break;
    }
    applyCommand(world, command);
    i += 1;
  }
  world.commandCursor = i;
  runPayday(world);
  stepImps(world);
  hatchChickens(world);
  stepCreatures(world);
  stepHeroes(world);
  resolveCombat(world);
  syncPossession(world);
  advanceRng(world);
  world.tick = asTick(world.tick + 1);
}

export function run(seed: number, commands: CommandLog, ticks: number): World {
  const world = createWorld(seed);
  const sorted = sortCommands(commands);
  for (let i = 0; i < ticks; i += 1) {
    step(world, sorted);
  }
  return world;
}

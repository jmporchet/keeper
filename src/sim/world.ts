import { createCreatureBoard, hashCreatures } from "./creatures";
import { stepCreatures } from "./creatures.hot";
import { addHeld, createHand, hashHand, isHeld, removeHeld } from "./hand";
import { asTick, asTileIndex, type ImpId, type Tick, type TileIndex } from "./ids";
import { boostImp, clearBoost, createImpBoard, hashImps, spawnImp, spawnStartingImps, workerOf, type Imp } from "./imps";
import { stepImps } from "./imps.hot";
import { cancelJobAtTile, createJobBoard, hashJobs, openJob, releaseWorker } from "./jobs";
import {
  HEART_X,
  HEART_Y,
  LAIR_COST,
  MAP_HEIGHT,
  MAP_HALF,
  MAP_WIDTH,
  PORTAL_X,
  PORTAL_Y,
  ROOM_KIND,
  TILE_KIND,
  TREASURY_COST,
  tileKindAt,
  type RoomTool,
} from "./map";
import { createPathScratch, isWalkableCode } from "./path";
import { advanceRng } from "./rng";
import { attachTiles, setTile, type World } from "./worldCore";

export {
  HEART_X,
  HEART_Y,
  MAP_HALF,
  MAP_HEIGHT,
  LAIR_COST,
  MAP_WIDTH,
  PORTAL_X,
  PORTAL_Y,
  ROOM_KIND,
  ROOM_KIND_COUNT,
  ROOM_KINDS,
  roomKindAt,
  TILE_KIND,
  TILE_KIND_COUNT,
  TILE_KINDS,
  TREASURY_CAPACITY,
  TREASURY_COST,
  tileKindAt,
  type RoomKind,
  type RoomKindCode,
  type RoomTool,
  type TileKind,
  type TileKindCode,
  type TileRead,
} from "./map";
export { setTile, type World } from "./worldCore";
export { openClaimJobsAround } from "./claims";
export { lairTileCount, liveCreatureCount } from "./creatures";

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
  | { kind: "spawnImp"; tick: Tick }
  | { kind: "pickUp"; tick: Tick; impId: ImpId }
  | { kind: "drop"; tick: Tick; impId: ImpId; tileX: number; tileY: number }
  | { kind: "slap"; tick: Tick; impId: ImpId };

export type CommandLog = readonly Command[] & { readonly __brand: "CommandLog" };

export function asCommandLog(commands: readonly Command[]): CommandLog {
  return commands as CommandLog;
}

export function requireSorted(commands: readonly Command[]): CommandLog {
  for (let i = 1; i < commands.length; i += 1) {
    const previous = commands[i - 1];
    const current = commands[i];
    if (previous === undefined || current === undefined) {
      throw new Error("missing command");
    }
    if (previous.tick > current.tick) {
      throw new Error("commands are not sorted by tick");
    }
  }
  return asCommandLog(commands);
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
  const treasuryStock = new Uint16Array(width * height);
  const treasuryCache = new Int32Array(width * height);
  const lairCache = new Int32Array(width * height);
  for (let i = 0; i < tiles.length; i += 1) {
    if (tiles[i] === TILE_KIND.goldSeam) {
      goldStock[i] = GOLD_PER_TILE;
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
    treasuryStock,
    treasuryCache,
    treasuryCacheCount: 0,
    treasuryCacheVersion: -1,
    lairCache,
    lairCacheCount: 0,
    lairCacheVersion: -1,
    tilesVersion: 1,
    roomsVersion: 0,
    treasuryVersion: 0,
    goldStored: 0,
    goldSpent: 0,
    goldStock,
    commandCursor: 0,
    jobs: createJobBoard(width * height),
    imps,
    creatures: createCreatureBoard(),
    hand: createHand(),
    pathScratch: createPathScratch(),
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
    default: {
      const never: never = room;
      return never;
    }
  }
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
      clearBoost(imp);
      imp.headingX = 0;
      imp.headingY = 0;
      imp.state = imp.held;
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
  return asCommandLog(indexed.map((entry) => entry.command));
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
  stepImps(world);
  stepCreatures(world);
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

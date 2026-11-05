import { asTick, asTileIndex, type ImpId, type Tick, type TileIndex } from "./ids";

export const TICK_HZ = 20;
export const TICK_DT = 1 / TICK_HZ;
export const MAX_FRAME_DELTA = 0.1;
export const MAX_STEPS_PER_FRAME = 4;

export const MAP_WIDTH = 9;
export const MAP_HEIGHT = 9;
export const MAP_HALF = 4;

export const KIND_EARTH = 0;
export const KIND_GOLD_SEAM = 1;
export const KIND_ROCK = 2;
export const KIND_TAGGED_EARTH = 3;
export const KIND_TAGGED_GOLD = 4;
export const KIND_DIRT = 5;
export const KIND_CLAIMED = 6;
export const KIND_ROOM = 7;

export type TileKind =
  | "earth"
  | "goldSeam"
  | "rock"
  | "taggedEarth"
  | "taggedGold"
  | "dirt"
  | "claimed"
  | "room";

export type Command =
  | { kind: "tag"; tick: Tick; tile: TileIndex }
  | { kind: "untag"; tick: Tick; tile: TileIndex }
  | { kind: "paintRoom"; tick: Tick; tile: TileIndex }
  | { kind: "pickUp"; tick: Tick; imp: ImpId }
  | { kind: "drop"; tick: Tick; tile: TileIndex }
  | { kind: "slap"; tick: Tick; imp: ImpId }
  | { kind: "spawnImp"; tick: Tick }
  | { kind: "addGold"; tick: Tick; amount: number };

export type World = {
  seed: number;
  tick: Tick;
  rng: number;
  width: number;
  height: number;
  tiles: Uint8Array;
  gold: Uint16Array;
  goldStored: number;
  impCount: number;
  heldImp: number;
  slapCount: number;
};

export function tileKindName(kind: number): TileKind {
  switch (kind) {
    case KIND_EARTH:
      return "earth";
    case KIND_GOLD_SEAM:
      return "goldSeam";
    case KIND_ROCK:
      return "rock";
    case KIND_TAGGED_EARTH:
      return "taggedEarth";
    case KIND_TAGGED_GOLD:
      return "taggedGold";
    case KIND_DIRT:
      return "dirt";
    case KIND_CLAIMED:
      return "claimed";
    case KIND_ROOM:
      return "room";
    default:
      return "earth";
  }
}

export function tileIndexAt(world: World, x: number, y: number): TileIndex {
  return asTileIndex(y * world.width + x);
}

export function createWorld(seed: number): World {
  const width = MAP_WIDTH;
  const height = MAP_HEIGHT;
  const tiles = new Uint8Array(width * height);
  const gold = new Uint16Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const lx = x - MAP_HALF;
      const lz = y - MAP_HALF;
      const isGold = lx === 1 && lz === 0;
      const isClaimed = Math.abs(lx) <= 1 && Math.abs(lz) <= 1;
      if (isGold) {
        tiles[i] = KIND_GOLD_SEAM;
        gold[i] = 100;
      } else if (isClaimed) {
        tiles[i] = KIND_CLAIMED;
      } else {
        tiles[i] = KIND_EARTH;
      }
    }
  }
  return {
    seed: seed >>> 0,
    tick: asTick(0),
    rng: seed >>> 0,
    width,
    height,
    tiles,
    gold,
    goldStored: 0,
    impCount: 0,
    heldImp: 0,
    slapCount: 0,
  };
}

function nextRng(world: World): void {
  let t = (world.rng + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  world.rng = (t ^ (t >>> 14)) >>> 0;
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
  h = mix(h, world.impCount);
  h = mix(h, world.heldImp);
  h = mix(h, world.slapCount);
  const tiles = world.tiles;
  for (let i = 0; i < tiles.length; i += 1) {
    const cell = tiles[i];
    if (cell === undefined) {
      continue;
    }
    h = mix(h, cell);
  }
  const gold = world.gold;
  for (let i = 0; i < gold.length; i += 1) {
    const cell = gold[i];
    if (cell === undefined) {
      continue;
    }
    h = mix(h, cell);
  }
  return h >>> 0;
}

function readTile(world: World, tile: TileIndex): number {
  const cell = world.tiles[tile];
  if (cell === undefined) {
    return KIND_EARTH;
  }
  return cell;
}

function writeTile(world: World, tile: TileIndex, kind: number): void {
  if (tile < 0 || tile >= world.tiles.length) {
    return;
  }
  world.tiles[tile] = kind;
}

function tagTile(world: World, tile: TileIndex): void {
  const kind = readTile(world, tile);
  switch (kind) {
    case KIND_EARTH:
      writeTile(world, tile, KIND_TAGGED_EARTH);
      return;
    case KIND_GOLD_SEAM:
      writeTile(world, tile, KIND_TAGGED_GOLD);
      return;
    case KIND_ROCK:
    case KIND_TAGGED_EARTH:
    case KIND_TAGGED_GOLD:
    case KIND_DIRT:
    case KIND_CLAIMED:
    case KIND_ROOM:
      return;
    default:
      return;
  }
}

function untagTile(world: World, tile: TileIndex): void {
  const kind = readTile(world, tile);
  switch (kind) {
    case KIND_TAGGED_EARTH:
      writeTile(world, tile, KIND_EARTH);
      return;
    case KIND_TAGGED_GOLD:
      writeTile(world, tile, KIND_GOLD_SEAM);
      return;
    case KIND_EARTH:
    case KIND_GOLD_SEAM:
    case KIND_ROCK:
    case KIND_DIRT:
    case KIND_CLAIMED:
    case KIND_ROOM:
      return;
    default:
      return;
  }
}

function paintRoom(world: World, tile: TileIndex): void {
  const kind = readTile(world, tile);
  switch (kind) {
    case KIND_CLAIMED:
      writeTile(world, tile, KIND_ROOM);
      return;
    case KIND_EARTH:
    case KIND_GOLD_SEAM:
    case KIND_ROCK:
    case KIND_TAGGED_EARTH:
    case KIND_TAGGED_GOLD:
    case KIND_DIRT:
    case KIND_ROOM:
      return;
    default:
      return;
  }
}

function applyCommand(world: World, command: Command): void {
  switch (command.kind) {
    case "tag":
      tagTile(world, command.tile);
      return;
    case "untag":
      untagTile(world, command.tile);
      return;
    case "paintRoom":
      paintRoom(world, command.tile);
      return;
    case "pickUp":
      world.heldImp = command.imp;
      return;
    case "drop":
      world.heldImp = 0;
      return;
    case "slap":
      world.slapCount += 1;
      return;
    case "spawnImp":
      world.impCount += 1;
      return;
    case "addGold":
      world.goldStored += command.amount;
      return;
    default: {
      const never: never = command;
      return never;
    }
  }
}

function commandRank(command: Command): number {
  switch (command.kind) {
    case "tag":
      return 0;
    case "untag":
      return 1;
    case "paintRoom":
      return 2;
    case "pickUp":
      return 3;
    case "drop":
      return 4;
    case "slap":
      return 5;
    case "spawnImp":
      return 6;
    case "addGold":
      return 7;
    default: {
      const never: never = command;
      return never;
    }
  }
}

function commandKey(command: Command): number {
  switch (command.kind) {
    case "tag":
    case "untag":
    case "paintRoom":
    case "drop":
      return command.tile;
    case "pickUp":
    case "slap":
      return command.imp;
    case "spawnImp":
      return 0;
    case "addGold":
      return command.amount;
    default: {
      const never: never = command;
      return never;
    }
  }
}

function compareCommands(a: Command, b: Command): number {
  const rank = commandRank(a) - commandRank(b);
  if (rank !== 0) {
    return rank;
  }
  return commandKey(a) - commandKey(b);
}

export function step(world: World, commands: readonly Command[]): void {
  const tick = world.tick;
  const pending: Command[] = [];
  for (let i = 0; i < commands.length; i += 1) {
    const command = commands[i];
    if (command === undefined) {
      continue;
    }
    if (command.tick === tick) {
      pending.push(command);
    }
  }
  pending.sort(compareCommands);
  for (let i = 0; i < pending.length; i += 1) {
    const command = pending[i];
    if (command === undefined) {
      continue;
    }
    applyCommand(world, command);
  }
  nextRng(world);
  world.tick = asTick(world.tick + 1);
}

export function run(seed: number, commands: readonly Command[], ticks: number): World {
  const world = createWorld(seed);
  for (let i = 0; i < ticks; i += 1) {
    step(world, commands);
  }
  return world;
}

import { asTick, asTileIndex, type Tick, type TileIndex } from "./ids";

export const TICK_HZ = 20;
export const TICK_DT = 1 / TICK_HZ;
export const MAX_FRAME_DELTA = 0.1;
export const MAX_STEPS_PER_FRAME = 4;

export const MAP_WIDTH = 64;
export const MAP_HEIGHT = 64;
export const MAP_HALF = 32;

export const TILE_KINDS = [
  "earth",
  "goldSeam",
  "rock",
  "dirt",
  "claimed",
  "room",
  "taggedEarth",
  "taggedGold",
] as const;

export type TileKind = (typeof TILE_KINDS)[number];

function kindCode(kind: TileKind): number {
  const index = TILE_KINDS.indexOf(kind);
  if (index < 0) {
    throw new Error("unknown tile kind");
  }
  return index;
}

export const TILE_KIND = {
  earth: kindCode("earth"),
  goldSeam: kindCode("goldSeam"),
  rock: kindCode("rock"),
  dirt: kindCode("dirt"),
  claimed: kindCode("claimed"),
  room: kindCode("room"),
  taggedEarth: kindCode("taggedEarth"),
  taggedGold: kindCode("taggedGold"),
} as const;

export const TILE_KIND_COUNT = TILE_KINDS.length;

export type TileKindCode = (typeof TILE_KIND)[TileKind];

export type TileRead = {
  readonly length: number;
  readonly [index: number]: number;
};

export type Command =
  | { kind: "noop"; tick: Tick }
  | { kind: "addGold"; tick: Tick; amount: number }
  | { kind: "tag"; tick: Tick; tile: TileIndex }
  | { kind: "untag"; tick: Tick; tile: TileIndex };

export type World = {
  seed: number;
  tick: Tick;
  rng: number;
  width: number;
  height: number;
  readonly tiles: TileRead;
  tilesVersion: number;
  goldStored: number;
  commandCursor: number;
};

const TILE_BUFFERS = new WeakMap<World, Uint8Array>();

function tilesBuffer(world: World): Uint8Array {
  const tiles = TILE_BUFFERS.get(world);
  if (tiles === undefined) {
    throw new Error("missing tiles");
  }
  return tiles;
}

export function tileKindAt(tiles: TileRead, index: number): TileKind {
  const code = tiles[index];
  if (code === undefined) {
    throw new Error("tile index out of range");
  }
  const kind = TILE_KINDS[code];
  if (kind === undefined) {
    throw new Error("invalid tile kind");
  }
  return kind;
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
  const world: World = {
    seed: seed >>> 0,
    tick: asTick(0),
    rng: seed >>> 0,
    width,
    height,
    tiles,
    tilesVersion: 1,
    goldStored: 0,
    commandCursor: 0,
  };
  TILE_BUFFERS.set(world, tiles);
  return world;
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

export function setTile(world: World, index: number, code: TileKindCode): void {
  const tiles = tilesBuffer(world);
  if (index < 0 || index >= tiles.length) {
    throw new Error("tile index out of range");
  }
  if (tiles[index] === code) {
    return;
  }
  tiles[index] = code;
  world.tilesVersion += 1;
}

export function hashWorld(world: World): number {
  let h = 2166136261;
  h = mix(h, world.seed);
  h = mix(h, world.tick);
  h = mix(h, world.rng);
  h = mix(h, world.width);
  h = mix(h, world.height);
  h = mix(h, world.goldStored);
  h = mix(h, world.tilesVersion);
  const tiles = world.tiles;
  for (let i = 0; i < tiles.length; i += 1) {
    const cell = tiles[i];
    if (cell === undefined) {
      continue;
    }
    h = mix(h, cell);
  }
  return h >>> 0;
}

function applyTag(world: World, tile: TileIndex): void {
  const kind = tileKindAt(world.tiles, tile);
  switch (kind) {
    case "earth":
      setTile(world, tile, TILE_KIND.taggedEarth);
      return;
    case "goldSeam":
      setTile(world, tile, TILE_KIND.taggedGold);
      return;
    case "taggedEarth":
    case "taggedGold":
    case "rock":
    case "dirt":
    case "claimed":
    case "room":
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
      return;
    case "taggedGold":
      setTile(world, tile, TILE_KIND.goldSeam);
      return;
    case "earth":
    case "goldSeam":
    case "rock":
    case "dirt":
    case "claimed":
    case "room":
      return;
    default: {
      const never: never = kind;
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
    default: {
      const never: never = command;
      return never;
    }
  }
}

export function sortCommands(commands: readonly Command[]): Command[] {
  const indexed = commands.map((command, index) => ({ command, index }));
  indexed.sort((a, b) => {
    if (a.command.tick !== b.command.tick) {
      return a.command.tick - b.command.tick;
    }
    return a.index - b.index;
  });
  return indexed.map((entry) => entry.command);
}

export function step(world: World, commands: readonly Command[]): void {
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
  nextRng(world);
  world.tick = asTick(world.tick + 1);
}

export function run(seed: number, commands: readonly Command[], ticks: number): World {
  const world = createWorld(seed);
  const sorted = sortCommands(commands);
  for (let i = 0; i < ticks; i += 1) {
    step(world, sorted);
  }
  return world;
}

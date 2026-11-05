import { asTick, type Tick } from "./ids";

export const TICK_HZ = 20;
export const TICK_DT = 1 / TICK_HZ;
export const MAX_FRAME_DELTA = 0.1;
export const MAX_STEPS_PER_FRAME = 4;

export const MAP_WIDTH = 64;
export const MAP_HEIGHT = 64;
export const MAP_HALF = 32;

export const TILE_KIND = {
  earth: 0,
  goldSeam: 1,
  rock: 2,
  dirt: 3,
  claimed: 4,
  room: 5,
} as const;

export type TileKind = keyof typeof TILE_KIND;
export type TileKindCode = (typeof TILE_KIND)[TileKind];

const TILE_KIND_FROM_CODE: readonly TileKind[] = [
  "earth",
  "goldSeam",
  "rock",
  "dirt",
  "claimed",
  "room",
];

export type Command =
  | { kind: "noop"; tick: Tick }
  | { kind: "addGold"; tick: Tick; amount: number };

export type World = {
  seed: number;
  tick: Tick;
  rng: number;
  width: number;
  height: number;
  tiles: Uint8Array;
  goldStored: number;
  commandCursor: number;
};

export function tileKindAt(tiles: Uint8Array, index: number): TileKind {
  const code = tiles[index];
  if (code === undefined) {
    throw new Error("tile index out of range");
  }
  const kind = TILE_KIND_FROM_CODE[code];
  if (kind === undefined) {
    throw new Error("invalid tile kind");
  }
  return kind;
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
  return {
    seed: seed >>> 0,
    tick: asTick(0),
    rng: seed >>> 0,
    width,
    height,
    tiles,
    goldStored: 0,
    commandCursor: 0,
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

function applyCommand(world: World, command: Command): void {
  switch (command.kind) {
    case "noop":
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

function compareCommands(a: Command, b: Command): number {
  if (a.kind !== b.kind) {
    if (a.kind === "noop") {
      return -1;
    }
    return 1;
  }
  switch (a.kind) {
    case "noop":
      return 0;
    case "addGold": {
      switch (b.kind) {
        case "addGold":
          return a.amount - b.amount;
        case "noop":
          return 0;
        default: {
          const never: never = b;
          return never;
        }
      }
    }
    default: {
      const never: never = a;
      return never;
    }
  }
}

export function sortCommands(commands: readonly Command[]): Command[] {
  const sorted = commands.slice();
  sorted.sort((a, b) => {
    if (a.tick !== b.tick) {
      return a.tick - b.tick;
    }
    return compareCommands(a, b);
  });
  return sorted;
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

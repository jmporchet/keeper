import { asTick, asTileIndex, type Tick, type TileIndex } from "./ids";
import { createImpBoard, hashImps, spawnStartingImps } from "./imps";
import { stepImps } from "./imps.hot";
import { cancelJobAtTile, createJobBoard, hashJobs, openJob } from "./jobs";
import { MAP_HEIGHT, MAP_HALF, MAP_WIDTH, TILE_KIND, tileKindAt } from "./map";
import { createPathScratch } from "./path";
import { advanceRng } from "./rng";
import { attachTiles, setTile, type World } from "./worldCore";

export {
  HEART_X,
  HEART_Y,
  MAP_HALF,
  MAP_HEIGHT,
  MAP_WIDTH,
  TILE_KIND,
  TILE_KIND_COUNT,
  TILE_KINDS,
  tileKindAt,
  type TileKind,
  type TileKindCode,
  type TileRead,
} from "./map";
export { setTile, type World } from "./worldCore";
export { openClaimJobsAround } from "./claims";

export const TICK_HZ = 20;
export const TICK_DT = 1 / TICK_HZ;
export const MAX_FRAME_DELTA = 0.1;
export const MAX_STEPS_PER_FRAME = 4;
export const GOLD_PER_TILE = 40;

export type Command =
  | { kind: "noop"; tick: Tick }
  | { kind: "addGold"; tick: Tick; amount: number }
  | { kind: "tag"; tick: Tick; tile: TileIndex }
  | { kind: "untag"; tick: Tick; tile: TileIndex };

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
  const goldStock = new Uint32Array(width * height);
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
    tilesVersion: 1,
    goldStored: 0,
    goldStock,
    commandCursor: 0,
    jobs: createJobBoard(width * height),
    imps,
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
  h = mix(h, world.goldStock.length);
  for (let i = 0; i < world.goldStock.length; i += 1) {
    const stock = world.goldStock[i];
    if (stock === undefined) {
      continue;
    }
    h = mix(h, stock);
  }
  h = mix(h, world.tilesVersion);
  h = mix(h, hashJobs(world.jobs));
  const tiles = world.tiles;
  for (let i = 0; i < tiles.length; i += 1) {
    const cell = tiles[i];
    if (cell === undefined) {
      continue;
    }
    h = mix(h, cell);
  }
  h = mix(h, hashImps(world.imps));
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
  stepImps(world);
  advanceRng(world);
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

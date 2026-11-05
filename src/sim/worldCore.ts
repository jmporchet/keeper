import type { ChickenBoard } from "./chickens";
import type { CreatureBoard } from "./creatures";
import type { Hand } from "./hand";
import type { HeroBoard } from "./heroes";
import type { Tick } from "./ids";
import type { ImpBoard } from "./imps";
import type { JobBoard } from "./jobs";
import type { TileKindCode, TileRead } from "./map";
import { isWalkableCode, type PathScratch } from "./path";
import type { Possession } from "./possession";

export type World = {
  seed: number;
  tick: Tick;
  rng: number;
  width: number;
  height: number;
  readonly tiles: TileRead;
  readonly rooms: Uint8Array;
  readonly doorHp: Uint8Array;
  readonly doorOpen: Uint8Array;
  readonly trapState: Uint8Array;
  readonly treasuryStock: Uint16Array;
  readonly treasuryCache: Int32Array;
  treasuryCacheCount: number;
  treasuryCacheVersion: number;
  readonly lairCache: Int32Array;
  lairCacheCount: number;
  lairCacheVersion: number;
  readonly hatcheryCache: Int32Array;
  hatcheryCacheCount: number;
  hatcheryCacheVersion: number;
  readonly trainingCache: Int32Array;
  trainingCacheCount: number;
  trainingCacheVersion: number;
  readonly workshopCache: Int32Array;
  workshopCacheCount: number;
  workshopCacheVersion: number;
  readonly libraryCache: Int32Array;
  libraryCacheCount: number;
  libraryCacheVersion: number;
  readonly chickenTileCount: Uint16Array;
  chickens: ChickenBoard;
  chickensVersion: number;
  tilesVersion: number;
  roomsVersion: number;
  doorVersion: number;
  trapVersion: number;
  treasuryVersion: number;
  goldStored: number;
  goldSpent: number;
  goldPaidOut: number;
  goldStock: Uint32Array;
  heartHp: number;
  heartMaxHp: number;
  heartBreached: boolean;
  breachTicks: number;
  defeated: boolean;
  wavesCleared: number;
  victorious: boolean;
  waveActive: boolean;
  repairsDone: number;
  researchDone: boolean;
  lightningCooldown: number;
  healCooldown: number;
  speedImpsCooldown: number;
  commandCursor: number;
  jobs: JobBoard;
  imps: ImpBoard;
  creatures: CreatureBoard;
  heroes: HeroBoard;
  hand: Hand;
  possession: Possession;
  pathScratch: PathScratch;
  walkableSaturated: boolean;
  walkableTileCount: number;
};

const TILE_BUFFERS = new WeakMap<World, Uint8Array>();

function tilesBuffer(world: World): Uint8Array {
  const tiles = TILE_BUFFERS.get(world);
  if (tiles === undefined) {
    throw new Error("missing tiles");
  }
  return tiles;
}

export function attachTiles(world: World, tiles: Uint8Array): void {
  TILE_BUFFERS.set(world, tiles);
}

export function setTile(world: World, index: number, code: TileKindCode): void {
  const tiles = tilesBuffer(world);
  if (index < 0 || index >= tiles.length) {
    throw new Error("tile index out of range");
  }
  const before = tiles[index];
  if (before === undefined) {
    throw new Error("tile index out of range");
  }
  if (before === code) {
    return;
  }
  const wasWalkable = isWalkableCode(before);
  const isWalkable = isWalkableCode(code);
  tiles[index] = code;
  if (wasWalkable !== isWalkable) {
    world.walkableTileCount += isWalkable ? 1 : -1;
  }
  world.tilesVersion += 1;
}

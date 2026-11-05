import type { CreatureBoard } from "./creatures";
import type { Hand } from "./hand";
import type { Tick } from "./ids";
import type { ImpBoard } from "./imps";
import type { JobBoard } from "./jobs";
import type { TileKindCode, TileRead } from "./map";
import type { PathScratch } from "./path";

export type World = {
  seed: number;
  tick: Tick;
  rng: number;
  width: number;
  height: number;
  readonly tiles: TileRead;
  readonly rooms: Uint8Array;
  readonly treasuryStock: Uint16Array;
  readonly treasuryCache: Int32Array;
  treasuryCacheCount: number;
  treasuryCacheVersion: number;
  readonly lairCache: Int32Array;
  lairCacheCount: number;
  lairCacheVersion: number;
  tilesVersion: number;
  roomsVersion: number;
  treasuryVersion: number;
  goldStored: number;
  goldSpent: number;
  goldStock: Uint32Array;
  commandCursor: number;
  jobs: JobBoard;
  imps: ImpBoard;
  creatures: CreatureBoard;
  hand: Hand;
  pathScratch: PathScratch;
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
  if (tiles[index] === code) {
    return;
  }
  tiles[index] = code;
  world.tilesVersion += 1;
}

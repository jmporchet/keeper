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
  tilesVersion: number;
  goldStored: number;
  goldStock: Uint32Array;
  commandCursor: number;
  jobs: JobBoard;
  imps: ImpBoard;
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

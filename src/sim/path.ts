import { MAP_HEIGHT, MAP_WIDTH, TILE_KIND } from "./map";

export const PATH_CELL_COUNT = MAP_WIDTH * MAP_HEIGHT;

export type PathScratch = {
  queue: Int32Array;
  generation: Uint32Array;
  gen: number;
  cameFrom: Int32Array;
  reachable: Int32Array;
  distance: Int32Array;
  reverseBuf: Int32Array;
};

export function createPathScratch(): PathScratch {
  return {
    queue: new Int32Array(PATH_CELL_COUNT),
    generation: new Uint32Array(PATH_CELL_COUNT),
    gen: 1,
    cameFrom: new Int32Array(PATH_CELL_COUNT),
    reachable: new Int32Array(PATH_CELL_COUNT),
    distance: new Int32Array(PATH_CELL_COUNT),
    reverseBuf: new Int32Array(PATH_CELL_COUNT),
  };
}

export function isWalkableCode(code: number): boolean {
  return (
    code === TILE_KIND.claimed ||
    code === TILE_KIND.dirt ||
    code === TILE_KIND.room ||
    code === TILE_KIND.portal
  );
}

export function bumpPathGen(scratch: PathScratch): number {
  let gen = scratch.gen + 1;
  if (gen === 0) {
    scratch.generation.fill(0);
    gen = 1;
  }
  scratch.gen = gen;
  return gen;
}

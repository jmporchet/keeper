import type { TileRead } from "./map";
import { bumpPathGen, type PathScratch } from "./path";
import { bfsToGoal, reconstructPath } from "./path.hot";

export const STEPS_PER_TILE = 6;

export function findPath(
  tiles: TileRead,
  width: number,
  height: number,
  start: number,
  goal: number,
  scratch: PathScratch,
  outPath: Int16Array,
): number {
  const gen = bumpPathGen(scratch);
  const reached = bfsToGoal(
    tiles,
    width,
    height,
    start,
    goal,
    scratch.queue,
    scratch.generation,
    gen,
    scratch.cameFrom,
    scratch.distance,
  );
  if (!reached) {
    return 0;
  }
  return reconstructPath(start, goal, scratch.cameFrom, scratch.reverseBuf, outPath);
}

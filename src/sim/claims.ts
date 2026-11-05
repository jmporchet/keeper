import { asTileIndex, type TileIndex } from "./ids";
import { jobAtTile, openJob } from "./jobs";
import { TILE_KIND, type TileRead } from "./map";
import type { World } from "./worldCore";

function isClaimedTile(tiles: TileRead, width: number, height: number, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return false;
  }
  const code = tiles[y * width + x];
  return code !== undefined && code === TILE_KIND.claimed;
}

function hasClaimedNeighbour(tiles: TileRead, width: number, height: number, x: number, y: number): boolean {
  return (
    isClaimedTile(tiles, width, height, x, y - 1) ||
    isClaimedTile(tiles, width, height, x + 1, y) ||
    isClaimedTile(tiles, width, height, x, y + 1) ||
    isClaimedTile(tiles, width, height, x - 1, y)
  );
}

function openClaimJobOn(world: World, x: number, y: number): void {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) {
    return;
  }
  const tile = asTileIndex(y * world.width + x);
  const code = world.tiles[tile];
  if (code === undefined || code !== TILE_KIND.dirt) {
    return;
  }
  if (jobAtTile(world.jobs, tile) !== undefined) {
    return;
  }
  if (!hasClaimedNeighbour(world.tiles, world.width, world.height, x, y)) {
    return;
  }
  openJob(world.jobs, tile, "claim");
}

export function openClaimJobsAround(world: World, tile: TileIndex): void {
  const y = (tile / world.width) | 0;
  const x = tile - y * world.width;
  openClaimJobOn(world, x, y);
  openClaimJobOn(world, x, y - 1);
  openClaimJobOn(world, x + 1, y);
  openClaimJobOn(world, x, y + 1);
  openClaimJobOn(world, x - 1, y);
}

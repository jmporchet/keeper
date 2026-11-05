import { describe, expect, it } from "vitest";
import { findPath } from "./pathfind";
import { createPathScratch, isWalkableCode } from "./path";
import { MAP_HEIGHT, MAP_WIDTH, TILE_KIND } from "./world";

function idx(x: number, y: number): number {
  return y * MAP_WIDTH + x;
}

function fillEarth(tiles: Uint8Array): void {
  tiles.fill(TILE_KIND.earth);
}

function claim(tiles: Uint8Array, x: number, y: number): void {
  tiles[idx(x, y)] = TILE_KIND.claimed;
}

function rock(tiles: Uint8Array, x: number, y: number): void {
  tiles[idx(x, y)] = TILE_KIND.rock;
}

function pathTiles(path: Int16Array, length: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < length; i += 1) {
    const tile = path[i];
    if (tile === undefined) {
      continue;
    }
    out.push(tile);
  }
  return out;
}

function formatPath(path: Int16Array, length: number): string {
  const parts: string[] = [];
  for (let i = 0; i < length; i += 1) {
    const tile = path[i];
    if (tile === undefined) {
      continue;
    }
    const y = (tile / MAP_WIDTH) | 0;
    const x = tile - y * MAP_WIDTH;
    parts.push(`(${String(x)},${String(y)})`);
  }
  return parts.join(" ");
}

function assertWalkablePath(tiles: Uint8Array, path: Int16Array, length: number): void {
  expect(length).toBeGreaterThan(0);
  for (let i = 0; i < length; i += 1) {
    const tile = path[i];
    if (tile === undefined) {
      throw new Error("missing path tile");
    }
    const code = tiles[tile];
    if (code === undefined) {
      throw new Error("path tile out of range");
    }
    expect(isWalkableCode(code)).toBe(true);
    expect(code).not.toBe(TILE_KIND.earth);
    expect(code).not.toBe(TILE_KIND.rock);
    expect(code).not.toBe(TILE_KIND.goldSeam);
  }
}

describe("grid pathfinding", () => {
  it("finds the shortest 4-neighbour path on claimed floor", () => {
    const tiles = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
    fillEarth(tiles);
    for (let x = 8; x <= 16; x += 1) {
      claim(tiles, x, 8);
    }
    const scratch = createPathScratch();
    const out = new Int16Array(MAP_WIDTH * MAP_HEIGHT);
    const length = findPath(tiles, MAP_WIDTH, MAP_HEIGHT, idx(8, 8), idx(16, 8), scratch, out);
    expect(length).toBe(9);
    expect(formatPath(out, length)).toBe(
      "(8,8) (9,8) (10,8) (11,8) (12,8) (13,8) (14,8) (15,8) (16,8)",
    );
    assertWalkablePath(tiles, out, length);
  });

  it("routes around a wall and never through rock or earth", () => {
    const tiles = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
    fillEarth(tiles);
    for (let y = 10; y <= 16; y += 1) {
      for (let x = 10; x <= 16; x += 1) {
        claim(tiles, x, y);
      }
    }
    rock(tiles, 13, 11);
    rock(tiles, 13, 12);
    rock(tiles, 13, 13);
    tiles[idx(13, 12)] = TILE_KIND.earth;
    const scratch = createPathScratch();
    const out = new Int16Array(MAP_WIDTH * MAP_HEIGHT);
    const length = findPath(tiles, MAP_WIDTH, MAP_HEIGHT, idx(12, 12), idx(14, 12), scratch, out);
    expect(length).toBe(7);
    expect(formatPath(out, length)).toMatchSnapshot();
    assertWalkablePath(tiles, out, length);
    const visited = pathTiles(out, length);
    expect(visited).not.toContain(idx(13, 11));
    expect(visited).not.toContain(idx(13, 12));
    expect(visited).not.toContain(idx(13, 13));
    expect(visited[0]).toBe(idx(12, 12));
    expect(visited[visited.length - 1]).toBe(idx(14, 12));
  });

  it("returns no path through solid tiles or when the goal is unreachable", () => {
    const tiles = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
    fillEarth(tiles);
    claim(tiles, 4, 4);
    claim(tiles, 20, 20);
    const scratch = createPathScratch();
    const out = new Int16Array(MAP_WIDTH * MAP_HEIGHT);
    expect(findPath(tiles, MAP_WIDTH, MAP_HEIGHT, idx(4, 4), idx(20, 20), scratch, out)).toBe(0);
    expect(findPath(tiles, MAP_WIDTH, MAP_HEIGHT, idx(4, 4), idx(5, 4), scratch, out)).toBe(0);
    claim(tiles, 5, 4);
    expect(findPath(tiles, MAP_WIDTH, MAP_HEIGHT, idx(4, 4), idx(5, 4), scratch, out)).toBe(2);
  });
});

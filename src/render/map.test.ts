import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import {
  sortCommands,
  asImpId,
  asTick,
  asTileIndex,
  createWorld,
  liveImpCount,
  MAP_WIDTH,
  setTile,
  STARTING_IMP_COUNT,
  step,
  TILE_KIND,
  TILE_KINDS,
  type TileRead,
} from "../sim";
import { ATLAS_CELL, atlasCellForKind } from "./atlas";
import { createImpMeshes, syncImps } from "./imps";
import { countTilesByKind, createMapMeshes, syncMap } from "./map";
import {
  WALL_EAST,
  WALL_NORTH,
  WALL_SOUTH,
  WALL_WEST,
  wallFaceMask,
} from "./map.hot";

function popcount(mask: number): number {
  let count = 0;
  let value = mask;
  while (value !== 0) {
    count += value & 1;
    value >>>= 1;
  }
  return count;
}

function expectedGroupCounts(map: ReturnType<typeof createMapMeshes>, tiles: TileRead): Uint32Array {
  const expected = countTilesByKind(tiles);
  const groups = new Uint32Array(map.meshes.length);
  for (let k = 0; k < expected.length; k += 1) {
    const group = map.kindToGroup[k];
    const count = expected[k];
    if (group === undefined || count === undefined) {
      continue;
    }
    const current = groups[group];
    if (current === undefined) {
      continue;
    }
    groups[group] = current + count;
  }
  for (let i = 0; i < tiles.length; i += 1) {
    const code = tiles[i];
    if (code === undefined) {
      continue;
    }
    const group = map.kindToGroup[code];
    if (group === undefined) {
      continue;
    }
    const current = groups[group];
    if (current === undefined) {
      continue;
    }
    groups[group] = current + popcount(wallFaceMask(tiles, MAP_WIDTH, i));
  }
  return groups;
}

describe("map instances", () => {
  it("instance counts per kind match the grid", () => {
    const world = createWorld(1);
    const scene = new THREE.Scene();
    const map = createMapMeshes(scene);
    syncMap(world, map, 0);
    const expected = countTilesByKind(world.tiles);
    for (let k = 0; k < expected.length; k += 1) {
      expect(map.counts[k]).toBe(expected[k]);
    }
    const groups = expectedGroupCounts(map, world.tiles);
    for (let g = 0; g < map.meshes.length; g += 1) {
      const mesh = map.meshes[g];
      if (mesh === undefined) {
        throw new Error("missing mesh");
      }
      expect(mesh.count).toBe(groups[g]);
    }
    expect(map.counts[TILE_KIND.earth]).toBe(expected[TILE_KIND.earth]);
    expect(map.counts[TILE_KIND.rock]).toBe(expected[TILE_KIND.rock]);
    expect(map.counts[TILE_KIND.goldSeam]).toBe(expected[TILE_KIND.goldSeam]);
    expect(map.counts[TILE_KIND.claimed]).toBe(expected[TILE_KIND.claimed]);
    expect(map.counts[TILE_KIND.dirt]).toBe(0);
    expect(map.counts[TILE_KIND.room]).toBe(0);
    expect(map.counts[TILE_KIND.taggedEarth]).toBe(0);
    expect(map.counts[TILE_KIND.taggedGold]).toBe(0);
    expect(map.counts[TILE_KIND.portal]).toBe(1);
    setTile(world, 0, TILE_KIND.dirt);
    syncMap(world, map, 0);
    const after = countTilesByKind(world.tiles);
    for (let k = 0; k < after.length; k += 1) {
      expect(map.counts[k]).toBe(after[k]);
    }
    const groupsAfter = expectedGroupCounts(map, world.tiles);
    for (let g = 0; g < map.meshes.length; g += 1) {
      const mesh = map.meshes[g];
      if (mesh === undefined) {
        throw new Error("missing mesh");
      }
      expect(mesh.count).toBe(groupsAfter[g]);
    }
  });

  it("does not rewrite instance matrices when tilesVersion is unchanged", () => {
    const world = createWorld(1);
    const scene = new THREE.Scene();
    const map = createMapMeshes(scene);
    syncMap(world, map, 0);
    const group = map.kindToGroup[TILE_KIND.earth];
    if (group === undefined) {
      throw new Error("missing earth group");
    }
    const mesh = map.meshes[group];
    if (mesh === undefined) {
      throw new Error("missing mesh");
    }
    const spy = vi.spyOn(mesh, "setMatrixAt");
    const version = world.tilesVersion;
    syncMap(world, map, 0);
    expect(map.syncedVersion).toBe(version);
    expect(spy).not.toHaveBeenCalled();
    setTile(world, 0, TILE_KIND.dirt);
    syncMap(world, map, 0);
    expect(map.syncedVersion).toBe(world.tilesVersion);
    expect(spy).toHaveBeenCalled();
  });

  it("assigns an atlas cell to each packed tile instance", () => {
    const world = createWorld(1);
    const scene = new THREE.Scene();
    const map = createMapMeshes(scene);
    syncMap(world, map, 0);
    const slots = new Uint32Array(map.meshes.length);
    for (let i = 0; i < world.tiles.length; i += 1) {
      const code = world.tiles[i];
      if (code === undefined) {
        continue;
      }
      const kind = TILE_KINDS[code];
      if (kind === undefined) {
        continue;
      }
      const group = map.kindToGroup[code];
      if (group === undefined) {
        continue;
      }
      const slot = slots[group];
      const attribute = map.atlasAttributes[group];
      if (slot === undefined || attribute === undefined) {
        continue;
      }
      expect(attribute.array[slot]).toBe(atlasCellForKind(kind));
      slots[group] = slot + 1;
    }
  });

  it("packs wall faces into the high tile groups with the wall atlas cell", () => {
    const world = createWorld(1);
    const scene = new THREE.Scene();
    const map = createMapMeshes(scene);
    syncMap(world, map, 0);
    const tileCounts = new Uint32Array(map.meshes.length);
    for (let i = 0; i < world.tiles.length; i += 1) {
      const code = world.tiles[i];
      if (code === undefined) {
        continue;
      }
      const group = map.kindToGroup[code];
      if (group === undefined) {
        continue;
      }
      const current = tileCounts[group];
      if (current === undefined) {
        continue;
      }
      tileCounts[group] = current + 1;
    }
    let wallTotal = 0;
    for (let g = 0; g < map.meshes.length; g += 1) {
      const mesh = map.meshes[g];
      const attribute = map.atlasAttributes[g];
      const start = tileCounts[g];
      if (mesh === undefined || attribute === undefined || start === undefined) {
        continue;
      }
      for (let slot = start; slot < mesh.count; slot += 1) {
        expect(attribute.array[slot]).toBe(ATLAS_CELL.wall);
        wallTotal += 1;
      }
    }
    expect(wallTotal).toBeGreaterThan(0);
  });

  it("draws one instance per live imp", () => {
    const world = createWorld(1);
    const scene = new THREE.Scene();
    const visual = createImpMeshes(scene);
    syncImps(world.imps, world.hand, 1, undefined, visual, 0);
    expect(visual.mesh.count).toBe(STARTING_IMP_COUNT);
    expect(liveImpCount(world.imps)).toBe(STARTING_IMP_COUNT);
  });

  it("skips held imps on the grid and draws them near the cursor", () => {
    const world = createWorld(1);
    step(world, sortCommands([{ kind: "pickUp", tick: asTick(0), impId: asImpId(0) }]));
    const scene = new THREE.Scene();
    const visual = createImpMeshes(scene);
    syncImps(world.imps, world.hand, 1, undefined, visual, 0);
    expect(visual.mesh.count).toBe(STARTING_IMP_COUNT - 1);
    syncImps(world.imps, world.hand, 1, asTileIndex(33 * MAP_WIDTH + 33), visual, 0);
    expect(visual.mesh.count).toBe(STARTING_IMP_COUNT);
  });
});

describe("cave wall face edges", () => {
  it("marks every side of a high tile that borders low floor", () => {
    const width = 5;
    const tiles = new Uint8Array(width * width).fill(TILE_KIND.rock);
    const center = 2 * width + 2;
    tiles[center] = TILE_KIND.earth;
    tiles[center - width] = TILE_KIND.claimed;
    tiles[center + width] = TILE_KIND.dirt;
    tiles[center - 1] = TILE_KIND.room;
    tiles[center + 1] = TILE_KIND.portal;
    expect(wallFaceMask(tiles, width, center)).toBe(
      WALL_NORTH | WALL_SOUTH | WALL_WEST | WALL_EAST,
    );
  });

  it("does not mark walls between high tiles or on a low tile", () => {
    const width = 3;
    const tiles = new Uint8Array(width * width).fill(TILE_KIND.rock);
    const center = 4;
    tiles[center] = TILE_KIND.earth;
    expect(wallFaceMask(tiles, width, center)).toBe(0);
    tiles[center + 1] = TILE_KIND.dirt;
    expect(wallFaceMask(tiles, width, center + 1)).toBe(0);
    expect(wallFaceMask(tiles, width, center)).toBe(WALL_EAST);
  });

  it("treats gold, tagged and rock tiles as high edges", () => {
    const width = 3;
    const kinds = [
      TILE_KIND.goldSeam,
      TILE_KIND.taggedEarth,
      TILE_KIND.taggedGold,
      TILE_KIND.rock,
    ];
    for (const kind of kinds) {
      const tiles = new Uint8Array(width * width).fill(TILE_KIND.rock);
      const center = 4;
      tiles[center] = kind;
      tiles[center + 1] = TILE_KIND.claimed;
      expect(wallFaceMask(tiles, width, center)).toBe(WALL_EAST);
    }
  });

  it("clips wall faces at the map edge", () => {
    const width = 3;
    const tiles = new Uint8Array(width * width).fill(TILE_KIND.rock);
    tiles[0] = TILE_KIND.earth;
    tiles[1] = TILE_KIND.dirt;
    tiles[3] = TILE_KIND.claimed;
    expect(wallFaceMask(tiles, width, 0)).toBe(WALL_EAST | WALL_SOUTH);
  });
});

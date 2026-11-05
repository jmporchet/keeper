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
  type TileRead,
} from "../sim";
import { createImpMeshes, syncImps } from "./imps";
import { countTilesByKind, createMapMeshes, syncMap } from "./map";

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

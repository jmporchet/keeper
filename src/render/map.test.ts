import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { createWorld, liveImpCount, setTile, STARTING_IMP_COUNT, TILE_KIND } from "../sim";
import { createImpMeshes, syncImps } from "./imps";
import { countTilesByKind, createMapMeshes, syncMap } from "./map";

describe("map instances", () => {
  it("instance counts per kind match the grid", () => {
    const world = createWorld(1);
    const scene = new THREE.Scene();
    const map = createMapMeshes(scene);
    syncMap(world.tiles, world.width, world.tilesVersion, map);
    const expected = countTilesByKind(world.tiles);
    for (let k = 0; k < map.meshes.length; k += 1) {
      const mesh = map.meshes[k];
      if (mesh === undefined) {
        throw new Error("missing mesh");
      }
      expect(mesh.count).toBe(expected[k]);
    }
    expect(map.counts[TILE_KIND.earth]).toBe(expected[TILE_KIND.earth]);
    expect(map.counts[TILE_KIND.rock]).toBe(expected[TILE_KIND.rock]);
    expect(map.counts[TILE_KIND.goldSeam]).toBe(expected[TILE_KIND.goldSeam]);
    expect(map.counts[TILE_KIND.claimed]).toBe(expected[TILE_KIND.claimed]);
    expect(map.counts[TILE_KIND.dirt]).toBe(0);
    expect(map.counts[TILE_KIND.room]).toBe(0);
    expect(map.counts[TILE_KIND.taggedEarth]).toBe(0);
    expect(map.counts[TILE_KIND.taggedGold]).toBe(0);
    setTile(world, 0, TILE_KIND.dirt);
    syncMap(world.tiles, world.width, world.tilesVersion, map);
    const after = countTilesByKind(world.tiles);
    for (let k = 0; k < map.meshes.length; k += 1) {
      const mesh = map.meshes[k];
      if (mesh === undefined) {
        throw new Error("missing mesh");
      }
      expect(mesh.count).toBe(after[k]);
    }
  });

  it("does not rewrite instance matrices when tilesVersion is unchanged", () => {
    const world = createWorld(1);
    const scene = new THREE.Scene();
    const map = createMapMeshes(scene);
    syncMap(world.tiles, world.width, world.tilesVersion, map);
    const mesh = map.meshes[TILE_KIND.earth];
    if (mesh === undefined) {
      throw new Error("missing mesh");
    }
    const spy = vi.spyOn(mesh, "setMatrixAt");
    const version = world.tilesVersion;
    syncMap(world.tiles, world.width, version, map);
    expect(map.syncedVersion).toBe(version);
    expect(spy).not.toHaveBeenCalled();
    setTile(world, 0, TILE_KIND.dirt);
    syncMap(world.tiles, world.width, world.tilesVersion, map);
    expect(map.syncedVersion).toBe(world.tilesVersion);
    expect(spy).toHaveBeenCalled();
  });

  it("draws one instance per live imp", () => {
    const world = createWorld(1);
    const scene = new THREE.Scene();
    const visual = createImpMeshes(scene);
    syncImps(world.imps, 1, visual);
    expect(visual.mesh.count).toBe(STARTING_IMP_COUNT);
    expect(liveImpCount(world.imps)).toBe(STARTING_IMP_COUNT);
  });
});

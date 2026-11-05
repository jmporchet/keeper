import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createWorld, TILE_KIND } from "../sim";
import { countTilesByKind, createMapMeshes, syncMap } from "./map";

describe("map instances", () => {
  it("instance counts per kind match the grid", () => {
    const world = createWorld(1);
    const scene = new THREE.Scene();
    const map = createMapMeshes(scene);
    syncMap(world.tiles, world.width, map);
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
    world.tiles[0] = TILE_KIND.dirt;
    syncMap(world.tiles, world.width, map);
    const after = countTilesByKind(world.tiles);
    for (let k = 0; k < map.meshes.length; k += 1) {
      const mesh = map.meshes[k];
      if (mesh === undefined) {
        throw new Error("missing mesh");
      }
      expect(mesh.count).toBe(after[k]);
    }
  });
});

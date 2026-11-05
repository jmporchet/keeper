import * as THREE from "three";
import { MAP_HEIGHT, MAP_WIDTH } from "../sim";
import { syncMapInstances } from "./map.hot";
import { TILE_COLOR, TILE_KIND_COUNT } from "./tileLookups";

export type MapMeshes = {
  meshes: THREE.InstancedMesh[];
  dummy: THREE.Object3D;
  counts: Uint32Array;
  syncedVersion: number;
};

const CAPACITY = MAP_WIDTH * MAP_HEIGHT;

export function createMapMeshes(scene: THREE.Scene): MapMeshes {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const meshes: THREE.InstancedMesh[] = [];
  for (let k = 0; k < TILE_KIND_COUNT; k += 1) {
    const hex = TILE_COLOR[k];
    if (hex === undefined) {
      throw new Error("missing tile color");
    }
    const material = new THREE.MeshLambertMaterial({ color: hex });
    const mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
    mesh.count = 0;
    mesh.frustumCulled = false;
    scene.add(mesh);
    meshes.push(mesh);
  }
  return {
    meshes,
    dummy: new THREE.Object3D(),
    counts: new Uint32Array(TILE_KIND_COUNT),
    syncedVersion: -1,
  };
}

export function syncMap(tiles: Uint8Array, width: number, tilesVersion: number, map: MapMeshes): void {
  if (map.syncedVersion === tilesVersion) {
    return;
  }
  map.syncedVersion = tilesVersion;
  syncMapInstances(tiles, width, map.meshes, map.dummy, map.counts);
}

export function countTilesByKind(tiles: Uint8Array): Uint32Array {
  const counts = new Uint32Array(TILE_KIND_COUNT);
  for (let i = 0; i < tiles.length; i += 1) {
    const code = tiles[i];
    if (code === undefined) {
      continue;
    }
    const next = counts[code];
    if (next === undefined) {
      continue;
    }
    counts[code] = next + 1;
  }
  return counts;
}

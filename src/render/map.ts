import * as THREE from "three";
import { MAP_HEIGHT, MAP_WIDTH, TILE_KINDS, TILE_KIND, type TileKind, type TileRead, type World } from "../sim";
import { syncMapInstances } from "./map.hot";
import { TILE_COLOR, TILE_HEIGHT, TILE_KIND_COUNT } from "./tileLookups";

export const TILE_GROUP_COUNT = 5;

export type MapMeshes = {
  meshes: THREE.InstancedMesh[];
  dummy: THREE.Object3D;
  color: THREE.Color;
  counts: Uint32Array;
  groupCounts: Uint32Array;
  kindToGroup: Uint8Array;
  syncedVersion: number;
  syncedRoomsVersion: number;
};

const CAPACITY = MAP_WIDTH * MAP_HEIGHT;

function groupForKind(kind: TileKind): number {
  switch (kind) {
    case "earth":
    case "dirt":
    case "taggedEarth":
      return 0;
    case "goldSeam":
    case "taggedGold":
      return 1;
    case "rock":
      return 2;
    case "claimed":
      return 3;
    case "room":
    case "portal":
      return 4;
    default: {
      const never: never = kind;
      return never;
    }
  }
}

export function createMapMeshes(scene: THREE.Scene): MapMeshes {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const meshes: THREE.InstancedMesh[] = [];
  const color = new THREE.Color(0xffffff);
  for (let g = 0; g < TILE_GROUP_COUNT; g += 1) {
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
    mesh.count = 0;
    mesh.frustumCulled = false;
    for (let i = 0; i < CAPACITY; i += 1) {
      mesh.setColorAt(i, color);
    }
    if (mesh.instanceColor !== null) {
      mesh.instanceColor.needsUpdate = true;
    }
    scene.add(mesh);
    meshes.push(mesh);
  }
  const kindToGroup = new Uint8Array(TILE_KIND_COUNT);
  for (const kind of TILE_KINDS) {
    const code = TILE_KIND[kind];
    kindToGroup[code] = groupForKind(kind);
  }
  return {
    meshes,
    dummy: new THREE.Object3D(),
    color,
    counts: new Uint32Array(TILE_KIND_COUNT),
    groupCounts: new Uint32Array(TILE_GROUP_COUNT),
    kindToGroup,
    syncedVersion: -1,
    syncedRoomsVersion: -1,
  };
}

export function syncMap(world: World, map: MapMeshes): void {
  if (map.syncedVersion === world.tilesVersion && map.syncedRoomsVersion === world.roomsVersion) {
    return;
  }
  map.syncedVersion = world.tilesVersion;
  map.syncedRoomsVersion = world.roomsVersion;
  syncMapInstances(
    world.tiles,
    world.rooms,
    world.width,
    map.meshes,
    map.dummy,
    map.color,
    map.counts,
    map.groupCounts,
    map.kindToGroup,
  );
}

export function countTilesByKind(tiles: TileRead): Uint32Array {
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

export { TILE_COLOR, TILE_HEIGHT };

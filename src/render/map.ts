import * as THREE from "three";
import { MAP_HEIGHT, MAP_WIDTH, TILE_KINDS, TILE_KIND, type TileKind, type TileRead, type World } from "../sim";
import { syncMapInstances } from "./map.hot";
import { TILE_COLOR, TILE_HEIGHT, TILE_KIND_COUNT } from "./tileLookups";

export const TILE_GROUP_COUNT = 4;

export type MapMeshes = {
  meshes: THREE.InstancedMesh[];
  materials: THREE.MeshLambertMaterial[];
  dummy: THREE.Object3D;
  color: THREE.Color;
  counts: Uint32Array;
  groupCounts: Uint32Array;
  kindToGroup: Uint8Array;
  taggedGroups: Uint8Array;
  taggedSlots: Int32Array;
  taggedKinds: Uint8Array;
  taggedCount: number;
  syncedVersion: number;
  syncedRoomsVersion: number;
  syncedDoorVersion: number;
  syncedTrapVersion: number;
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
    case "room":
    case "portal":
      return 3;
    default: {
      const never: never = kind;
      return never;
    }
  }
}

export function createMapMeshes(scene: THREE.Scene): MapMeshes {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const meshes: THREE.InstancedMesh[] = [];
  const materials: THREE.MeshLambertMaterial[] = [];
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
    materials.push(material);
  }
  const kindToGroup = new Uint8Array(TILE_KIND_COUNT);
  for (const kind of TILE_KINDS) {
    const code = TILE_KIND[kind];
    kindToGroup[code] = groupForKind(kind);
  }
  return {
    meshes,
    materials,
    dummy: new THREE.Object3D(),
    color,
    counts: new Uint32Array(TILE_KIND_COUNT),
    groupCounts: new Uint32Array(TILE_GROUP_COUNT),
    kindToGroup,
    taggedGroups: new Uint8Array(CAPACITY),
    taggedSlots: new Int32Array(CAPACITY),
    taggedKinds: new Uint8Array(CAPACITY),
    taggedCount: 0,
    syncedVersion: -1,
    syncedRoomsVersion: -1,
    syncedDoorVersion: -1,
    syncedTrapVersion: -1,
  };
}

export function updateTaggedPulse(map: MapMeshes, time: number): void {
  const earthPulse = 0.65 + 0.35 * Math.sin(time * 0.3);
  const goldPulse = earthPulse + 0.15;
  for (let i = 0; i < map.taggedCount; i += 1) {
    const group = map.taggedGroups[i];
    const slot = map.taggedSlots[i];
    const code = map.taggedKinds[i];
    if (group === undefined || slot === undefined || code === undefined) {
      continue;
    }
    const mesh = map.meshes[group];
    if (mesh === undefined) {
      continue;
    }
    const hex = TILE_COLOR[code];
    if (hex === undefined) {
      continue;
    }
    const pulse = code === TILE_KIND.taggedGold ? goldPulse : earthPulse;
    map.color.setHex(hex).multiplyScalar(0.8 + 0.4 * pulse);
    mesh.setColorAt(slot, map.color);
    if (mesh.instanceColor !== null) {
      mesh.instanceColor.needsUpdate = true;
    }
  }
}

export function syncMap(world: World, map: MapMeshes, time: number): void {
  updateTaggedPulse(map, time);
  if (
    map.syncedVersion === world.tilesVersion &&
    map.syncedRoomsVersion === world.roomsVersion &&
    map.syncedDoorVersion === world.doorVersion &&
    map.syncedTrapVersion === world.trapVersion
  ) {
    return;
  }
  map.syncedVersion = world.tilesVersion;
  map.syncedRoomsVersion = world.roomsVersion;
  map.syncedDoorVersion = world.doorVersion;
  map.syncedTrapVersion = world.trapVersion;
  map.taggedCount = syncMapInstances(
    world.tiles,
    world.rooms,
    world.doorHp,
    world.trapState,
    world.width,
    map.meshes,
    map.dummy,
    map.color,
    map.counts,
    map.groupCounts,
    map.kindToGroup,
    map.taggedGroups,
    map.taggedSlots,
    map.taggedKinds,
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

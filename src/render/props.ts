import * as THREE from "three";
import { MAP_HEIGHT, MAP_WIDTH, type CreatureSlot, type World } from "../sim";
import { syncPropInstances } from "./props.hot";

export type PropMeshes = {
  mesh: THREE.InstancedMesh;
  dummy: THREE.Object3D;
  color: THREE.Color;
  syncedTreasuryVersion: number;
  syncedChickensVersion: number;
  syncedRoomsVersion: number;
  syncedDoorVersion: number;
  syncedTrapVersion: number;
  syncedBedsFingerprint: number;
};

export const PROPS_CAPACITY = MAP_WIDTH * MAP_HEIGHT * 8;

function mixHash(hash: number, value: number): number {
  return Math.imul(hash ^ (value >>> 0), 16777619) >>> 0;
}

function bedFingerprint(slots: CreatureSlot[]): number {
  let hash = 2166136261;
  let live = 0;
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live":
        live += 1;
        hash = mixHash(hash, slot.creature.bedTile);
        break;
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  return mixHash(hash, live);
}

export function createPropMeshes(scene: THREE.Scene): PropMeshes {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    emissive: 0x3a2a08,
    emissiveIntensity: 0.35,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, PROPS_CAPACITY);
  mesh.count = 0;
  mesh.frustumCulled = false;
  const color = new THREE.Color(0xffffff);
  for (let i = 0; i < PROPS_CAPACITY; i += 1) {
    mesh.setColorAt(i, color);
  }
  if (mesh.instanceColor !== null) {
    mesh.instanceColor.needsUpdate = true;
  }
  scene.add(mesh);
  return {
    mesh,
    dummy: new THREE.Object3D(),
    color,
    syncedTreasuryVersion: -1,
    syncedChickensVersion: -1,
    syncedRoomsVersion: -1,
    syncedDoorVersion: -1,
    syncedTrapVersion: -1,
    syncedBedsFingerprint: -1,
  };
}

export function syncProps(world: World, visual: PropMeshes): void {
  const bedsFingerprint = bedFingerprint(world.creatures.slots);
  if (
    visual.syncedTreasuryVersion === world.treasuryVersion &&
    visual.syncedChickensVersion === world.chickensVersion &&
    visual.syncedRoomsVersion === world.roomsVersion &&
    visual.syncedDoorVersion === world.doorVersion &&
    visual.syncedTrapVersion === world.trapVersion &&
    visual.syncedBedsFingerprint === bedsFingerprint
  ) {
    return;
  }
  visual.syncedTreasuryVersion = world.treasuryVersion;
  visual.syncedChickensVersion = world.chickensVersion;
  visual.syncedRoomsVersion = world.roomsVersion;
  visual.syncedDoorVersion = world.doorVersion;
  visual.syncedTrapVersion = world.trapVersion;
  visual.syncedBedsFingerprint = bedsFingerprint;
  syncPropInstances(
    world.rooms,
    world.treasuryStock,
    world.width,
    world.chickens.slots,
    world.creatures.slots,
    world.doorHp,
    world.doorOpen,
    world.trapState,
    world.tiles,
    visual.mesh,
    visual.dummy,
    visual.color,
  );
}

import * as THREE from "three";
import { MAP_HEIGHT, MAP_WIDTH, type World } from "../sim";
import { syncPropInstances } from "./props.hot";

export type PropMeshes = {
  mesh: THREE.InstancedMesh;
  dummy: THREE.Object3D;
  color: THREE.Color;
  syncedTreasuryVersion: number;
  syncedChickensVersion: number;
};

const CAPACITY = MAP_WIDTH * MAP_HEIGHT;

export function createPropMeshes(scene: THREE.Scene): PropMeshes {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshLambertMaterial({
    color: 0xffd23f,
    emissive: 0x6a4a00,
    emissiveIntensity: 0.4,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
  mesh.count = 0;
  mesh.frustumCulled = false;
  const color = new THREE.Color(0xffffff);
  for (let i = 0; i < CAPACITY; i += 1) {
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
  };
}

export function syncProps(world: World, visual: PropMeshes): void {
  if (
    visual.syncedTreasuryVersion === world.treasuryVersion &&
    visual.syncedChickensVersion === world.chickensVersion
  ) {
    return;
  }
  visual.syncedTreasuryVersion = world.treasuryVersion;
  visual.syncedChickensVersion = world.chickensVersion;
  syncPropInstances(
    world.rooms,
    world.treasuryStock,
    world.width,
    world.chickens.slots,
    visual.mesh,
    visual.dummy,
    visual.color,
  );
}

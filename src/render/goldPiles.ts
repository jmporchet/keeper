import * as THREE from "three";
import { MAP_HEIGHT, MAP_WIDTH, type World } from "../sim";
import { syncGoldPileInstances } from "./goldPiles.hot";

export type GoldPileMeshes = {
  mesh: THREE.InstancedMesh;
  dummy: THREE.Object3D;
  syncedVersion: number;
};

const CAPACITY = MAP_WIDTH * MAP_HEIGHT;

export function createGoldPileMeshes(scene: THREE.Scene): GoldPileMeshes {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshLambertMaterial({
    color: 0xffd23f,
    emissive: 0x6a4a00,
    emissiveIntensity: 0.4,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
  mesh.count = 0;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return {
    mesh,
    dummy: new THREE.Object3D(),
    syncedVersion: -1,
  };
}

export function syncGoldPiles(world: World, visual: GoldPileMeshes): void {
  if (visual.syncedVersion === world.treasuryVersion) {
    return;
  }
  visual.syncedVersion = world.treasuryVersion;
  syncGoldPileInstances(world.rooms, world.treasuryStock, world.width, visual.mesh, visual.dummy);
}

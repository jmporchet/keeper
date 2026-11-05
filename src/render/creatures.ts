import * as THREE from "three";
import { CREATURE_CAPACITY, type CreatureBoard } from "../sim";
import { syncCreatureInstances } from "./creatures.hot";

export type CreatureMeshes = {
  mesh: THREE.InstancedMesh;
  dummy: THREE.Object3D;
  color: THREE.Color;
};

export function createCreatureMeshes(scene: THREE.Scene): CreatureMeshes {
  const geometry = new THREE.OctahedronGeometry(0.3, 0);
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geometry, material, CREATURE_CAPACITY);
  mesh.count = 0;
  mesh.frustumCulled = false;
  const color = new THREE.Color(0xffffff);
  for (let i = 0; i < CREATURE_CAPACITY; i += 1) {
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
  };
}

export function syncCreatures(board: CreatureBoard, alpha: number, visual: CreatureMeshes): void {
  syncCreatureInstances(board.slots, alpha, visual.mesh, visual.dummy, visual.color);
}

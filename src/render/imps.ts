import * as THREE from "three";
import { IMP_CAPACITY, type ImpBoard } from "../sim/imps";
import { syncImpInstances } from "./imps.hot";

export type ImpMeshes = {
  mesh: THREE.InstancedMesh;
  dummy: THREE.Object3D;
};

export function createImpMeshes(scene: THREE.Scene): ImpMeshes {
  const geometry = new THREE.ConeGeometry(0.22, 0.72, 6);
  const material = new THREE.MeshLambertMaterial({ color: 0xe03030 });
  const mesh = new THREE.InstancedMesh(geometry, material, IMP_CAPACITY);
  mesh.count = 0;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return {
    mesh,
    dummy: new THREE.Object3D(),
  };
}

export function syncImps(board: ImpBoard, alpha: number, visual: ImpMeshes): void {
  syncImpInstances(board.slots, alpha, visual.mesh, visual.dummy);
}

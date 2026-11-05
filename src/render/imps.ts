import * as THREE from "three";
import { IMP_CAPACITY, type Hand, type ImpBoard, type TileIndex } from "../sim";
import { syncImpInstances } from "./imps.hot";

export type ImpMeshes = {
  mesh: THREE.InstancedMesh;
  dummy: THREE.Object3D;
  color: THREE.Color;
};

export function createImpMeshes(scene: THREE.Scene): ImpMeshes {
  const geometry = new THREE.ConeGeometry(0.22, 0.72, 6);
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const capacity = IMP_CAPACITY * 2;
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.count = 0;
  mesh.frustumCulled = false;
  const color = new THREE.Color(0xffffff);
  for (let i = 0; i < capacity; i += 1) {
    mesh.setColorAt(i, color);
  }
  scene.add(mesh);
  return {
    mesh,
    dummy: new THREE.Object3D(),
    color,
  };
}

export function syncImps(
  board: ImpBoard,
  hand: Hand,
  alpha: number,
  cursorTile: TileIndex | undefined,
  visual: ImpMeshes,
): void {
  syncImpInstances(board.slots, hand, alpha, visual.mesh, visual.dummy, visual.color, cursorTile);
}

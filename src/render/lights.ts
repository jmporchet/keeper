import * as THREE from "three";

export const DUNGEON_EXPOSURE = 0.8;

export function addTorchLighting(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xd4a070, 0x140c08, 0.55));
  scene.add(new THREE.AmbientLight(0x241810, 0.18));
  const heart = new THREE.PointLight(0xff9a4a, 22, 48, 1.6);
  heart.position.set(0, 8, 0);
  scene.add(heart);
}

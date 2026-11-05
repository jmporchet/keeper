import * as THREE from "three";

export const DUNGEON_EXPOSURE = 1.1;

export function addTorchLighting(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xb8a590, 0x1a1410, 1.5));
  scene.add(new THREE.AmbientLight(0x302820, 0.6));
  const heart = new THREE.PointLight(0xffb070, 40, 40, 1.4);
  heart.position.set(0, 8, 0);
  scene.add(heart);
}

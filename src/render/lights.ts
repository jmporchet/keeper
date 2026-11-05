import * as THREE from "three";

const TORCH_COLOR = 0xffcc88;

export function addTorchLighting(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xffe6c0, 0x3a2818, 1.8));
  scene.add(new THREE.AmbientLight(0xffd4a8, 0.85));
  addTorch(scene, 0, 7, 0, 90, 48);
  addTorch(scene, 4, 5, 4, 40, 22);
  addTorch(scene, -4, 5, 4, 40, 22);
  addTorch(scene, 4, 5, -4, 40, 22);
  addTorch(scene, -4, 5, -4, 40, 22);
  addTorch(scene, 22, 10, 22, 70, 40);
  addTorch(scene, -22, 10, 22, 70, 40);
  addTorch(scene, 22, 10, -22, 70, 40);
  addTorch(scene, -22, 10, -22, 70, 40);
  addTorch(scene, 0, 12, 26, 55, 36);
  addTorch(scene, 0, 12, -26, 55, 36);
  addTorch(scene, 26, 12, 0, 55, 36);
  addTorch(scene, -26, 12, 0, 55, 36);
}

function addTorch(scene: THREE.Scene, x: number, y: number, z: number, intensity: number, distance: number): void {
  const light = new THREE.PointLight(TORCH_COLOR, intensity, distance, 1.2);
  light.position.set(x, y, z);
  scene.add(light);
}

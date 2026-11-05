import * as THREE from "three";
import { tileIndexFromWorld, type TileIndex } from "../sim";

const ndc = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();

export function pickTileIndex(
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): TileIndex | undefined {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  if (width <= 0 || height <= 0) {
    return undefined;
  }
  ndc.set(((clientX - rect.left) / width) * 2 - 1, -((clientY - rect.top) / height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const point = raycaster.ray.intersectPlane(ground, hit);
  if (point === null) {
    return undefined;
  }
  return tileIndexFromWorld(point.x, point.z);
}

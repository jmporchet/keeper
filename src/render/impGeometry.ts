import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const IMP_GEOMETRY_BASE_Y = -0.36;

function partBox(
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  rotX: number,
  rotY: number,
  rotZ: number,
): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  geometry.rotateX(rotX);
  geometry.rotateY(rotY);
  geometry.rotateZ(rotZ);
  geometry.translate(x, y, z);
  return geometry;
}

function partCone(
  radius: number,
  height: number,
  segments: number,
  x: number,
  y: number,
  z: number,
  rotX: number,
  rotY: number,
  rotZ: number,
): THREE.BufferGeometry {
  const geometry = new THREE.ConeGeometry(radius, height, segments);
  geometry.rotateX(rotX);
  geometry.rotateY(rotY);
  geometry.rotateZ(rotZ);
  geometry.translate(x, y, z);
  return geometry;
}

export function createImpGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    partBox(0.3, 0.3, 0.22, 0, -0.08, -0.01, 0.18, 0, 0),
    partBox(0.1, 0.13, 0.12, -0.085, -0.295, 0.01, 0, 0, 0),
    partBox(0.1, 0.13, 0.12, 0.085, -0.295, 0.01, 0, 0, 0),
    partBox(0.12, 0.05, 0.17, -0.085, -0.335, 0.045, 0, 0, 0),
    partBox(0.12, 0.05, 0.17, 0.085, -0.335, 0.045, 0, 0, 0),
    partBox(0.06, 0.22, 0.08, -0.19, -0.04, 0.01, 0, 0, -0.18),
    partBox(0.06, 0.22, 0.08, 0.19, -0.04, 0.01, 0, 0, 0.18),
    partBox(0.08, 0.06, 0.09, -0.21, -0.18, 0.02, 0, 0, 0),
    partBox(0.08, 0.06, 0.09, 0.21, -0.18, 0.02, 0, 0, 0),
    partBox(0.32, 0.24, 0.28, 0, 0.19, 0.04, 0, 0, 0),
    partBox(0.12, 0.09, 0.1, 0, 0.14, 0.21, 0, 0, 0),
    partCone(0.045, 0.08, 5, -0.11, 0.32, 0.02, 0, 0, 0),
    partCone(0.045, 0.08, 5, 0.11, 0.32, 0.02, 0, 0, 0),
    partCone(0.035, 0.12, 4, -0.18, 0.22, 0.02, 0, 0, Math.PI / 2),
    partCone(0.035, 0.12, 4, 0.18, 0.22, 0.02, 0, 0, -Math.PI / 2),
  ];
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) {
    part.dispose();
  }
  return geometry;
}

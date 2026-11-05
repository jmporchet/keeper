import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const CREATURE_GEOMETRY_BASE_Y = 0;
export const CREATURE_GROUND_Y = 0.2;
export const CREATURE_KIND_FLY = 0;
export const CREATURE_KIND_BEETLE = 1;
export const CREATURE_KIND_WARLOCK = 2;
export const CREATURE_KIND_HERO = 3;

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

function partSphere(
  radius: number,
  widthSegments: number,
  heightSegments: number,
  x: number,
  y: number,
  z: number,
): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
  geometry.translate(x, y, z);
  return geometry;
}

function partDome(
  radius: number,
  widthSegments: number,
  heightSegments: number,
  x: number,
  y: number,
  z: number,
  yScale: number,
): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(
    radius,
    widthSegments,
    heightSegments,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );
  geometry.scale(1, yScale, 1);
  geometry.translate(x, y, z);
  return geometry;
}

function flyParts(): THREE.BufferGeometry[] {
  return [
    partBox(0.18, 0.14, 0.22, 0, 0.16, -0.02, 0.08, 0, 0),
    partBox(0.2, 0.14, 0.16, 0, 0.18, 0.1, 0, 0, 0),
    partBox(0.16, 0.12, 0.12, 0, 0.2, 0.2, 0, 0, 0),
    partSphere(0.045, 7, 5, -0.06, 0.22, 0.25),
    partSphere(0.045, 7, 5, 0.06, 0.22, 0.25),
    partBox(0.28, 0.018, 0.2, -0.21, 0.24, 0, 0, -0.3, 0.08),
    partBox(0.28, 0.018, 0.2, 0.21, 0.24, 0, 0, 0.3, -0.08),
    partBox(0.035, 0.1, 0.035, -0.06, 0.05, -0.08, 0, 0, 0),
    partBox(0.035, 0.1, 0.035, 0.06, 0.05, -0.08, 0, 0, 0),
    partBox(0.035, 0.1, 0.035, -0.06, 0.05, 0.1, 0, 0, 0),
    partBox(0.035, 0.1, 0.035, 0.06, 0.05, 0.1, 0, 0, 0),
    partCone(0.02, 0.08, 4, -0.04, 0.27, 0.24, 0.35, 0, -0.2),
    partCone(0.02, 0.08, 4, 0.04, 0.27, 0.24, 0.35, 0, 0.2),
  ];
}

function beetleParts(): THREE.BufferGeometry[] {
  return [
    partBox(0.52, 0.12, 0.44, 0, 0.08, 0, 0, 0, 0),
    partDome(0.42, 8, 4, 0, 0.12, 0, 0.45),
    partBox(0.18, 0.14, 0.14, 0, 0.14, 0.4, 0, 0, 0),
    partSphere(0.035, 6, 4, -0.06, 0.19, 0.46),
    partSphere(0.035, 6, 4, 0.06, 0.19, 0.46),
    partBox(0.06, 0.14, 0.06, -0.28, 0.07, -0.18, 0, 0, 0),
    partBox(0.06, 0.14, 0.06, 0.28, 0.07, -0.18, 0, 0, 0),
    partBox(0.06, 0.14, 0.06, -0.3, 0.07, 0, 0, 0, 0),
    partBox(0.06, 0.14, 0.06, 0.3, 0.07, 0, 0, 0, 0),
    partBox(0.06, 0.14, 0.06, -0.28, 0.07, 0.18, 0, 0, 0),
    partBox(0.06, 0.14, 0.06, 0.28, 0.07, 0.18, 0, 0, 0),
    partCone(0.025, 0.12, 4, -0.08, 0.23, 0.47, 0.4, 0, -0.2),
    partCone(0.025, 0.12, 4, 0.08, 0.23, 0.47, 0.4, 0, 0.2),
  ];
}

function warlockParts(): THREE.BufferGeometry[] {
  return [
    partCone(0.2, 0.55, 6, 0, 0.275, 0, 0, 0, 0),
    partBox(0.24, 0.05, 0.22, 0, 0.03, 0, 0, 0, 0),
    partBox(0.18, 0.2, 0.14, 0, 0.58, 0, 0, 0, 0),
    partBox(0.28, 0.06, 0.16, 0, 0.68, 0, 0, 0, 0),
    partBox(0.07, 0.28, 0.08, -0.17, 0.55, 0, 0, 0, -0.08),
    partBox(0.07, 0.28, 0.08, 0.17, 0.55, 0, 0, 0, 0.08),
    partSphere(0.11, 7, 5, 0, 0.8, 0.01),
    partCone(0.13, 0.22, 6, 0, 0.84, 0, 0, 0, 0),
    partBox(0.14, 0.05, 0.05, 0, 0.78, 0.1, 0, 0, 0),
    partBox(0.05, 0.38, 0.05, 0.2, 0.25, 0.05, 0, 0, 0),
    partSphere(0.055, 6, 4, 0.2, 0.48, 0.05),
  ];
}

function heroParts(): THREE.BufferGeometry[] {
  return [
    partBox(0.11, 0.36, 0.12, -0.1, 0.18, 0, 0, 0, 0),
    partBox(0.11, 0.36, 0.12, 0.1, 0.18, 0, 0, 0, 0),
    partBox(0.13, 0.08, 0.2, -0.1, 0.04, 0.04, 0, 0, 0),
    partBox(0.13, 0.08, 0.2, 0.1, 0.04, 0.04, 0, 0, 0),
    partBox(0.32, 0.36, 0.2, 0, 0.52, 0, 0, 0, 0),
    partBox(0.34, 0.06, 0.22, 0, 0.36, 0, 0, 0, 0),
    partBox(0.09, 0.3, 0.11, -0.21, 0.5, 0, 0, 0, -0.06),
    partBox(0.09, 0.3, 0.11, 0.21, 0.5, 0, 0, 0, 0.06),
    partBox(0.08, 0.08, 0.1, -0.22, 0.33, 0.02, 0, 0, 0),
    partBox(0.08, 0.08, 0.1, 0.22, 0.33, 0.02, 0, 0, 0),
    partBox(0.17, 0.17, 0.16, 0, 0.78, 0.01, 0, 0, 0),
    partBox(0.2, 0.09, 0.18, 0, 0.87, 0, 0, 0, 0),
    partBox(0.14, 0.03, 0.03, 0, 0.8, 0.1, 0, 0, 0),
    partBox(0.2, 0.26, 0.05, -0.3, 0.5, 0.08, 0, 0.2, 0),
    partBox(0.05, 0.38, 0.06, 0.3, 0.55, 0.02, 0, 0, 0),
    partBox(0.14, 0.05, 0.08, 0.3, 0.36, 0.02, 0, 0, 0),
    partBox(0.05, 0.1, 0.05, 0.3, 0.29, 0.02, 0, 0, 0),
  ];
}

function tagKind(parts: THREE.BufferGeometry[], kind: number): THREE.BufferGeometry[] {
  for (const part of parts) {
    const position = part.getAttribute("position");
    const values = new Float32Array(position.count);
    values.fill(kind);
    part.setAttribute("aKind", new THREE.Float32BufferAttribute(values, 1));
  }
  return parts;
}

function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) {
    part.dispose();
  }
  return geometry;
}

export function createFlyGeometry(): THREE.BufferGeometry {
  return mergeParts(tagKind(flyParts(), CREATURE_KIND_FLY));
}

export function createBeetleGeometry(): THREE.BufferGeometry {
  return mergeParts(tagKind(beetleParts(), CREATURE_KIND_BEETLE));
}

export function createWarlockGeometry(): THREE.BufferGeometry {
  return mergeParts(tagKind(warlockParts(), CREATURE_KIND_WARLOCK));
}

export function createHeroGeometry(): THREE.BufferGeometry {
  return mergeParts(tagKind(heroParts(), CREATURE_KIND_HERO));
}

export function createCreatureGeometry(): THREE.BufferGeometry {
  return mergeParts([
    ...tagKind(flyParts(), CREATURE_KIND_FLY),
    ...tagKind(beetleParts(), CREATURE_KIND_BEETLE),
    ...tagKind(warlockParts(), CREATURE_KIND_WARLOCK),
    ...tagKind(heroParts(), CREATURE_KIND_HERO),
  ]);
}

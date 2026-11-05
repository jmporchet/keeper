import type { InstancedMesh, Object3D } from "three";
import { MAP_HALF } from "../sim";
import { TILE_HEIGHT } from "./tileLookups";

export function syncMapInstances(
  tiles: Uint8Array,
  width: number,
  meshes: InstancedMesh[],
  dummy: Object3D,
  counts: Uint32Array,
): void {
  for (let k = 0; k < counts.length; k += 1) {
    counts[k] = 0;
  }
  const n = tiles.length;
  for (let i = 0; i < n; i += 1) {
    const code = tiles[i];
    if (code === undefined) {
      continue;
    }
    const mesh = meshes[code];
    if (mesh === undefined) {
      continue;
    }
    const slot = counts[code];
    if (slot === undefined) {
      continue;
    }
    const h = TILE_HEIGHT[code];
    if (h === undefined) {
      continue;
    }
    const y = (i / width) | 0;
    const x = i - y * width;
    dummy.position.set(x - MAP_HALF, h * 0.5, y - MAP_HALF);
    dummy.scale.set(1, h, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(slot, dummy.matrix);
    counts[code] = slot + 1;
  }
  for (let k = 0; k < meshes.length; k += 1) {
    const mesh = meshes[k];
    const count = counts[k];
    if (mesh === undefined || count === undefined) {
      continue;
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  }
}

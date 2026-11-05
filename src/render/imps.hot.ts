import type { InstancedMesh, Object3D } from "three";
import { MAP_HALF } from "../sim";
import type { ImpSlot } from "../sim/imps";

export function syncImpInstances(
  slots: ImpSlot[],
  alpha: number,
  mesh: InstancedMesh,
  dummy: Object3D,
): void {
  let drawn = 0;
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live": {
        const imp = slot.imp;
        const t = alpha;
        const x = imp.prevX + (imp.currX - imp.prevX) * t;
        const z = imp.prevZ + (imp.currZ - imp.prevZ) * t;
        dummy.position.set(x - MAP_HALF, 0.56, z - MAP_HALF);
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(drawn, dummy.matrix);
        drawn += 1;
        break;
      }
      default: {
        const never: never = slot;
        throw never;
      }
    }
  }
  mesh.count = drawn;
  mesh.instanceMatrix.needsUpdate = true;
}

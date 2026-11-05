import type { Color, InstancedMesh, Object3D } from "three";
import { MAP_HALF, type CreatureSlot } from "../sim";

export function syncCreatureInstances(
  slots: CreatureSlot[],
  alpha: number,
  mesh: InstancedMesh,
  dummy: Object3D,
  color: Color,
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
        const creature = slot.creature;
        const t = alpha;
        const x = creature.prevX + (creature.currX - creature.prevX) * t;
        const z = creature.prevZ + (creature.currZ - creature.prevZ) * t;
        dummy.position.set(x - MAP_HALF, 0.42, z - MAP_HALF);
        dummy.scale.set(1, 0.8, 1);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(drawn, dummy.matrix);
        color.setHex(0x38e0c0);
        mesh.setColorAt(drawn, color);
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
  if (mesh.instanceColor !== null) {
    mesh.instanceColor.needsUpdate = true;
  }
}

import type { Color, InstancedMesh, Object3D } from "three";
import { MAP_HALF, type CreatureSlot, type HeroSlot } from "../sim";

export function syncCreatureInstances(
  slots: CreatureSlot[],
  heroSlots: HeroSlot[],
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
        const trained = creature.level >= 1;
        let y: number;
        let scaleX: number;
        let scaleY: number;
        let scaleZ: number;
        let hex: number;
        switch (creature.kind) {
          case "fly":
            y = trained ? 0.5 : 0.42;
            scaleX = trained ? 1.3 : 1;
            scaleY = trained ? 1.05 : 0.8;
            scaleZ = trained ? 1.3 : 1;
            hex = trained ? 0x9dff7a : 0x38e0c0;
            break;
          case "beetle":
            y = trained ? 0.44 : 0.36;
            scaleX = trained ? 1.55 : 1.25;
            scaleY = trained ? 0.78 : 0.6;
            scaleZ = trained ? 1.4 : 1.15;
            hex = trained ? 0xe0b050 : 0x8b5a2b;
            break;
          default: {
            const never: never = creature.kind;
            throw never;
          }
        }
        dummy.position.set(x - MAP_HALF, y, z - MAP_HALF);
        dummy.scale.set(scaleX, scaleY, scaleZ);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(drawn, dummy.matrix);
        color.setHex(hex);
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
  for (let i = 0; i < heroSlots.length; i += 1) {
    const slot = heroSlots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live": {
        const hero = slot.hero;
        const t = alpha;
        const x = hero.prevX + (hero.currX - hero.prevX) * t;
        const z = hero.prevZ + (hero.currZ - hero.prevZ) * t;
        dummy.position.set(x - MAP_HALF, 0.55, z - MAP_HALF);
        dummy.scale.set(1.1, 1.5, 1.1);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(drawn, dummy.matrix);
        color.setHex(0x7fa8ff);
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

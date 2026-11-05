import type { Color, InstancedBufferAttribute, InstancedMesh, Object3D } from "three";
import { MAP_HALF, type CreatureSlot, type HeroSlot } from "../sim";
import {
  CREATURE_GROUND_Y,
  CREATURE_KIND_BEETLE,
  CREATURE_KIND_FLY,
  CREATURE_KIND_HERO,
  CREATURE_KIND_TROLL,
  CREATURE_KIND_WARLOCK,
} from "./creatureGeometry";

export function syncCreatureInstances(
  slots: CreatureSlot[],
  heroSlots: HeroSlot[],
  alpha: number,
  mesh: InstancedMesh,
  kind: InstancedBufferAttribute,
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
        let variant: number;
        let scaleX: number;
        let scaleY: number;
        let scaleZ: number;
        let hex: number;
        switch (creature.kind) {
          case "fly":
            variant = CREATURE_KIND_FLY;
            scaleX = trained ? 1.25 : 1;
            scaleY = trained ? 1.05 : 0.9;
            scaleZ = trained ? 1.25 : 1;
            hex = trained ? 0x9dff7a : 0x38e0c0;
            break;
          case "beetle":
            variant = CREATURE_KIND_BEETLE;
            scaleX = trained ? 1.4 : 1.1;
            scaleY = trained ? 0.8 : 0.7;
            scaleZ = trained ? 1.3 : 1.05;
            hex = trained ? 0xe0b050 : 0x8b5a2b;
            break;
          case "warlock":
            variant = CREATURE_KIND_WARLOCK;
            scaleX = trained ? 1.05 : 0.95;
            scaleY = trained ? 1.1 : 1;
            scaleZ = trained ? 1.05 : 0.95;
            hex = trained ? 0xc39bff : 0x7b4fd6;
            break;
          case "troll":
            variant = CREATURE_KIND_TROLL;
            scaleX = trained ? 1.4 : 1.3;
            scaleY = trained ? 1.25 : 1.15;
            scaleZ = trained ? 1.3 : 1.2;
            hex = trained ? 0xa9bd63 : 0x6f7f3f;
            break;
          default: {
            const never: never = creature.kind;
            throw never;
          }
        }
        dummy.position.set(x - MAP_HALF, CREATURE_GROUND_Y, z - MAP_HALF);
        dummy.scale.set(scaleX, scaleY, scaleZ);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(drawn, dummy.matrix);
        kind.array[drawn] = variant;
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
        dummy.position.set(x - MAP_HALF, CREATURE_GROUND_Y, z - MAP_HALF);
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(drawn, dummy.matrix);
        kind.array[drawn] = CREATURE_KIND_HERO;
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
  mesh.visible = drawn > 0;
  mesh.instanceMatrix.needsUpdate = true;
  kind.needsUpdate = true;
  if (mesh.instanceColor !== null) {
    mesh.instanceColor.needsUpdate = true;
  }
}

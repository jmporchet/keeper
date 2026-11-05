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
        const levelScale = 1 + creature.level * 0.12;
        const levelLift = creature.level * 0.1;
        let variant: number;
        let baseScaleX: number;
        let baseScaleY: number;
        let baseScaleZ: number;
        let hex: number;
        switch (creature.kind) {
          case "fly":
            variant = CREATURE_KIND_FLY;
            baseScaleX = 1;
            baseScaleY = 0.9;
            baseScaleZ = 1;
            hex = 0x38e0c0;
            break;
          case "beetle":
            variant = CREATURE_KIND_BEETLE;
            baseScaleX = 1.1;
            baseScaleY = 0.7;
            baseScaleZ = 1.05;
            hex = 0x8b5a2b;
            break;
          case "warlock":
            variant = CREATURE_KIND_WARLOCK;
            baseScaleX = 0.95;
            baseScaleY = 1;
            baseScaleZ = 0.95;
            hex = 0x7b4fd6;
            break;
          case "troll":
            variant = CREATURE_KIND_TROLL;
            baseScaleX = 1.3;
            baseScaleY = 1.15;
            baseScaleZ = 1.2;
            hex = 0x6f7f3f;
            break;
          default: {
            const never: never = creature.kind;
            throw never;
          }
        }
        dummy.position.set(x - MAP_HALF, CREATURE_GROUND_Y, z - MAP_HALF);
        dummy.scale.set(baseScaleX * levelScale, baseScaleY * levelScale, baseScaleZ * levelScale);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(drawn, dummy.matrix);
        kind.array[drawn] = variant;
        color.setHex(hex);
        color.r += (1 - color.r) * levelLift;
        color.g += (1 - color.g) * levelLift;
        color.b += (1 - color.b) * levelLift;
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

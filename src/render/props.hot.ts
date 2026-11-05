import type { Color, InstancedMesh, Object3D } from "three";
import { MAP_HALF, ROOM_KIND, TREASURY_CAPACITY, type ChickenSlot } from "../sim";

const ROOM_FLOOR_HEIGHT = 0.2;
const GOLD_COLOR = 0xffd23f;
const CHICKEN_COLOR = 0xfff0b8;
const CHICKEN_SCALE = 0.3;
const CHICKEN_HEIGHT = 0.3;

export function syncPropInstances(
  rooms: Uint8Array,
  stock: Uint16Array,
  width: number,
  chickens: ChickenSlot[],
  mesh: InstancedMesh,
  dummy: Object3D,
  color: Color,
): void {
  let drawn = 0;
  for (let i = 0; i < rooms.length; i += 1) {
    const room = rooms[i];
    if (room !== ROOM_KIND.treasury) {
      continue;
    }
    const amount = stock[i];
    if (amount === undefined || amount === 0) {
      continue;
    }
    const ratio = amount / TREASURY_CAPACITY;
    const height = 0.15 + ratio * 0.65;
    const y = (i / width) | 0;
    const x = i - y * width;
    dummy.position.set(x - MAP_HALF, ROOM_FLOOR_HEIGHT + height * 0.5, y - MAP_HALF);
    dummy.scale.set(0.55, height, 0.55);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(drawn, dummy.matrix);
    color.setHex(GOLD_COLOR);
    mesh.setColorAt(drawn, color);
    drawn += 1;
  }
  for (let i = 0; i < chickens.length; i += 1) {
    const slot = chickens[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live": {
        const tile = slot.chicken.tile;
        const y = (tile / width) | 0;
        const x = tile - y * width;
        dummy.position.set(x - MAP_HALF, ROOM_FLOOR_HEIGHT + CHICKEN_HEIGHT * 0.5, y - MAP_HALF);
        dummy.scale.set(CHICKEN_SCALE, CHICKEN_HEIGHT, CHICKEN_SCALE);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(drawn, dummy.matrix);
        color.setHex(CHICKEN_COLOR);
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

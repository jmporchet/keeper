import type { InstancedMesh, Object3D } from "three";
import { MAP_HALF, ROOM_KIND, TREASURY_CAPACITY } from "../sim";

const ROOM_FLOOR_HEIGHT = 0.2;

export function syncPropInstances(
  rooms: Uint8Array,
  stock: Uint16Array,
  width: number,
  mesh: InstancedMesh,
  dummy: Object3D,
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
    drawn += 1;
  }
  mesh.count = drawn;
  mesh.instanceMatrix.needsUpdate = true;
}

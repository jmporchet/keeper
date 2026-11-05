import type { Color, InstancedMesh, Object3D } from "three";
import { MAP_HALF, MAP_WIDTH, SLAP_TICKS, type Hand, type TileIndex } from "../sim";
import type { ImpSlot } from "../sim/imps";

export function syncImpInstances(
  slots: ImpSlot[],
  hand: Hand,
  alpha: number,
  mesh: InstancedMesh,
  dummy: Object3D,
  color: Color,
  cursorTile: TileIndex | undefined,
  time: number,
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
        if (imp.state.kind === "held") {
          break;
        }
        const t = alpha;
        const x = imp.prevX + (imp.currX - imp.prevX) * t;
        const z = imp.prevZ + (imp.currZ - imp.prevZ) * t;
        const freshBoost = imp.boost.kind === "boosted" && imp.boost.remaining > SLAP_TICKS - 10;
        const state = imp.state;
        let bob = 0;
        let tiltX = 0;
        let tiltZ = 0;
        if (state.kind === "working") {
          bob = Math.sin(time * 0.4 + imp.id) * 0.08;
          const workTile = state.tile;
          const workY = (workTile / MAP_WIDTH) | 0;
          const workX = workTile - workY * MAP_WIDTH;
          tiltX = (workY - imp.tileY) * 0.35;
          tiltZ = -(workX - imp.tileX) * 0.35;
        }
        dummy.position.set(x - MAP_HALF, (freshBoost ? 0.64 : 0.56) + bob, z - MAP_HALF);
        if (freshBoost) {
          dummy.scale.set(1.4, 0.6, 1.4);
          dummy.rotation.set(tiltX, 0, tiltZ + 0.3);
        } else {
          dummy.scale.set(1, 1, 1);
          dummy.rotation.set(tiltX, 0, tiltZ);
        }
        dummy.updateMatrix();
        mesh.setMatrixAt(drawn, dummy.matrix);
        color.setHex(freshBoost ? 0xffe066 : 0xe03030);
        mesh.setColorAt(drawn, color);
        drawn += 1;
        if (imp.carry.kind === "gold") {
          dummy.position.set(x - MAP_HALF, 1.2, z - MAP_HALF);
          dummy.scale.set(0.85, 0.85, 0.85);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          mesh.setMatrixAt(drawn, dummy.matrix);
          color.setHex(0xffd23f);
          mesh.setColorAt(drawn, color);
          drawn += 1;
        }
        break;
      }
      default: {
        const never: never = slot;
        throw never;
      }
    }
  }
  if (cursorTile !== undefined) {
    const cy = (cursorTile / MAP_WIDTH) | 0;
    const cx = cursorTile - cy * MAP_WIDTH;
    for (let i = 0; i < hand.count; i += 1) {
      const slot = hand.slots[i];
      if (slot === undefined) {
        continue;
      }
      switch (slot.kind) {
        case "empty":
          break;
        case "held": {
          const offset = i * 0.18;
          dummy.position.set(cx - MAP_HALF + offset, 1.1 + offset, cy - MAP_HALF + offset);
          dummy.scale.set(1, 1, 1);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          mesh.setMatrixAt(drawn, dummy.matrix);
          color.setHex(0xe03030);
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
  }
  mesh.count = drawn;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor !== null) {
    mesh.instanceColor.needsUpdate = true;
  }
}

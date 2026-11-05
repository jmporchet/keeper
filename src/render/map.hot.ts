import type { Color, InstancedMesh, Object3D } from "three";
import { MAP_HALF, ROOM_KIND, TILE_KIND, type TileRead } from "../sim";
import {
  PORTAL_COLOR,
  ROOM_FLOOR_COLOR,
  ROOM_HATCHERY_COLOR,
  ROOM_LAIR_COLOR,
  ROOM_LIBRARY_COLOR,
  ROOM_TRAINING_COLOR,
  ROOM_TREASURY_COLOR,
  ROOM_WORKSHOP_COLOR,
  TILE_COLOR,
  TILE_HEIGHT,
} from "./tileLookups";

export function syncMapInstances(
  tiles: TileRead,
  rooms: TileRead,
  width: number,
  meshes: InstancedMesh[],
  dummy: Object3D,
  color: Color,
  counts: Uint32Array,
  groupCounts: Uint32Array,
  kindToGroup: Uint8Array,
  taggedGroups: Uint8Array,
  taggedSlots: Int32Array,
  taggedKinds: Uint8Array,
): number {
  counts.fill(0);
  groupCounts.fill(0);
  let taggedCount = 0;
  const n = tiles.length;
  for (let i = 0; i < n; i += 1) {
    const code = tiles[i];
    if (code === undefined) {
      continue;
    }
    const group = kindToGroup[code];
    if (group === undefined) {
      continue;
    }
    const mesh = meshes[group];
    if (mesh === undefined) {
      continue;
    }
    const slot = groupCounts[group];
    if (slot === undefined) {
      continue;
    }
    const h = TILE_HEIGHT[code];
    if (h === undefined) {
      continue;
    }
    let hex = TILE_COLOR[code];
    if (hex === undefined) {
      continue;
    }
    if (code === TILE_KIND.room) {
      const room = rooms[i];
      if (room === ROOM_KIND.lair) {
        hex = ROOM_LAIR_COLOR;
      } else if (room === ROOM_KIND.treasury) {
        hex = ROOM_TREASURY_COLOR;
      } else if (room === ROOM_KIND.hatchery) {
        hex = ROOM_HATCHERY_COLOR;
      } else if (room === ROOM_KIND.training) {
        hex = ROOM_TRAINING_COLOR;
      } else if (room === ROOM_KIND.workshop) {
        hex = ROOM_WORKSHOP_COLOR;
      } else if (room === ROOM_KIND.library) {
        hex = ROOM_LIBRARY_COLOR;
      } else {
        hex = ROOM_FLOOR_COLOR;
      }
    } else if (code === TILE_KIND.portal) {
      hex = PORTAL_COLOR;
    }
    const y = (i / width) | 0;
    const x = i - y * width;
    dummy.position.set(x - MAP_HALF, h * 0.5, y - MAP_HALF);
    dummy.scale.set(1, h, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(slot, dummy.matrix);
    color.setHex(hex);
    mesh.setColorAt(slot, color);
    if (code === TILE_KIND.taggedEarth || code === TILE_KIND.taggedGold) {
      taggedGroups[taggedCount] = group;
      taggedSlots[taggedCount] = slot;
      taggedKinds[taggedCount] = code;
      taggedCount += 1;
    }
    groupCounts[group] = slot + 1;
    const kindCount = counts[code];
    if (kindCount !== undefined) {
      counts[code] = kindCount + 1;
    }
  }
  for (let g = 0; g < meshes.length; g += 1) {
    const mesh = meshes[g];
    const count = groupCounts[g];
    if (mesh === undefined || count === undefined) {
      continue;
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor !== null) {
      mesh.instanceColor.needsUpdate = true;
    }
  }
  return taggedCount;
}

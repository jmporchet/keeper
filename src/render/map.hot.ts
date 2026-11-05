import type { Color, InstancedBufferAttribute, InstancedMesh, Object3D } from "three";
import { MAP_HALF, ROOM_KIND, TILE_KIND, TRAP_GAS_LIVE, TRAP_GAS_SPENT, type TileRead } from "../sim";
import {
  DOOR_COLOR,
  DOOR_OPEN_COLOR,
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
  TRAP_COLOR,
  TRAP_SPENT_COLOR,
  WALL_COLOR,
} from "./tileLookups";

export const WALL_NORTH = 1;
export const WALL_SOUTH = 2;
export const WALL_WEST = 4;
export const WALL_EAST = 8;

const WALL_THICKNESS = 0.08;

function isHighTileCode(code: number): boolean {
  return (
    code === TILE_KIND.earth ||
    code === TILE_KIND.goldSeam ||
    code === TILE_KIND.rock ||
    code === TILE_KIND.taggedEarth ||
    code === TILE_KIND.taggedGold
  );
}

function isLowFloorCode(code: number): boolean {
  return (
    code === TILE_KIND.claimed ||
    code === TILE_KIND.dirt ||
    code === TILE_KIND.room ||
    code === TILE_KIND.portal
  );
}

export function wallFaceMask(tiles: TileRead, width: number, index: number): number {
  const code = tiles[index];
  if (code === undefined || !isHighTileCode(code)) {
    return 0;
  }
  const height = (tiles.length / width) | 0;
  const y = (index / width) | 0;
  const x = index - y * width;
  let mask = 0;
  if (y > 0) {
    const north = tiles[index - width];
    if (north !== undefined && isLowFloorCode(north)) {
      mask |= WALL_NORTH;
    }
  }
  if (y + 1 < height) {
    const south = tiles[index + width];
    if (south !== undefined && isLowFloorCode(south)) {
      mask |= WALL_SOUTH;
    }
  }
  if (x > 0) {
    const west = tiles[index - 1];
    if (west !== undefined && isLowFloorCode(west)) {
      mask |= WALL_WEST;
    }
  }
  if (x + 1 < width) {
    const east = tiles[index + 1];
    if (east !== undefined && isLowFloorCode(east)) {
      mask |= WALL_EAST;
    }
  }
  return mask;
}

export function syncMapInstances(
  tiles: TileRead,
  rooms: TileRead,
  doorHp: TileRead,
  doorOpen: TileRead,
  trapState: TileRead,
  width: number,
  meshes: InstancedMesh[],
  dummy: Object3D,
  color: Color,
  counts: Uint32Array,
  groupCounts: Uint32Array,
  kindToGroup: Uint8Array,
  atlasCells: Uint8Array,
  atlasAttributes: InstancedBufferAttribute[],
  taggedGroups: Uint8Array,
  taggedSlots: Int32Array,
  taggedKinds: Uint8Array,
  wallAtlasCell: number,
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
    } else if (code === TILE_KIND.claimed) {
      const hp = doorHp[i];
      const open = doorOpen[i];
      const trap = trapState[i];
      if (hp !== undefined && hp > 0) {
        hex = open === 1 ? DOOR_OPEN_COLOR : DOOR_COLOR;
      } else if (trap === TRAP_GAS_LIVE) {
        hex = TRAP_COLOR;
      } else if (trap === TRAP_GAS_SPENT) {
        hex = TRAP_SPENT_COLOR;
      }
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
    const atlasCell = atlasCells[code];
    const atlasAttribute = atlasAttributes[group];
    if (atlasCell !== undefined && atlasAttribute !== undefined) {
      atlasAttribute.array[slot] = atlasCell;
    }
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
  for (let i = 0; i < n; i += 1) {
    const mask = wallFaceMask(tiles, width, i);
    if (mask === 0) {
      continue;
    }
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
    const h = TILE_HEIGHT[code];
    if (h === undefined) {
      continue;
    }
    const atlasAttribute = atlasAttributes[group];
    if (atlasAttribute === undefined) {
      continue;
    }
    let wallSlot = groupCounts[group];
    if (wallSlot === undefined) {
      continue;
    }
    const y = (i / width) | 0;
    const x = i - y * width;
    const centerX = x - MAP_HALF;
    const centerZ = y - MAP_HALF;
    if ((mask & WALL_NORTH) !== 0) {
      dummy.position.set(centerX, h * 0.5, centerZ - 0.5);
      dummy.scale.set(1, h, WALL_THICKNESS);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(wallSlot, dummy.matrix);
      color.setHex(WALL_COLOR);
      mesh.setColorAt(wallSlot, color);
      atlasAttribute.array[wallSlot] = wallAtlasCell;
      wallSlot += 1;
    }
    if ((mask & WALL_SOUTH) !== 0) {
      dummy.position.set(centerX, h * 0.5, centerZ + 0.5);
      dummy.scale.set(1, h, WALL_THICKNESS);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(wallSlot, dummy.matrix);
      color.setHex(WALL_COLOR);
      mesh.setColorAt(wallSlot, color);
      atlasAttribute.array[wallSlot] = wallAtlasCell;
      wallSlot += 1;
    }
    if ((mask & WALL_WEST) !== 0) {
      dummy.position.set(centerX - 0.5, h * 0.5, centerZ);
      dummy.scale.set(WALL_THICKNESS, h, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(wallSlot, dummy.matrix);
      color.setHex(WALL_COLOR);
      mesh.setColorAt(wallSlot, color);
      atlasAttribute.array[wallSlot] = wallAtlasCell;
      wallSlot += 1;
    }
    if ((mask & WALL_EAST) !== 0) {
      dummy.position.set(centerX + 0.5, h * 0.5, centerZ);
      dummy.scale.set(WALL_THICKNESS, h, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(wallSlot, dummy.matrix);
      color.setHex(WALL_COLOR);
      mesh.setColorAt(wallSlot, color);
      atlasAttribute.array[wallSlot] = wallAtlasCell;
      wallSlot += 1;
    }
    groupCounts[group] = wallSlot;
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
    const atlasAttribute = atlasAttributes[g];
    if (atlasAttribute !== undefined) {
      atlasAttribute.needsUpdate = true;
    }
  }
  return taggedCount;
}

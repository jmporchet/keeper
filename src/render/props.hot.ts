import type { Color, InstancedMesh, Object3D } from "three";
import {
  isWalkableCode,
  MAP_HALF,
  ROOM_KIND,
  TRAP_GAS_LIVE,
  TRAP_GAS_SPENT,
  TREASURY_CAPACITY,
  type ChickenSlot,
  type CreatureSlot,
  type TileRead,
} from "../sim";

const ROOM_FLOOR_HEIGHT = 0.2;
const GOLD_TIER_0 = 0xb8860b;
const GOLD_TIER_1 = 0xd9a520;
const GOLD_TIER_2 = 0xf0c040;
const GOLD_TIER_3 = 0xffd23f;
const BED_MATTRESS_COLOR = 0x6b4a2f;
const BED_PILLOW_COLOR = 0xcfb89a;
const CHICKEN_BODY_COLOR = 0xf4ead0;
const CHICKEN_HEAD_COLOR = 0xfff4d6;
const CHICKEN_BEAK_COLOR = 0xe08a1a;
const TRAINING_POST_COLOR = 0x8a5a2b;
const WORKSHOP_ANVIL_COLOR = 0x4a4e58;
const LIBRARY_BOOK_COLOR_A = 0x7a3b2e;
const LIBRARY_BOOK_COLOR_B = 0x355070;
const DOOR_POST_COLOR = 0x3a2416;
const DOOR_LINTEL_COLOR = 0x2e1c10;
const DOOR_SLAB_COLOR = 0x8a5a2b;
const DOOR_BAND_COLOR = 0x2c3138;
const TRAP_PLATE_LIVE_COLOR = 0x50565e;
const TRAP_VENT_COLOR = 0x58ff66;
const TRAP_PLATE_SPENT_COLOR = 0x3a3d42;

function placeInstance(
  mesh: InstancedMesh,
  dummy: Object3D,
  color: Color,
  index: number,
  px: number,
  py: number,
  pz: number,
  sx: number,
  sy: number,
  sz: number,
  ry: number,
  hex: number,
): number {
  dummy.position.set(px, py, pz);
  dummy.scale.set(sx, sy, sz);
  dummy.rotation.set(0, ry, 0);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
  color.setHex(hex);
  mesh.setColorAt(index, color);
  return index + 1;
}

function drawTreasuryPile(
  tile: number,
  amount: number,
  width: number,
  mesh: InstancedMesh,
  dummy: Object3D,
  color: Color,
  start: number,
): number {
  const tileY = (tile / width) | 0;
  const tileX = tile - tileY * width;
  const baseX = tileX - MAP_HALF;
  const baseZ = tileY - MAP_HALF;
  const ratio = amount / TREASURY_CAPACITY;
  const tiers = ratio >= 0.75 ? 4 : ratio >= 0.5 ? 3 : ratio >= 0.25 ? 2 : 1;
  const boxWidth = 0.22 + ratio * 0.12;
  const boxHeight = 0.11 + ratio * 0.07;
  const boxDepth = 0.22 + ratio * 0.12;
  let drawn = start;
  let tierY = ROOM_FLOOR_HEIGHT + boxHeight * 0.5;
  for (let tier = 0; tier < tiers; tier += 1) {
    const boxes = tier === 0 ? 3 : tier === 1 ? 2 : 1;
    const spread = boxWidth * 1.08;
    const startOffset = (boxes - 1) * 0.5;
    const tierScale = 1 - tier * 0.12;
    const tierWidth = boxWidth * tierScale;
    const tierDepth = boxDepth * tierScale;
    let tierHex: number;
    switch (tier) {
      case 1:
        tierHex = GOLD_TIER_1;
        break;
      case 2:
        tierHex = GOLD_TIER_2;
        break;
      case 3:
        tierHex = GOLD_TIER_3;
        break;
      default:
        tierHex = GOLD_TIER_0;
        break;
    }
    for (let box = 0; box < boxes; box += 1) {
      const offset = (box - startOffset) * spread;
      drawn = placeInstance(
        mesh,
        dummy,
        color,
        drawn,
        baseX + offset,
        tierY,
        baseZ,
        tierWidth,
        boxHeight,
        tierDepth,
        0,
        tierHex,
      );
    }
    tierY += boxHeight * 0.95;
  }
  return drawn;
}

function drawBed(
  tile: number,
  width: number,
  mesh: InstancedMesh,
  dummy: Object3D,
  color: Color,
  start: number,
): number {
  const tileY = (tile / width) | 0;
  const tileX = tile - tileY * width;
  const baseX = tileX - MAP_HALF;
  const baseZ = tileY - MAP_HALF;
  let drawn = placeInstance(
    mesh,
    dummy,
    color,
    start,
    baseX,
    ROOM_FLOOR_HEIGHT + 0.04,
    baseZ,
    0.78,
    0.08,
    0.5,
    0,
    BED_MATTRESS_COLOR,
  );
  drawn = placeInstance(
    mesh,
    dummy,
    color,
    drawn,
    baseX,
    ROOM_FLOOR_HEIGHT + 0.09,
    baseZ - 0.16,
    0.46,
    0.06,
    0.14,
    0,
    BED_PILLOW_COLOR,
  );
  return drawn;
}

function drawChicken(
  tile: number,
  width: number,
  mesh: InstancedMesh,
  dummy: Object3D,
  color: Color,
  start: number,
): number {
  const tileY = (tile / width) | 0;
  const tileX = tile - tileY * width;
  const baseX = tileX - MAP_HALF;
  const baseZ = tileY - MAP_HALF;
  let drawn = placeInstance(
    mesh,
    dummy,
    color,
    start,
    baseX,
    ROOM_FLOOR_HEIGHT + 0.09,
    baseZ,
    0.24,
    0.18,
    0.16,
    0,
    CHICKEN_BODY_COLOR,
  );
  drawn = placeInstance(
    mesh,
    dummy,
    color,
    drawn,
    baseX + 0.12,
    ROOM_FLOOR_HEIGHT + 0.22,
    baseZ,
    0.13,
    0.13,
    0.12,
    0,
    CHICKEN_HEAD_COLOR,
  );
  drawn = placeInstance(
    mesh,
    dummy,
    color,
    drawn,
    baseX + 0.21,
    ROOM_FLOOR_HEIGHT + 0.21,
    baseZ,
    0.06,
    0.04,
    0.07,
    0,
    CHICKEN_BEAK_COLOR,
  );
  return drawn;
}

function isWalkableNeighbour(
  tiles: TileRead,
  width: number,
  height: number,
  x: number,
  y: number,
): boolean {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return false;
  }
  const code = tiles[y * width + x];
  return code !== undefined && isWalkableCode(code);
}

function drawDoor(
  tile: number,
  width: number,
  open: number,
  tiles: TileRead,
  mesh: InstancedMesh,
  dummy: Object3D,
  color: Color,
  start: number,
): number {
  const tileY = (tile / width) | 0;
  const tileX = tile - tileY * width;
  const baseX = tileX - MAP_HALF;
  const baseZ = tileY - MAP_HALF;
  const height = (tiles.length / width) | 0;
  const west = isWalkableNeighbour(tiles, width, height, tileX - 1, tileY);
  const east = isWalkableNeighbour(tiles, width, height, tileX + 1, tileY);
  const north = isWalkableNeighbour(tiles, width, height, tileX, tileY - 1);
  const south = isWalkableNeighbour(tiles, width, height, tileX, tileY + 1);
  const eastWest = west && east;
  const northSouth = north && south;
  const ry = eastWest && !northSouth ? Math.PI / 2 : 0;
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);
  const postOffset = 0.36;
  const postHeight = 0.8;
  const postY = ROOM_FLOOR_HEIGHT + postHeight * 0.5;
  const lintelY = ROOM_FLOOR_HEIGHT + postHeight + 0.06;
  let drawn = placeInstance(
    mesh,
    dummy,
    color,
    start,
    baseX + cos * postOffset,
    postY,
    baseZ - sin * postOffset,
    0.12,
    postHeight,
    0.12,
    ry,
    DOOR_POST_COLOR,
  );
  drawn = placeInstance(
    mesh,
    dummy,
    color,
    drawn,
    baseX - cos * postOffset,
    postY,
    baseZ + sin * postOffset,
    0.12,
    postHeight,
    0.12,
    ry,
    DOOR_POST_COLOR,
  );
  drawn = placeInstance(
    mesh,
    dummy,
    color,
    drawn,
    baseX,
    lintelY,
    baseZ,
    postOffset * 2 + 0.12,
    0.12,
    0.12,
    ry,
    DOOR_LINTEL_COLOR,
  );
  if (open === 1) {
    drawn = placeInstance(
      mesh,
      dummy,
      color,
      drawn,
      baseX + cos * postOffset,
      postY,
      baseZ - sin * postOffset,
      0.66,
      postHeight * 0.9,
      0.08,
      ry + Math.PI / 2,
      DOOR_SLAB_COLOR,
    );
  } else {
    drawn = placeInstance(
      mesh,
      dummy,
      color,
      drawn,
      baseX,
      ROOM_FLOOR_HEIGHT + 0.36,
      baseZ,
      0.66,
      0.72,
      0.1,
      ry,
      DOOR_SLAB_COLOR,
    );
    drawn = placeInstance(
      mesh,
      dummy,
      color,
      drawn,
      baseX,
      ROOM_FLOOR_HEIGHT + 0.2,
      baseZ,
      0.66,
      0.08,
      0.12,
      ry,
      DOOR_BAND_COLOR,
    );
    drawn = placeInstance(
      mesh,
      dummy,
      color,
      drawn,
      baseX,
      ROOM_FLOOR_HEIGHT + 0.52,
      baseZ,
      0.66,
      0.08,
      0.12,
      ry,
      DOOR_BAND_COLOR,
    );
  }
  return drawn;
}

function drawTrap(
  tile: number,
  width: number,
  state: number,
  mesh: InstancedMesh,
  dummy: Object3D,
  color: Color,
  start: number,
): number {
  const tileY = (tile / width) | 0;
  const tileX = tile - tileY * width;
  const baseX = tileX - MAP_HALF;
  const baseZ = tileY - MAP_HALF;
  let drawn = start;
  switch (state) {
    case TRAP_GAS_LIVE:
      drawn = placeInstance(
        mesh,
        dummy,
        color,
        drawn,
        baseX,
        ROOM_FLOOR_HEIGHT + 0.04,
        baseZ,
        0.72,
        0.08,
        0.72,
        0,
        TRAP_PLATE_LIVE_COLOR,
      );
      drawn = placeInstance(
        mesh,
        dummy,
        color,
        drawn,
        baseX,
        ROOM_FLOOR_HEIGHT + 0.16,
        baseZ,
        0.34,
        0.16,
        0.34,
        0,
        TRAP_VENT_COLOR,
      );
      break;
    case TRAP_GAS_SPENT:
      drawn = placeInstance(
        mesh,
        dummy,
        color,
        drawn,
        baseX,
        ROOM_FLOOR_HEIGHT + 0.03,
        baseZ,
        0.74,
        0.06,
        0.74,
        0,
        TRAP_PLATE_SPENT_COLOR,
      );
      break;
    default:
      break;
  }
  return drawn;
}

function drawRoomMarker(
  room: number,
  tile: number,
  width: number,
  mesh: InstancedMesh,
  dummy: Object3D,
  color: Color,
  start: number,
): number {
  const tileY = (tile / width) | 0;
  const tileX = tile - tileY * width;
  const baseX = tileX - MAP_HALF;
  const baseZ = tileY - MAP_HALF;
  let drawn = start;
  switch (room) {
    case ROOM_KIND.training:
      drawn = placeInstance(
        mesh,
        dummy,
        color,
        drawn,
        baseX,
        ROOM_FLOOR_HEIGHT + 0.18,
        baseZ,
        0.16,
        0.36,
        0.16,
        0.6,
        TRAINING_POST_COLOR,
      );
      break;
    case ROOM_KIND.workshop:
      drawn = placeInstance(
        mesh,
        dummy,
        color,
        drawn,
        baseX,
        ROOM_FLOOR_HEIGHT + 0.12,
        baseZ,
        0.42,
        0.22,
        0.28,
        0,
        WORKSHOP_ANVIL_COLOR,
      );
      break;
    case ROOM_KIND.library:
      drawn = placeInstance(
        mesh,
        dummy,
        color,
        drawn,
        baseX - 0.08,
        ROOM_FLOOR_HEIGHT + 0.05,
        baseZ,
        0.34,
        0.1,
        0.24,
        0,
        LIBRARY_BOOK_COLOR_A,
      );
      drawn = placeInstance(
        mesh,
        dummy,
        color,
        drawn,
        baseX + 0.06,
        ROOM_FLOOR_HEIGHT + 0.14,
        baseZ + 0.03,
        0.28,
        0.08,
        0.2,
        0.3,
        LIBRARY_BOOK_COLOR_B,
      );
      break;
    default:
      break;
  }
  return drawn;
}

export function syncPropInstances(
  rooms: Uint8Array,
  stock: Uint16Array,
  width: number,
  chickens: ChickenSlot[],
  creatures: CreatureSlot[],
  doorHp: TileRead,
  doorOpen: TileRead,
  trapState: TileRead,
  tiles: TileRead,
  mesh: InstancedMesh,
  dummy: Object3D,
  color: Color,
): void {
  let drawn = 0;
  for (let i = 0; i < rooms.length; i += 1) {
    const room = rooms[i];
    if (room === undefined) {
      continue;
    }
    switch (room) {
      case ROOM_KIND.treasury: {
        const amount = stock[i];
        if (amount !== undefined && amount > 0) {
          drawn = drawTreasuryPile(i, amount, width, mesh, dummy, color, drawn);
        }
        break;
      }
      case ROOM_KIND.training:
      case ROOM_KIND.workshop:
      case ROOM_KIND.library:
        drawn = drawRoomMarker(room, i, width, mesh, dummy, color, drawn);
        break;
      default:
        break;
    }
  }
  for (let i = 0; i < doorHp.length; i += 1) {
    const hp = doorHp[i];
    if (hp !== undefined && hp > 0) {
      const open = doorOpen[i];
      drawn = drawDoor(i, width, open === 1 ? 1 : 0, tiles, mesh, dummy, color, drawn);
      continue;
    }
    const trap = trapState[i];
    if (trap === TRAP_GAS_LIVE || trap === TRAP_GAS_SPENT) {
      drawn = drawTrap(i, width, trap, mesh, dummy, color, drawn);
    }
  }
  for (let i = 0; i < creatures.length; i += 1) {
    const slot = creatures[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live":
        drawn = drawBed(slot.creature.bedTile, width, mesh, dummy, color, drawn);
        break;
      default: {
        const never: never = slot;
        throw never;
      }
    }
  }
  for (let i = 0; i < chickens.length; i += 1) {
    const slot = chickens[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live":
        drawn = drawChicken(slot.chicken.tile, width, mesh, dummy, color, drawn);
        break;
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

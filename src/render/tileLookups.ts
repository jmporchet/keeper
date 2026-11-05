import { TILE_KIND, TILE_KIND_COUNT, TILE_KINDS, type TileKind } from "../sim";

export { TILE_KIND_COUNT };

export const ROOM_TREASURY_COLOR = 0x9a6a48;
export const ROOM_LAIR_COLOR = 0x3f8f7f;
export const ROOM_HATCHERY_COLOR = 0xb9a15c;
export const ROOM_TRAINING_COLOR = 0xd9823b;
export const ROOM_WORKSHOP_COLOR = 0x6f86b8;
export const ROOM_LIBRARY_COLOR = 0x8c6bb1;
export const ROOM_FLOOR_COLOR = 0x9a6a48;
export const PORTAL_COLOR = 0x8a5cff;
export const DOOR_COLOR = 0xd08a3c;
export const DOOR_OPEN_COLOR = 0x7d6238;
export const TRAP_COLOR = 0x59c878;
export const TRAP_SPENT_COLOR = 0x546b5a;

export function colorForKind(kind: TileKind): number {
  switch (kind) {
    case "earth":
      return 0x5e4430;
    case "goldSeam":
      return 0xf0b820;
    case "rock":
      return 0x6a6872;
    case "dirt":
      return 0x7a4a28;
    case "claimed":
      return 0xa08a70;
    case "room":
      return ROOM_TREASURY_COLOR;
    case "taggedEarth":
      return 0xff7a38;
    case "taggedGold":
      return 0xfff06a;
    case "portal":
      return PORTAL_COLOR;
    default: {
      const never: never = kind;
      return never;
    }
  }
}

export function heightForKind(kind: TileKind): number {
  switch (kind) {
    case "claimed":
    case "dirt":
    case "room":
    case "portal":
      return 0.2;
    case "earth":
    case "goldSeam":
      return 1;
    case "taggedEarth":
    case "taggedGold":
      return 1.18;
    case "rock":
      return 1.4;
    default: {
      const never: never = kind;
      return never;
    }
  }
}

export const TILE_COLOR = new Uint32Array(TILE_KIND_COUNT);
export const TILE_HEIGHT = new Float32Array(TILE_KIND_COUNT);

for (const kind of TILE_KINDS) {
  const code = TILE_KIND[kind];
  TILE_COLOR[code] = colorForKind(kind);
  TILE_HEIGHT[code] = heightForKind(kind);
}

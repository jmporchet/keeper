export const MAP_WIDTH = 64;
export const MAP_HEIGHT = 64;
export const MAP_HALF = 32;
export const HEART_X = 32;
export const HEART_Y = 32;

export const TILE_KINDS = [
  "earth",
  "goldSeam",
  "rock",
  "dirt",
  "claimed",
  "room",
  "taggedEarth",
  "taggedGold",
  "portal",
] as const;

export type TileKind = (typeof TILE_KINDS)[number];

function kindCode(kind: TileKind): number {
  const index = TILE_KINDS.indexOf(kind);
  if (index < 0) {
    throw new Error("unknown tile kind");
  }
  return index;
}

export const TILE_KIND = {
  earth: kindCode("earth"),
  goldSeam: kindCode("goldSeam"),
  rock: kindCode("rock"),
  dirt: kindCode("dirt"),
  claimed: kindCode("claimed"),
  room: kindCode("room"),
  taggedEarth: kindCode("taggedEarth"),
  taggedGold: kindCode("taggedGold"),
  portal: kindCode("portal"),
} as const;

export const TILE_KIND_COUNT = TILE_KINDS.length;

export type TileKindCode = (typeof TILE_KIND)[TileKind];

export const ROOM_KINDS = ["none", "treasury", "lair", "hatchery", "training", "workshop"] as const;

export type RoomKind = (typeof ROOM_KINDS)[number];

function roomCode(kind: RoomKind): number {
  const index = ROOM_KINDS.indexOf(kind);
  if (index < 0) {
    throw new Error("unknown room kind");
  }
  return index;
}

export const ROOM_KIND = {
  none: roomCode("none"),
  treasury: roomCode("treasury"),
  lair: roomCode("lair"),
  hatchery: roomCode("hatchery"),
  training: roomCode("training"),
  workshop: roomCode("workshop"),
} as const;

export const ROOM_KIND_COUNT = ROOM_KINDS.length;

export type RoomKindCode = (typeof ROOM_KIND)[RoomKind];

export const TREASURY_CAPACITY = 200;
export const TREASURY_COST = 25;
export const LAIR_COST = 30;
export const HATCHERY_COST = 50;
export const TRAINING_COST = 40;
export const WORKSHOP_COST = 45;

export const PORTAL_X = 32;
export const PORTAL_Y = 35;

export type RoomTool = "treasury" | "lair" | "hatchery" | "training" | "workshop";

export type TileRead = {
  readonly length: number;
  readonly [index: number]: number;
};

export function tileKindAt(tiles: TileRead, index: number): TileKind {
  const code = tiles[index];
  if (code === undefined) {
    throw new Error("tile index out of range");
  }
  const kind = TILE_KINDS[code];
  if (kind === undefined) {
    throw new Error("invalid tile kind");
  }
  return kind;
}

export function roomKindAt(rooms: TileRead, index: number): RoomKind {
  const code = rooms[index];
  if (code === undefined) {
    throw new Error("room index out of range");
  }
  const kind = ROOM_KINDS[code];
  if (kind === undefined) {
    throw new Error("invalid room kind");
  }
  return kind;
}

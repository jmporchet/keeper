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
} as const;

export const TILE_KIND_COUNT = TILE_KINDS.length;

export type TileKindCode = (typeof TILE_KIND)[TileKind];

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

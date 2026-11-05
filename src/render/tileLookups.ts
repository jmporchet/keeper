import { TILE_KIND, type TileKind } from "../sim";

export const TILE_KIND_COUNT = 6;

export function colorForKind(kind: TileKind): number {
  switch (kind) {
    case "earth":
      return 0x9a6540;
    case "goldSeam":
      return 0xf0c94a;
    case "rock":
      return 0x8a868e;
    case "dirt":
      return 0xb88858;
    case "claimed":
      return 0xd4ae82;
    case "room":
      return 0xe0c49a;
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
      return 0.2;
    case "earth":
    case "goldSeam":
      return 1;
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

const KINDS: readonly TileKind[] = ["earth", "goldSeam", "rock", "dirt", "claimed", "room"];

for (const kind of KINDS) {
  const code = TILE_KIND[kind];
  TILE_COLOR[code] = colorForKind(kind);
  TILE_HEIGHT[code] = heightForKind(kind);
}

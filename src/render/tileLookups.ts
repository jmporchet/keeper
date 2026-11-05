import { TILE_KIND, TILE_KIND_COUNT, TILE_KINDS, type TileKind } from "../sim";

export { TILE_KIND_COUNT };

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
      return 0x9a6a48;
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

for (const kind of TILE_KINDS) {
  const code = TILE_KIND[kind];
  TILE_COLOR[code] = colorForKind(kind);
  TILE_HEIGHT[code] = heightForKind(kind);
}

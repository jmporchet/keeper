import * as THREE from "three";
import { ROOM_KIND, type TileKind } from "../sim";

export const ATLAS_COLUMNS = 4;
export const ATLAS_ROWS = 4;
export const ATLAS_CELL_SIZE = 64;
export const ATLAS_WIDTH = ATLAS_COLUMNS * ATLAS_CELL_SIZE;
export const ATLAS_HEIGHT = ATLAS_ROWS * ATLAS_CELL_SIZE;
export const ATLAS_CELL_COUNT = ATLAS_COLUMNS * ATLAS_ROWS;

export const ATLAS_CELL = {
  earthTop: 0,
  dirt: 1,
  claimedFlags: 2,
  rock: 3,
  goldVeins: 4,
  roomFloor: 5,
  portalFloor: 6,
  wall: 7,
  treasuryFloor: 8,
  lairFloor: 9,
  hatcheryFloor: 10,
  trainingFloor: 11,
  workshopFloor: 12,
  libraryFloor: 13,
} as const;

export function atlasCellForRoomKind(roomKindCode: number): number {
  switch (roomKindCode) {
    case ROOM_KIND.treasury:
      return ATLAS_CELL.treasuryFloor;
    case ROOM_KIND.lair:
      return ATLAS_CELL.lairFloor;
    case ROOM_KIND.hatchery:
      return ATLAS_CELL.hatcheryFloor;
    case ROOM_KIND.training:
      return ATLAS_CELL.trainingFloor;
    case ROOM_KIND.workshop:
      return ATLAS_CELL.workshopFloor;
    case ROOM_KIND.library:
      return ATLAS_CELL.libraryFloor;
    default:
      return ATLAS_CELL.roomFloor;
  }
}

export function atlasCellForKind(kind: TileKind): number {
  switch (kind) {
    case "earth":
    case "taggedEarth":
      return ATLAS_CELL.earthTop;
    case "dirt":
      return ATLAS_CELL.dirt;
    case "claimed":
      return ATLAS_CELL.claimedFlags;
    case "rock":
      return ATLAS_CELL.rock;
    case "goldSeam":
    case "taggedGold":
      return ATLAS_CELL.goldVeins;
    case "room":
      return ATLAS_CELL.roomFloor;
    case "portal":
      return ATLAS_CELL.portalFloor;
    default: {
      const never: never = kind;
      return never;
    }
  }
}

function hashNoise(x: number, y: number, seed: number): number {
  let h = Math.imul(x + 0x9e3779b9, 0x85ebca6b);
  h ^= Math.imul(y + seed, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967295;
}

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hashNoise(xi, yi, seed);
  const b = hashNoise(xi + 1, yi, seed);
  const c = hashNoise(xi, yi + 1, seed);
  const d = hashNoise(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function setPixel(data: Uint8ClampedArray, x: number, y: number, r: number, g: number, b: number): void {
  const index = (y * ATLAS_WIDTH + x) * 4;
  data[index] = r;
  data[index + 1] = g;
  data[index + 2] = b;
  data[index + 3] = 255;
}

function drawEarthTop(data: Uint8ClampedArray, ox: number, oy: number): void {
  for (let y = 0; y < ATLAS_CELL_SIZE; y += 1) {
    for (let x = 0; x < ATLAS_CELL_SIZE; x += 1) {
      const broad = valueNoise(x / 11, y / 11, 17);
      const grain = hashNoise(x, y, 31);
      const crack = valueNoise(x / 5, y / 5, 41);
      let shade = 0.66 + broad * 0.26 + (grain - 0.5) * 0.1;
      if (crack < 0.18) {
        shade -= 0.18;
      }
      if (grain > 0.97) {
        shade += 0.12;
      }
      const v = clamp(shade, 0, 1);
      setPixel(data, ox + x, oy + y, 255 * v * 0.98, 255 * v * 0.94, 255 * v * 0.88);
    }
  }
}

function drawDirt(data: Uint8ClampedArray, ox: number, oy: number): void {
  for (let y = 0; y < ATLAS_CELL_SIZE; y += 1) {
    for (let x = 0; x < ATLAS_CELL_SIZE; x += 1) {
      const broad = valueNoise(x / 7, y / 7, 53);
      const grain = hashNoise(x * 3, y * 3, 59);
      let shade = 0.5 + broad * 0.3 + (grain - 0.5) * 0.18;
      if (grain > 0.94) {
        shade += 0.16;
      }
      const v = clamp(shade, 0, 1);
      setPixel(data, ox + x, oy + y, 255 * v * 0.95, 255 * v * 0.85, 255 * v * 0.7);
    }
  }
}

function drawClaimedFlags(data: Uint8ClampedArray, ox: number, oy: number): void {
  for (let y = 0; y < ATLAS_CELL_SIZE; y += 1) {
    for (let x = 0; x < ATLAS_CELL_SIZE; x += 1) {
      const fx = x % 16;
      const fy = y % 16;
      const block = Math.floor(x / 16) + Math.floor(y / 16) * 7;
      const grain = valueNoise(x / 8, y / 8, 73);
      let shade = 0.78 + hashNoise(block, 0, 71) * 0.12 + (grain - 0.5) * 0.08;
      if (fx === 0 || fy === 0) {
        shade = 0.42 + (grain - 0.5) * 0.05;
      } else {
        if (fx === 1 || fy === 1) {
          shade += 0.05;
        }
        if (fx === 15 || fy === 15) {
          shade -= 0.06;
        }
      }
      const v = clamp(shade, 0, 1);
      setPixel(data, ox + x, oy + y, 255 * v, 255 * v * 0.98, 255 * v * 0.94);
    }
  }
}

function drawRock(data: Uint8ClampedArray, ox: number, oy: number): void {
  for (let y = 0; y < ATLAS_CELL_SIZE; y += 1) {
    for (let x = 0; x < ATLAS_CELL_SIZE; x += 1) {
      const broad = valueNoise(x / 7, y / 7, 83);
      const ridge = Math.abs(valueNoise(x / 12, y / 12, 89) - 0.5);
      const sparkle = hashNoise(x, y, 97);
      let shade = 0.55 + broad * 0.3;
      if (ridge < 0.06) {
        shade -= 0.22;
      }
      if (sparkle > 0.96) {
        shade += 0.12;
      }
      const v = clamp(shade, 0, 1);
      setPixel(data, ox + x, oy + y, 255 * v * 0.98, 255 * v * 0.98, 255 * v);
    }
  }
}

function drawGoldVeins(data: Uint8ClampedArray, ox: number, oy: number): void {
  for (let y = 0; y < ATLAS_CELL_SIZE; y += 1) {
    for (let x = 0; x < ATLAS_CELL_SIZE; x += 1) {
      const base = 0.35 + valueNoise(x / 9, y / 9, 101) * 0.18;
      const vein = Math.abs(valueNoise(x / 14, y / 14, 103) - 0.5);
      const sparkle = hashNoise(x, y, 107);
      if (vein < 0.06 || sparkle > 0.985) {
        setPixel(data, ox + x, oy + y, 255 * (0.9 + sparkle * 0.1), 255 * 0.85, 255 * 0.35);
      } else {
        const v = clamp(base, 0, 1);
        setPixel(data, ox + x, oy + y, 255 * v, 255 * v, 255 * v * 1.05);
      }
    }
  }
}

function drawRoomFloor(data: Uint8ClampedArray, ox: number, oy: number): void {
  for (let y = 0; y < ATLAS_CELL_SIZE; y += 1) {
    for (let x = 0; x < ATLAS_CELL_SIZE; x += 1) {
      const grain = valueNoise(x / 10, y / 10, 109);
      const dx = x - 32;
      const dy = y - 32;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let shade = 0.8 + (grain - 0.5) * 0.1;
      if (x === 0 || y === 0 || x === ATLAS_CELL_SIZE - 1 || y === ATLAS_CELL_SIZE - 1 || x === 32 || y === 32) {
        shade = 0.5;
      } else if (dist > 20 && dist < 22) {
        shade = 0.62;
      } else if ((x + y) % 8 === 0) {
        shade -= 0.04;
      }
      const v = clamp(shade, 0, 1);
      setPixel(data, ox + x, oy + y, 255 * v, 255 * v * 0.97, 255 * v * 0.92);
    }
  }
}

function drawPortalFloor(data: Uint8ClampedArray, ox: number, oy: number): void {
  for (let y = 0; y < ATLAS_CELL_SIZE; y += 1) {
    for (let x = 0; x < ATLAS_CELL_SIZE; x += 1) {
      const dx = x - 32;
      const dy = y - 32;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const spiral = Math.sin(angle * 3 + dist * 0.5) * 0.5 + 0.5;
      let shade = 0.62 + spiral * 0.25 + valueNoise(x / 8, y / 8, 113) * 0.12;
      if (dist < 6) {
        shade += 0.15;
      }
      const v = clamp(shade, 0, 1);
      setPixel(data, ox + x, oy + y, 255 * v * 0.9, 255 * v * 0.85, 255 * v);
    }
  }
}

function drawTreasuryFloor(data: Uint8ClampedArray, ox: number, oy: number): void {
  for (let y = 0; y < ATLAS_CELL_SIZE; y += 1) {
    for (let x = 0; x < ATLAS_CELL_SIZE; x += 1) {
      const cx = x % 32;
      const cy = y % 32;
      const dx = cx - 16;
      const dy = cy - 16;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const grain = valueNoise(x / 9, y / 9, 139);
      const sparkle = hashNoise(x, y, 149);
      let shade = 0.42 + grain * 0.16 + (sparkle - 0.5) * 0.06;
      let warm = 0.72;
      if (dist < 8.5) {
        warm = 1;
        if (dist > 7.2) {
          shade = 0.36;
        } else if (dist < 2) {
          shade = 0.95;
        } else {
          shade = 0.82 + hashNoise(x, y, 151) * 0.12;
        }
      } else if (dist > 8.5 && dist < 10.5) {
        shade -= 0.12;
      }
      const v = clamp(shade, 0, 1);
      setPixel(data, ox + x, oy + y, 255 * v, 255 * v * (0.72 + warm * 0.26), 255 * v * warm);
    }
  }
}

function drawLairFloor(data: Uint8ClampedArray, ox: number, oy: number): void {
  for (let y = 0; y < ATLAS_CELL_SIZE; y += 1) {
    for (let x = 0; x < ATLAS_CELL_SIZE; x += 1) {
      const band = Math.floor(y / 8);
      const fy = y % 8;
      const fiber = hashNoise(x * 2, y, 163);
      let shade = 0.48 + hashNoise(band, 0, 157) * 0.16 + valueNoise(x / 13, y / 5, 159) * 0.1;
      if (fy === 0) {
        shade = 0.32;
      } else if (fy === 1) {
        shade += 0.14;
      } else if (fy >= 6) {
        shade -= 0.08;
      }
      if (fiber > 0.9) {
        shade += 0.14;
      }
      const v = clamp(shade, 0, 1);
      setPixel(data, ox + x, oy + y, 255 * v * 0.88, 255 * v, 255 * v * 0.9);
    }
  }
}

function drawHatcheryFloor(data: Uint8ClampedArray, ox: number, oy: number): void {
  for (let y = 0; y < ATLAS_CELL_SIZE; y += 1) {
    for (let x = 0; x < ATLAS_CELL_SIZE; x += 1) {
      const cx = x % 32;
      const cy = y % 32;
      const dx = cx - 16;
      const dy = cy - 16;
      const oval = (dx * dx) / 169 + (dy * dy) / 64;
      const straw = hashNoise(x * 3, y, 167);
      let shade = 0.44 + valueNoise(x / 10, y / 10, 169) * 0.16 + (straw - 0.5) * 0.08;
      let warm = 0.82;
      if (oval < 1) {
        warm = 1;
        if (oval > 0.72) {
          shade = 0.34;
        } else if (oval < 0.18) {
          shade = 0.86;
        } else {
          shade = 0.62 + straw * 0.18;
        }
      } else if (oval > 1 && oval < 1.25) {
        shade -= 0.1;
      }
      const v = clamp(shade, 0, 1);
      setPixel(data, ox + x, oy + y, 255 * v * (0.78 + warm * 0.22), 255 * v * (0.72 + warm * 0.28), 255 * v * warm * 0.9);
    }
  }
}

function drawTrainingFloor(data: Uint8ClampedArray, ox: number, oy: number): void {
  for (let y = 0; y < ATLAS_CELL_SIZE; y += 1) {
    for (let x = 0; x < ATLAS_CELL_SIZE; x += 1) {
      const dx = x - 32;
      const dy = y - 32;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const grain = valueNoise(x / 8, y / 8, 173);
      let shade = 0.5 + grain * 0.14;
      if (Math.abs(dist - 8) < 1 || Math.abs(dist - 18) < 1 || Math.abs(dist - 28) < 1) {
        shade = 0.84;
      } else if (Math.abs(dx) < 0.9 || Math.abs(dy) < 0.9) {
        shade = 0.36;
      } else if (Math.abs(dx - dy) < 0.9 || Math.abs(dx + dy) < 0.9) {
        shade = 0.4;
      } else if (dist < 8) {
        shade += 0.1;
      }
      const v = clamp(shade, 0, 1);
      setPixel(data, ox + x, oy + y, 255 * v, 255 * v * (0.82 + grain * 0.18), 255 * v * 0.62);
    }
  }
}

function drawWorkshopFloor(data: Uint8ClampedArray, ox: number, oy: number): void {
  for (let y = 0; y < ATLAS_CELL_SIZE; y += 1) {
    for (let x = 0; x < ATLAS_CELL_SIZE; x += 1) {
      const fx = x % 16;
      const fy = y % 16;
      const grain = valueNoise(x / 9, y / 9, 179);
      let shade = 0.5 + grain * 0.16;
      let cool = 0.9;
      if (fx === 0 || fy === 0) {
        shade = 0.34;
      } else if (fx === 1 || fy === 1) {
        shade += 0.1;
      } else if (fx === 15 || fy === 15) {
        shade -= 0.06;
      }
      if (x >= 20 && x <= 44 && y >= 28 && y <= 36) {
        shade = 0.78;
        cool = 1;
      }
      if (x >= 24 && x <= 40 && y >= 24 && y <= 28) {
        shade = 0.9;
        cool = 1;
      }
      if (x >= 30 && x <= 34 && y >= 36 && y <= 44) {
        shade = 0.66;
        cool = 1;
      }
      if ((fx === 8 && fy === 8) || (fx === 8 && fy === 0) || (fx === 0 && fy === 8)) {
        shade = 0.22;
      }
      const v = clamp(shade, 0, 1);
      setPixel(data, ox + x, oy + y, 255 * v * (0.84 + cool * 0.16), 255 * v * (0.86 + cool * 0.14), 255 * v * cool);
    }
  }
}

function drawLibraryFloor(data: Uint8ClampedArray, ox: number, oy: number): void {
  for (let y = 0; y < ATLAS_CELL_SIZE; y += 1) {
    for (let x = 0; x < ATLAS_CELL_SIZE; x += 1) {
      const row = Math.floor(y / 16);
      const fy = y % 16;
      const fx = x % 8;
      const book = Math.floor(x / 8) + row * 7;
      let shade = 0.44 + valueNoise(x / 10, y / 10, 181) * 0.14;
      let cool = 0.82;
      if (fy === 0 || fy === 15) {
        shade = 0.3;
      } else if (fy > 1 && fy < 14) {
        cool = 1;
        shade = 0.56 + hashNoise(book, row, 191) * 0.28;
        if (fx === 0) {
          shade = 0.28;
        } else if (fx === 1) {
          shade += 0.08;
        }
      }
      const dx = x - 32;
      const dy = y - 32;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (Math.abs(dist - 10) < 1.2) {
        shade = 0.9;
        cool = 1;
      } else if (dist < 10 && (Math.abs(dx) < 0.8 || Math.abs(dy) < 0.8)) {
        shade = 0.7;
        cool = 1;
      }
      const v = clamp(shade, 0, 1);
      setPixel(data, ox + x, oy + y, 255 * v * (0.82 + cool * 0.18), 255 * v * (0.76 + cool * 0.24), 255 * v * cool);
    }
  }
}

function drawCaveWall(data: Uint8ClampedArray, ox: number, oy: number): void {
  for (let y = 0; y < ATLAS_CELL_SIZE; y += 1) {
    for (let x = 0; x < ATLAS_CELL_SIZE; x += 1) {
      const broad = valueNoise(x / 9, y / 9, 127);
      const grain = hashNoise(x, y, 131);
      const vertical = valueNoise(x / 4, y / 18, 137);
      const seam = x % 16;
      let shade = 0.6 + broad * 0.2 + (vertical - 0.5) * 0.14;
      if (seam === 0) {
        shade -= 0.22;
      } else if (seam === 1) {
        shade += 0.06;
      }
      if (grain > 0.95) {
        shade += 0.08;
      }
      const v = clamp(shade, 0, 1);
      setPixel(data, ox + x, oy + y, 255 * v, 255 * v * 0.97, 255 * v * 0.92);
    }
  }
}

function drawCell(data: Uint8ClampedArray, cell: number, ox: number, oy: number): void {
  if (cell === ATLAS_CELL.earthTop) {
    drawEarthTop(data, ox, oy);
  } else if (cell === ATLAS_CELL.dirt) {
    drawDirt(data, ox, oy);
  } else if (cell === ATLAS_CELL.claimedFlags) {
    drawClaimedFlags(data, ox, oy);
  } else if (cell === ATLAS_CELL.rock) {
    drawRock(data, ox, oy);
  } else if (cell === ATLAS_CELL.goldVeins) {
    drawGoldVeins(data, ox, oy);
  } else if (cell === ATLAS_CELL.roomFloor) {
    drawRoomFloor(data, ox, oy);
  } else if (cell === ATLAS_CELL.portalFloor) {
    drawPortalFloor(data, ox, oy);
  } else if (cell === ATLAS_CELL.treasuryFloor) {
    drawTreasuryFloor(data, ox, oy);
  } else if (cell === ATLAS_CELL.lairFloor) {
    drawLairFloor(data, ox, oy);
  } else if (cell === ATLAS_CELL.hatcheryFloor) {
    drawHatcheryFloor(data, ox, oy);
  } else if (cell === ATLAS_CELL.trainingFloor) {
    drawTrainingFloor(data, ox, oy);
  } else if (cell === ATLAS_CELL.workshopFloor) {
    drawWorkshopFloor(data, ox, oy);
  } else if (cell === ATLAS_CELL.libraryFloor) {
    drawLibraryFloor(data, ox, oy);
  } else {
    drawCaveWall(data, ox, oy);
  }
}

export function buildAtlasPixels(): Uint8ClampedArray {
  const data = new Uint8ClampedArray(ATLAS_WIDTH * ATLAS_HEIGHT * 4);
  for (let cell = 0; cell < ATLAS_CELL_COUNT; cell += 1) {
    const ox = (cell % ATLAS_COLUMNS) * ATLAS_CELL_SIZE;
    const oy = Math.floor(cell / ATLAS_COLUMNS) * ATLAS_CELL_SIZE;
    drawCell(data, cell, ox, oy);
  }
  return data;
}

type AtlasCanvas = HTMLCanvasElement | OffscreenCanvas;

function createAtlasCanvas(): AtlasCanvas | undefined {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(ATLAS_WIDTH, ATLAS_HEIGHT);
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = ATLAS_WIDTH;
    canvas.height = ATLAS_HEIGHT;
    return canvas;
  }
  return undefined;
}

function configureAtlasTexture(texture: THREE.Texture): void {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.flipY = true;
  texture.needsUpdate = true;
}

export function createTileAtlasTexture(): THREE.Texture {
  const data = buildAtlasPixels();
  const canvas = createAtlasCanvas();
  if (canvas !== undefined) {
    const context = canvas.getContext("2d");
    if (context !== null) {
      const image = context.createImageData(ATLAS_WIDTH, ATLAS_HEIGHT);
      image.data.set(data);
      context.putImageData(image, 0, 0);
      const texture = new THREE.CanvasTexture<AtlasCanvas>(canvas);
      configureAtlasTexture(texture);
      return texture;
    }
  }
  const texture = new THREE.DataTexture(data, ATLAS_WIDTH, ATLAS_HEIGHT, THREE.RGBAFormat);
  configureAtlasTexture(texture);
  return texture;
}

export function createTileAtlasMaterial(texture: THREE.Texture): THREE.MeshLambertMaterial {
  const cellWidth = 1 / ATLAS_COLUMNS;
  const cellHeight = 1 / ATLAS_ROWS;
  const material = new THREE.MeshLambertMaterial({ map: texture });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nattribute float atlasCell;",
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <uv_vertex>",
      `#include <uv_vertex>
#ifdef USE_MAP
float atlasColumn = mod( atlasCell, ${ATLAS_COLUMNS.toFixed(1)} );
float atlasRow = floor( atlasCell / ${ATLAS_COLUMNS.toFixed(1)} );
vMapUv = vMapUv * vec2( ${cellWidth.toFixed(6)}, ${cellHeight.toFixed(6)} ) + vec2( atlasColumn * ${cellWidth.toFixed(6)}, 1.0 - ( atlasRow + 1.0 ) * ${cellHeight.toFixed(6)} );
#endif`,
    );
  };
  return material;
}

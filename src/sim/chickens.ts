import { asChickenId, type ChickenId, type TileIndex } from "./ids";

export const CHICKEN_CAPACITY = 32;
export const CHICKEN_TILE_CAP = 2;
export const HATCH_TICKS = 100;

export type Chicken = {
  id: ChickenId;
  tile: TileIndex;
};

export type ChickenSlot = { kind: "empty" } | { kind: "live"; chicken: Chicken };

export type ChickenBoard = {
  slots: ChickenSlot[];
};

export function createChicken(index: number, tile: TileIndex): Chicken {
  return {
    id: asChickenId(index),
    tile,
  };
}

export function createChickenBoard(): ChickenBoard {
  const slots: ChickenSlot[] = [];
  for (let i = 0; i < CHICKEN_CAPACITY; i += 1) {
    slots.push({ kind: "empty" });
  }
  return { slots };
}

export function liveChickenCount(board: ChickenBoard): number {
  let n = 0;
  for (let i = 0; i < board.slots.length; i += 1) {
    const slot = board.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live":
        n += 1;
        break;
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  return n;
}

export function spawnChicken(board: ChickenBoard, tile: TileIndex): boolean {
  for (let i = 0; i < board.slots.length; i += 1) {
    const slot = board.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        board.slots[i] = { kind: "live", chicken: createChicken(i, tile) };
        return true;
      case "live":
        break;
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  return false;
}

export function removeChicken(board: ChickenBoard, id: ChickenId): TileIndex | undefined {
  const slot = board.slots[id];
  if (slot === undefined) {
    return undefined;
  }
  switch (slot.kind) {
    case "empty":
      return undefined;
    case "live": {
      const tile = slot.chicken.tile;
      board.slots[id] = { kind: "empty" };
      return tile;
    }
    default: {
      const never: never = slot;
      return never;
    }
  }
}

function mix(h: number, v: number): number {
  return Math.imul(h ^ (v >>> 0), 16777619) >>> 0;
}

export function hashChickens(board: ChickenBoard): number {
  let h = 2166136261;
  h = mix(h, board.slots.length);
  for (let i = 0; i < board.slots.length; i += 1) {
    const slot = board.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        h = mix(h, 0);
        break;
      case "live": {
        const chicken = slot.chicken;
        h = mix(h, 1);
        h = mix(h, chicken.id);
        h = mix(h, chicken.tile);
        break;
      }
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  return h >>> 0;
}

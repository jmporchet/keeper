import type { Creature } from "./creatures";
import { type CreatureId } from "./ids";
import { isWalkableCode } from "./path";
import type { World } from "./worldCore";

export type Possession = { kind: "none" } | { kind: "creature"; id: CreatureId };

export function noPossession(): Possession {
  return { kind: "none" };
}

export function findCreature(world: World, id: CreatureId): Creature | undefined {
  const slot = world.creatures.slots[id];
  if (slot === undefined) {
    return undefined;
  }
  switch (slot.kind) {
    case "empty":
      return undefined;
    case "live":
      return slot.creature;
    default: {
      const never: never = slot;
      return never;
    }
  }
}

export function isPossessedCreature(world: World, id: CreatureId): boolean {
  return world.possession.kind === "creature" && world.possession.id === id;
}

export function applyPossess(world: World, id: CreatureId): void {
  const creature = findCreature(world, id);
  if (creature === undefined) {
    return;
  }
  creature.headingX = 0;
  creature.headingY = 0;
  world.possession = { kind: "creature", id };
}

export function applyReleasePossess(world: World): void {
  world.possession = noPossession();
}

export function applyPossessMove(world: World, id: CreatureId, dx: number, dy: number): void {
  if (!Number.isInteger(dx) || !Number.isInteger(dy)) {
    return;
  }
  if (Math.abs(dx) + Math.abs(dy) !== 1) {
    return;
  }
  if (world.possession.kind !== "creature" || world.possession.id !== id) {
    return;
  }
  const creature = findCreature(world, id);
  if (creature === undefined) {
    return;
  }
  const nextX = creature.tileX + dx;
  const nextY = creature.tileY + dy;
  if (nextX < 0 || nextY < 0 || nextX >= world.width || nextY >= world.height) {
    return;
  }
  const tile = nextY * world.width + nextX;
  const code = world.tiles[tile];
  if (code === undefined || !isWalkableCode(code)) {
    return;
  }
  creature.tileX = nextX;
  creature.tileY = nextY;
  creature.headingX = dx;
  creature.headingY = dy;
}

export function syncPossession(world: World): void {
  if (world.possession.kind !== "creature") {
    return;
  }
  if (findCreature(world, world.possession.id) === undefined) {
    world.possession = noPossession();
  }
}

function mix(h: number, v: number): number {
  return Math.imul(h ^ (v >>> 0), 16777619) >>> 0;
}

export function hashPossession(possession: Possession): number {
  let h = 2166136261;
  switch (possession.kind) {
    case "none":
      h = mix(h, 0);
      break;
    case "creature":
      h = mix(h, 1);
      h = mix(h, possession.id);
      break;
    default: {
      const never: never = possession;
      return never;
    }
  }
  return h >>> 0;
}

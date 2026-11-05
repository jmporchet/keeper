import type { CreatureId } from "./ids";
import { spendGold } from "./wages";
import type { World } from "./worldCore";

export const HEAL_COST = 50;
export const HEAL_AMOUNT = 2;
export const HEAL_COOLDOWN_TICKS = 40;

export function applyCastHeal(world: World, creatureId: CreatureId): void {
  if (world.defeated || world.victorious) {
    return;
  }
  if (world.healCooldown > 0) {
    return;
  }
  const slot = world.creatures.slots[creatureId];
  if (slot === undefined) {
    return;
  }
  switch (slot.kind) {
    case "empty":
      return;
    case "live": {
      if (!spendGold(world, HEAL_COST)) {
        return;
      }
      const creature = slot.creature;
      creature.hp = Math.min(creature.hp + HEAL_AMOUNT, creature.maxHp);
      world.healCooldown = HEAL_COOLDOWN_TICKS;
      return;
    }
    default: {
      const never: never = slot;
      return never;
    }
  }
}

export function stepHealCooldown(world: World): void {
  if (world.healCooldown > 0) {
    world.healCooldown -= 1;
  }
}

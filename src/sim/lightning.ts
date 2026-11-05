import { EMPTY_HERO_SLOT } from "./heroes";
import type { HeroId } from "./ids";
import { spendGold } from "./wages";
import type { World } from "./worldCore";

export const LIGHTNING_COST = 60;
export const LIGHTNING_DAMAGE = 3;
export const LIGHTNING_COOLDOWN_TICKS = 40;

export function applyCastLightning(world: World, heroId: HeroId): void {
  if (world.defeated || world.victorious) {
    return;
  }
  if (world.lightningCooldown > 0) {
    return;
  }
  const slot = world.heroes.slots[heroId];
  if (slot === undefined) {
    return;
  }
  switch (slot.kind) {
    case "empty":
      return;
    case "live": {
      if (!spendGold(world, LIGHTNING_COST)) {
        return;
      }
      const hero = slot.hero;
      hero.hp -= LIGHTNING_DAMAGE;
      if (hero.hp <= 0) {
        world.heroes.slots[heroId] = EMPTY_HERO_SLOT;
      }
      world.lightningCooldown = LIGHTNING_COOLDOWN_TICKS;
      return;
    }
    default: {
      const never: never = slot;
      return never;
    }
  }
}

export function stepLightningCooldown(world: World): void {
  if (world.lightningCooldown > 0) {
    world.lightningCooldown -= 1;
  }
}

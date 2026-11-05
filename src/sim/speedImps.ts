import { boostImp } from "./imps";
import { spendGold } from "./wages";
import type { World } from "./worldCore";

export const SPEED_IMPS_COST = 40;
export const SPEED_IMPS_DURATION_TICKS = 80;
export const SPEED_IMPS_COOLDOWN_TICKS = 40;

function hasEligibleImp(world: World): boolean {
  for (let i = 0; i < world.imps.slots.length; i += 1) {
    const slot = world.imps.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live":
        if (slot.imp.state.kind !== "held") {
          return true;
        }
        break;
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  return false;
}

export function applyCastSpeedImps(world: World): void {
  if (world.defeated || world.victorious) {
    return;
  }
  if (world.speedImpsCooldown > 0) {
    return;
  }
  if (!hasEligibleImp(world)) {
    return;
  }
  if (!spendGold(world, SPEED_IMPS_COST)) {
    return;
  }
  for (let i = 0; i < world.imps.slots.length; i += 1) {
    const slot = world.imps.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live":
        if (slot.imp.state.kind !== "held") {
          boostImp(slot.imp, SPEED_IMPS_DURATION_TICKS);
        }
        break;
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  world.speedImpsCooldown = SPEED_IMPS_COOLDOWN_TICKS;
}

export function stepSpeedImpsCooldown(world: World): void {
  if (world.speedImpsCooldown > 0) {
    world.speedImpsCooldown -= 1;
  }
}

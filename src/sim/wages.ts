import type { World } from "./worldCore";

export const PAY_TICKS = 450;
export const CREATURE_WAGE = 10;

export function ticksUntilPayday(tick: number): number {
  if (tick <= 0) {
    return PAY_TICKS;
  }
  const remainder = tick % PAY_TICKS;
  if (remainder === 0) {
    return 0;
  }
  return PAY_TICKS - remainder;
}

export function availableGold(world: World): number {
  let total = world.goldStored;
  for (let i = 0; i < world.treasuryStock.length; i += 1) {
    const stock = world.treasuryStock[i];
    if (stock === undefined) {
      continue;
    }
    total += stock;
  }
  return total;
}

export function drainTreasury(world: World, amount: number): number {
  let remaining = amount;
  for (let i = 0; i < world.treasuryStock.length && remaining > 0; i += 1) {
    const stock = world.treasuryStock[i];
    if (stock === undefined || stock === 0) {
      continue;
    }
    const take = stock < remaining ? stock : remaining;
    world.treasuryStock[i] = stock - take;
    remaining -= take;
    world.treasuryVersion += 1;
  }
  return remaining;
}

export function spendGold(world: World, cost: number): boolean {
  if (availableGold(world) < cost) {
    return false;
  }
  const fromStored = world.goldStored < cost ? world.goldStored : cost;
  world.goldStored -= fromStored;
  drainTreasury(world, cost - fromStored);
  world.goldSpent += cost;
  return true;
}

export function runPayday(world: World): void {
  if (world.tick === 0 || world.tick % PAY_TICKS !== 0) {
    return;
  }
  const slots = world.creatures.slots;
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live": {
        if (availableGold(world) < CREATURE_WAGE) {
          slots[i] = { kind: "empty" };
          break;
        }
        const remaining = drainTreasury(world, CREATURE_WAGE);
        world.goldStored -= remaining;
        world.goldPaidOut += CREATURE_WAGE;
        break;
      }
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
}

import { type ImpId } from "./ids";

export const HAND_CAPACITY = 8;

export type HandSlot = { kind: "empty" } | { kind: "held"; impId: ImpId };

export type Hand = {
  slots: HandSlot[];
  count: number;
};

const EMPTY_HAND_SLOT: HandSlot = { kind: "empty" };

export function createHand(): Hand {
  const slots: HandSlot[] = [];
  for (let i = 0; i < HAND_CAPACITY; i += 1) {
    slots.push(EMPTY_HAND_SLOT);
  }
  return { slots, count: 0 };
}

export function isHeld(hand: Hand, impId: ImpId): boolean {
  for (let i = 0; i < hand.count; i += 1) {
    const slot = hand.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "held":
        if (slot.impId === impId) {
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

export function addHeld(hand: Hand, impId: ImpId): boolean {
  if (hand.count >= HAND_CAPACITY || isHeld(hand, impId)) {
    return false;
  }
  hand.slots[hand.count] = { kind: "held", impId };
  hand.count += 1;
  return true;
}

export function removeHeld(hand: Hand, impId: ImpId): boolean {
  for (let i = 0; i < hand.count; i += 1) {
    const slot = hand.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "held": {
        if (slot.impId !== impId) {
          break;
        }
        for (let j = i; j < hand.count - 1; j += 1) {
          const next = hand.slots[j + 1];
          if (next === undefined) {
            continue;
          }
          hand.slots[j] = next;
        }
        hand.count -= 1;
        hand.slots[hand.count] = EMPTY_HAND_SLOT;
        return true;
      }
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  return false;
}

function mix(h: number, v: number): number {
  return Math.imul(h ^ (v >>> 0), 16777619) >>> 0;
}

export function hashHand(hand: Hand): number {
  let h = 2166136261;
  h = mix(h, hand.count);
  for (let i = 0; i < hand.count; i += 1) {
    const slot = hand.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "held":
        h = mix(h, slot.impId);
        break;
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  return h >>> 0;
}

import {
  beginEating,
  beginHungry,
  beginSleeping,
  beginToBed,
  beginToFood,
  captureCreatureCurr,
  captureCreaturePrev,
  CREATURE_STEPS_PER_TILE,
  finishEating,
  setCreatureHeading,
  tryArrival,
  type Creature,
} from "./creatures";
import type { World } from "./worldCore";

export function stepCreatures(world: World): void {
  const slots = world.creatures.slots;
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live":
        stepLiveCreature(world, slot.creature);
        break;
      default: {
        const never: never = slot;
        throw never;
      }
    }
  }
  tryArrival(world);
}

function stepLiveCreature(world: World, creature: Creature): void {
  captureCreaturePrev(creature);
  const state = creature.state;
  switch (state.kind) {
    case "arriving":
      beginToBed(world, creature);
      break;
    case "toBed":
      if (advanceAlongPath(creature, state, world.width, 1)) {
        beginSleeping(creature);
      }
      break;
    case "sleeping":
      if (state.remaining > 0) {
        state.remaining -= 1;
        break;
      }
      beginHungry(creature);
      break;
    case "hungry":
      if (state.retry > 0) {
        state.retry -= 1;
        break;
      }
      beginToFood(world, creature);
      break;
    case "toFood":
      if (advanceAlongPath(creature, state, world.width, 1)) {
        beginEating(creature, state.chickenId);
      }
      break;
    case "eating":
      state.remaining -= 1;
      if (state.remaining <= 0) {
        finishEating(world, creature, state.chickenId);
      }
      break;
    default: {
      const never: never = state;
      throw never;
    }
  }
  captureCreatureCurr(creature);
}

function advanceAlongPath(
  creature: Creature,
  state: { pathStep: number; pathLength: number; progress: number },
  width: number,
  steps: number,
): boolean {
  if (state.pathLength <= 1) {
    return true;
  }
  for (let step = 0; step < steps; step += 1) {
    state.progress += 1;
    if (state.progress < CREATURE_STEPS_PER_TILE) {
      continue;
    }
    state.progress = 0;
    const nextIndex = state.pathStep + 1;
    const nextTile = creature.path[nextIndex];
    if (nextTile === undefined) {
      return true;
    }
    const ny = (nextTile / width) | 0;
    const nx = nextTile - ny * width;
    creature.tileX = nx;
    creature.tileY = ny;
    state.pathStep = nextIndex;
    if (state.pathStep + 1 >= state.pathLength) {
      return true;
    }
    setCreatureHeading(creature, width);
  }
  return false;
}

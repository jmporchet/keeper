import {
  beginSleeping,
  beginToBed,
  captureCreatureCurr,
  captureCreaturePrev,
  CREATURE_STEPS_PER_TILE,
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

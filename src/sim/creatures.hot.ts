import {
  beginEating,
  beginHungry,
  beginSleeping,
  beginToBed,
  beginToFood,
  beginToTraining,
  beginTraining,
  beginWander,
  captureCreatureCurr,
  captureCreaturePrev,
  CREATURE_MAX_LEVEL,
  CREATURE_STEPS_PER_TILE,
  finishEating,
  finishTraining,
  resumeSleeping,
  setCreatureHeading,
  tryArrival,
  WANDER_CHANCE,
  WANDER_PERIOD,
  WANDER_ROLL,
  type Creature,
} from "./creatures";
import { isPossessedCreature } from "./possession";
import { advanceRng } from "./rng";
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
        if (isPossessedCreature(world, slot.creature.id)) {
          stepPossessedCreature(slot.creature);
        } else {
          stepLiveCreature(world, slot.creature);
        }
        break;
      default: {
        const never: never = slot;
        throw never;
      }
    }
  }
  tryArrival(world);
}

function stepPossessedCreature(creature: Creature): void {
  captureCreaturePrev(creature);
  creature.currX = creature.tileX;
  creature.currZ = creature.tileY;
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
      if (creature.level < CREATURE_MAX_LEVEL && beginToTraining(world, creature)) {
        break;
      }
      if (state.remaining <= 0) {
        beginHungry(creature);
        break;
      }
      if (state.remaining % WANDER_PERIOD === 0 && wanderRoll(world) && beginWander(world, creature)) {
        break;
      }
      state.remaining -= 1;
      break;
    case "wandering":
      state.remaining -= 1;
      if (state.remaining <= 0) {
        beginHungry(creature);
        break;
      }
      if (advanceAlongPath(creature, state, world.width, 1)) {
        resumeSleeping(creature, state.remaining);
      }
      break;
    case "toTraining":
      if (advanceAlongPath(creature, state, world.width, 1)) {
        beginTraining(creature, state.tile);
      }
      break;
    case "training":
      state.remaining -= 1;
      if (state.remaining <= 0) {
        finishTraining(world, creature);
      }
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

function wanderRoll(world: World): boolean {
  advanceRng(world);
  return world.rng % WANDER_ROLL < WANDER_CHANCE;
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

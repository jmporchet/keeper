import {
  beginIdle,
  beginWorking,
  captureCurr,
  capturePrev,
  finishDig,
  goIdle,
  jobHeldOnTile,
  setHeading,
  STEPS_PER_TILE,
  type Imp,
  type ImpWorld,
} from "./imps";

export function stepImps(world: ImpWorld): void {
  const slots = world.imps.slots;
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live":
        stepLiveImp(world, slot.imp);
        break;
      default: {
        const never: never = slot;
        throw never;
      }
    }
  }
}

function stepLiveImp(world: ImpWorld, imp: Imp): void {
  capturePrev(imp);
  const state = imp.state;
  switch (state.kind) {
    case "idle":
      beginIdle(world, imp);
      break;
    case "wandering":
      if (advanceAlongPath(imp, state, world.width)) {
        goIdle(imp);
      }
      break;
    case "walking":
      if (!jobHeldOnTile(world, imp, state.tile)) {
        goIdle(imp);
        break;
      }
      if (advanceAlongPath(imp, state, world.width)) {
        beginWorking(imp, state.tile);
      }
      break;
    case "working":
      if (!jobHeldOnTile(world, imp, state.tile)) {
        goIdle(imp);
        break;
      }
      state.remaining -= 1;
      if (state.remaining <= 0) {
        finishDig(world, imp, state.tile);
      }
      break;
    default: {
      const never: never = state;
      throw never;
    }
  }
  captureCurr(imp);
}

function advanceAlongPath(
  imp: Imp,
  state: { pathStep: number; pathLength: number; progress: number },
  width: number,
): boolean {
  if (state.pathLength <= 1) {
    return true;
  }
  state.progress += 1;
  if (state.progress < STEPS_PER_TILE) {
    return false;
  }
  state.progress = 0;
  const nextIndex = state.pathStep + 1;
  const nextTile = imp.path[nextIndex];
  if (nextTile === undefined) {
    return true;
  }
  const ny = (nextTile / width) | 0;
  const nx = nextTile - ny * width;
  imp.tileX = nx;
  imp.tileY = ny;
  state.pathStep = nextIndex;
  if (state.pathStep + 1 >= state.pathLength) {
    return true;
  }
  setHeading(imp, width);
  return false;
}

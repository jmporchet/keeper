import {
  beginWander,
  captureCurr,
  capturePrev,
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
      beginWander(world, imp);
      break;
    case "wandering":
      advanceAlongPath(imp, state, world.width);
      break;
    case "walking":
      advanceAlongPath(imp, state, world.width);
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
  state: { kind: "wandering" | "walking"; pathStep: number; pathLength: number; progress: number },
  width: number,
): void {
  if (state.pathLength <= 1) {
    imp.state = imp.idle;
    imp.headingX = 0;
    imp.headingY = 0;
    return;
  }
  state.progress += 1;
  if (state.progress < STEPS_PER_TILE) {
    return;
  }
  state.progress = 0;
  const nextIndex = state.pathStep + 1;
  const nextTile = imp.path[nextIndex];
  if (nextTile === undefined) {
    imp.state = imp.idle;
    imp.headingX = 0;
    imp.headingY = 0;
    return;
  }
  const ny = (nextTile / width) | 0;
  const nx = nextTile - ny * width;
  imp.tileX = nx;
  imp.tileY = ny;
  state.pathStep = nextIndex;
  if (state.pathStep + 1 >= state.pathLength) {
    imp.state = imp.idle;
    imp.headingX = 0;
    imp.headingY = 0;
    return;
  }
  setHeading(imp, width);
}

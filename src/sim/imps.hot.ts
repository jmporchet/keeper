import {
  beginIdle,
  beginWorking,
  captureCurr,
  capturePrev,
  finishClaim,
  finishDelivery,
  finishDig,
  finishMine,
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
  const current = imp.state;
  if (current.kind === "held") {
    return;
  }
  capturePrev(imp);
  const boosted = imp.boost.kind === "boosted";
  const speed = boosted ? 2 : 1;
  const state = imp.state;
  switch (state.kind) {
    case "idle":
      beginIdle(world, imp);
      break;
    case "wandering":
      if (advanceAlongPath(imp, state, world.width, speed)) {
        beginIdle(world, imp);
      }
      break;
    case "walking":
      if (!jobHeldOnTile(world, imp, state.tile)) {
        goIdle(imp);
        break;
      }
      if (advanceAlongPath(imp, state, world.width, speed)) {
        beginWorking(world, imp, state.tile);
      }
      break;
    case "working":
      if (!jobHeldOnTile(world, imp, state.tile)) {
        goIdle(imp);
        break;
      }
      state.remaining -= speed;
      if (state.remaining <= 0) {
        switch (state.work) {
          case "dig":
            finishDig(world, imp, state.tile);
            break;
          case "claim":
            finishClaim(world, imp, state.tile);
            break;
          case "mine":
            finishMine(world, imp, state.tile);
            break;
          default: {
            const never: never = state.work;
            throw never;
          }
        }
      }
      break;
    case "delivering":
      if (advanceAlongPath(imp, state, world.width, speed)) {
        finishDelivery(world, imp);
      }
      break;
    case "held":
      break;
    default: {
      const never: never = state;
      throw never;
    }
  }
  tickBoost(imp);
  captureCurr(imp);
}

function tickBoost(imp: Imp): void {
  const boost = imp.boost;
  switch (boost.kind) {
    case "none":
      return;
    case "boosted":
      boost.remaining -= 1;
      if (boost.remaining <= 0) {
        imp.boost = imp.boostNone;
      }
      return;
    default: {
      const never: never = boost;
      throw never;
    }
  }
}

function advanceAlongPath(
  imp: Imp,
  state: { pathStep: number; pathLength: number; progress: number },
  width: number,
  steps: number,
): boolean {
  if (state.pathLength <= 1) {
    return true;
  }
  for (let step = 0; step < steps; step += 1) {
    state.progress += 1;
    if (state.progress < STEPS_PER_TILE) {
      continue;
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
  }
  return false;
}

import {
  addOccupancy,
  beginIdle,
  beginWander,
  beginWorking,
  BLOCK_TICKS,
  canEnterNextTile,
  captureCurr,
  capturePrev,
  finishClaim,
  finishDelivery,
  finishDig,
  finishMine,
  goIdle,
  impTileIndex,
  jobHeldOnTile,
  removeOccupancy,
  setHeading,
  STEPS_PER_TILE,
  type Imp,
  type ImpWorld,
  type MovingImpState,
} from "./imps";

export function stepImps(world: ImpWorld): void {
  world.walkableSaturated = world.imps.liveCount - world.imps.heldCount >= world.walkableTileCount;
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
      if (advanceAlongPath(world, imp, state, world.width, speed)) {
        beginIdle(world, imp);
      }
      break;
    case "walking":
      if (!jobHeldOnTile(world, imp, state.tile)) {
        goIdle(imp);
        break;
      }
      if (advanceAlongPath(world, imp, state, world.width, speed)) {
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
      if (advanceAlongPath(world, imp, state, world.width, speed)) {
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
  world: ImpWorld,
  imp: Imp,
  state: MovingImpState,
  width: number,
  steps: number,
): boolean {
  if (state.pathLength <= 1) {
    return true;
  }
  for (let step = 0; step < steps; step += 1) {
    if (state.progress < STEPS_PER_TILE) {
      state.progress += 1;
      if (state.progress < STEPS_PER_TILE) {
        continue;
      }
    }
    const nextIndex = state.pathStep + 1;
    if (nextIndex >= state.pathLength) {
      return true;
    }
    if (!canEnterNextTile(world, imp, state, nextIndex)) {
      state.progress = STEPS_PER_TILE;
      state.blockedTicks += 1;
      if (state.kind === "wandering" && state.blockedTicks > BLOCK_TICKS) {
        beginWander(world, imp);
      }
      return false;
    }
    const nextTile = imp.path[nextIndex];
    if (nextTile === undefined) {
      return true;
    }
    const ny = (nextTile / width) | 0;
    const nx = nextTile - ny * width;
    const current = impTileIndex(imp, width);
    removeOccupancy(world.imps, current);
    imp.tileX = nx;
    imp.tileY = ny;
    addOccupancy(world.imps, nextTile);
    state.pathStep = nextIndex;
    state.progress = 0;
    state.blockedTicks = 0;
    if (state.pathStep + 1 >= state.pathLength) {
      return true;
    }
    setHeading(imp, width);
  }
  return false;
}

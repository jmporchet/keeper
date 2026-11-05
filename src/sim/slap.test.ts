import { describe, expect, it } from "vitest";
import { asImpId, asTick, asTileIndex } from "./ids";
import { IMP_CAPACITY, SLAP_TICKS, STEPS_PER_TILE, workerOf, type Imp } from "./imps";
import { jobHeldBy } from "./jobs";
import {
  createWorld,
  hashWorld,
  MAP_WIDTH,
  run,
  sortCommands,
  step,
  type Command,
  type World,
} from "./world";

function liveImp(world: World, index: number): Imp {
  const slot = world.imps.slots[index];
  if (slot === undefined) {
    throw new Error("missing slot");
  }
  switch (slot.kind) {
    case "empty":
      throw new Error("empty slot");
    case "live":
      return slot.imp;
    default: {
      const never: never = slot;
      return never;
    }
  }
}

function applyNow(world: World, command: Command): void {
  world.commandCursor = 0;
  step(world, [command]);
}

function findWalkingHolder(world: World): Imp | undefined {
  for (let i = 0; i < world.imps.slots.length; i += 1) {
    const slot = world.imps.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live": {
        const imp = slot.imp;
        if (imp.state.kind === "walking" && jobHeldBy(world.jobs, workerOf(imp)) !== undefined) {
          return imp;
        }
        break;
      }
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  return undefined;
}

function advanceOf(imp: Imp): number {
  const state = imp.state;
  switch (state.kind) {
    case "idle":
    case "working":
    case "held":
      return 0;
    case "wandering":
    case "walking":
    case "delivering":
      return state.pathStep * STEPS_PER_TILE + state.progress;
    default: {
      const never: never = state;
      return never;
    }
  }
}

describe("slap", () => {
  it("boosts a live imp for SLAP_TICKS", () => {
    const world = run(1, [{ kind: "slap", tick: asTick(0), impId: asImpId(0) }], 1);
    const imp = liveImp(world, 0);
    expect(imp.boost.kind).toBe("boosted");
    if (imp.boost.kind !== "boosted") {
      throw new Error("imp was not boosted");
    }
    expect(imp.boost.remaining).toBe(SLAP_TICKS - 1);
  });

  it("expires the boost after SLAP_TICKS ticks", () => {
    const world = run(1, [{ kind: "slap", tick: asTick(0), impId: asImpId(0) }], 1);
    const imp = liveImp(world, 0);
    for (let t = 0; t < SLAP_TICKS - 2; t += 1) {
      step(world, []);
    }
    expect(imp.boost.kind).toBe("boosted");
    step(world, []);
    expect(imp.boost.kind).toBe("none");
  });

  it("refuses a slap on an empty slot", () => {
    const world = run(1, [{ kind: "slap", tick: asTick(0), impId: asImpId(IMP_CAPACITY - 1) }], 1);
    expect(world.imps.slots[IMP_CAPACITY - 1]?.kind).toBe("empty");
  });

  it("refuses a slap on a held imp", () => {
    const world = run(
      1,
      [
        { kind: "pickUp", tick: asTick(0), impId: asImpId(0) },
        { kind: "slap", tick: asTick(0), impId: asImpId(0) },
      ],
      1,
    );
    const imp = liveImp(world, 0);
    expect(imp.state.kind).toBe("held");
    expect(imp.boost.kind).toBe("none");
  });

  it("clears the boost when an imp is picked up", () => {
    const world = run(
      1,
      [
        { kind: "slap", tick: asTick(0), impId: asImpId(0) },
        { kind: "pickUp", tick: asTick(1), impId: asImpId(0) },
      ],
      2,
    );
    const imp = liveImp(world, 0);
    expect(imp.state.kind).toBe("held");
    expect(imp.boost.kind).toBe("none");
  });

  it("resets the timer instead of stacking it", () => {
    const world = run(1, [{ kind: "slap", tick: asTick(0), impId: asImpId(0) }], 1);
    const imp = liveImp(world, 0);
    for (let t = 0; t < 30; t += 1) {
      step(world, []);
    }
    applyNow(world, { kind: "slap", tick: asTick(world.tick), impId: imp.id });
    expect(imp.boost.kind).toBe("boosted");
    if (imp.boost.kind !== "boosted") {
      throw new Error("imp was not boosted");
    }
    expect(imp.boost.remaining).toBe(SLAP_TICKS - 1);
  });

  it("moves a boosted imp faster than an unboosted imp", () => {
    const commands: Command[] = [{ kind: "tag", tick: asTick(0), tile: asTileIndex(32 * MAP_WIDTH + 35) }];
    const sorted = sortCommands(commands);
    const probe = createWorld(1);
    let ticks = 0;
    let target: Imp | undefined;
    while (ticks < 300) {
      step(probe, sorted);
      ticks += 1;
      target = findWalkingHolder(probe);
      if (target !== undefined) {
        break;
      }
    }
    if (target === undefined) {
      throw new Error("no imp started walking");
    }
    const targetId = target.id;
    const boostedWorld = run(1, commands, ticks);
    const plainWorld = run(1, commands, ticks);
    const boostedImp = liveImp(boostedWorld, targetId);
    const plainImp = liveImp(plainWorld, targetId);
    expect(boostedImp.state.kind).toBe("walking");
    expect(plainImp.state.kind).toBe("walking");
    applyNow(boostedWorld, { kind: "slap", tick: asTick(boostedWorld.tick), impId: boostedImp.id });
    step(plainWorld, []);
    for (let t = 0; t < 4; t += 1) {
      step(boostedWorld, []);
      step(plainWorld, []);
    }
    expect(advanceOf(boostedImp)).toBeGreaterThan(advanceOf(plainImp));
  });

  it("includes the boost in the world hash", () => {
    const slapped = hashWorld(run(1, [{ kind: "slap", tick: asTick(0), impId: asImpId(0) }], 1));
    const plain = hashWorld(run(1, [], 1));
    expect(slapped).not.toBe(plain);
  });
});

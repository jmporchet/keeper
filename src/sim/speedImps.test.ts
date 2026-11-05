import { describe, expect, it } from "vitest";
import { EMPTY_IMP_SLOT } from "./heroes";
import { asTick, asTileIndex } from "./ids";
import { jobHeldBy } from "./jobs";
import { workerOf, type Imp } from "./imps";
import { parseSaveValue } from "./save";
import {
  SPEED_IMPS_COOLDOWN_TICKS,
  SPEED_IMPS_COST,
  SPEED_IMPS_DURATION_TICKS,
} from "./speedImps";
import {
  createWorld,
  hashWorld,
  MAP_WIDTH,
  sortCommands,
  step,
  type Command,
  type World,
} from "./world";

function clearImps(world: World): void {
  for (let i = 0; i < world.imps.slots.length; i += 1) {
    world.imps.slots[i] = EMPTY_IMP_SLOT;
  }
}

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

function cast(tick: number): Command {
  return { kind: "castSpeedImps", tick: asTick(tick) };
}

function stepCommands(world: World, commands: Command[]): void {
  world.commandCursor = 0;
  step(world, sortCommands(commands));
}

function totalGold(world: World): number {
  let total = world.goldStored + world.goldSpent + world.goldPaidOut;
  for (let i = 0; i < world.goldStock.length; i += 1) {
    const stock = world.goldStock[i];
    if (stock !== undefined) {
      total += stock;
    }
  }
  for (let i = 0; i < world.treasuryStock.length; i += 1) {
    const stock = world.treasuryStock[i];
    if (stock !== undefined) {
      total += stock;
    }
  }
  for (let i = 0; i < world.imps.slots.length; i += 1) {
    const slot = world.imps.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live":
        if (slot.imp.carry.kind === "gold") {
          total += slot.imp.carry.amount;
        }
        break;
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  return total;
}

function findWorkingHolder(world: World): Imp | undefined {
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
        if (imp.state.kind === "working" && jobHeldBy(world.jobs, workerOf(imp)) !== undefined) {
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

describe("spell speed imps", () => {
  it("refuses when gold is short and mutates nothing", () => {
    const world = createWorld(1);
    world.goldStored = SPEED_IMPS_COST - 1;
    stepCommands(world, [cast(0)]);
    expect(world.goldStored).toBe(SPEED_IMPS_COST - 1);
    expect(world.goldSpent).toBe(0);
    expect(world.speedImpsCooldown).toBe(0);
    for (let i = 0; i < world.imps.slots.length; i += 1) {
      const slot = world.imps.slots[i];
      if (slot !== undefined && slot.kind === "live") {
        expect(slot.imp.boost.kind).toBe("none");
      }
    }
  });

  it("refuses when no eligible imp exists", () => {
    const empty = createWorld(1);
    clearImps(empty);
    empty.goldStored = SPEED_IMPS_COST;
    stepCommands(empty, [cast(0)]);
    expect(empty.goldStored).toBe(SPEED_IMPS_COST);
    expect(empty.goldSpent).toBe(0);
    expect(empty.speedImpsCooldown).toBe(0);

    const held = createWorld(1);
    for (let i = 0; i < held.imps.slots.length; i += 1) {
      const slot = held.imps.slots[i];
      if (slot !== undefined && slot.kind === "live") {
        slot.imp.state = slot.imp.held;
      }
    }
    held.goldStored = SPEED_IMPS_COST;
    stepCommands(held, [cast(0)]);
    expect(held.goldStored).toBe(SPEED_IMPS_COST);
    expect(held.goldSpent).toBe(0);
    expect(held.speedImpsCooldown).toBe(0);
  });

  it("refuses after defeat and victory", () => {
    const defeated = createWorld(1);
    defeated.goldStored = SPEED_IMPS_COST;
    defeated.defeated = true;
    stepCommands(defeated, [cast(0)]);
    expect(defeated.goldSpent).toBe(0);
    expect(defeated.speedImpsCooldown).toBe(0);

    const victorious = createWorld(1);
    victorious.goldStored = SPEED_IMPS_COST;
    victorious.victorious = true;
    stepCommands(victorious, [cast(0)]);
    expect(victorious.goldSpent).toBe(0);
    expect(victorious.speedImpsCooldown).toBe(0);
  });

  it("boosts every live non-held imp once and blocks a second cast in the same tick", () => {
    const world = createWorld(1);
    world.goldStored = 1000;
    stepCommands(world, [cast(0), cast(0)]);
    expect(world.goldStored).toBe(1000 - SPEED_IMPS_COST);
    expect(world.goldSpent).toBe(SPEED_IMPS_COST);
    expect(world.speedImpsCooldown).toBe(SPEED_IMPS_COOLDOWN_TICKS - 1);
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
          expect(imp.boost.kind).toBe("boosted");
          if (imp.boost.kind === "boosted") {
            expect(imp.boost.remaining).toBe(SPEED_IMPS_DURATION_TICKS - 1);
          }
          break;
        }
        default: {
          const never: never = slot;
          return never;
        }
      }
    }
  });

  it("skips held imps and leaves empty slots untouched", () => {
    const world = createWorld(1);
    const heldImp = liveImp(world, 0);
    const live = liveImp(world, 1);
    heldImp.state = heldImp.held;
    world.imps.slots[2] = EMPTY_IMP_SLOT;
    world.imps.slots[3] = EMPTY_IMP_SLOT;
    world.goldStored = SPEED_IMPS_COST;
    stepCommands(world, [cast(0)]);
    expect(heldImp.boost.kind).toBe("none");
    expect(live.boost.kind).toBe("boosted");
    expect(world.imps.slots[2]?.kind).toBe("empty");
    expect(world.imps.slots[3]?.kind).toBe("empty");
    expect(world.goldSpent).toBe(SPEED_IMPS_COST);
    expect(world.speedImpsCooldown).toBe(SPEED_IMPS_COOLDOWN_TICKS - 1);
  });

  it("blocks a recast until the cooldown elapses and then allows it", () => {
    const world = createWorld(1);
    world.goldStored = 1000;
    stepCommands(world, [cast(0)]);
    expect(world.goldSpent).toBe(SPEED_IMPS_COST);
    expect(world.speedImpsCooldown).toBe(SPEED_IMPS_COOLDOWN_TICKS - 1);

    stepCommands(world, [cast(world.tick)]);
    expect(world.goldSpent).toBe(SPEED_IMPS_COST);
    expect(world.speedImpsCooldown).toBe(SPEED_IMPS_COOLDOWN_TICKS - 2);

    while (world.speedImpsCooldown > 0) {
      stepCommands(world, []);
    }
    expect(world.speedImpsCooldown).toBe(0);

    stepCommands(world, [cast(world.tick)]);
    expect(world.goldStored).toBe(1000 - SPEED_IMPS_COST * 2);
    expect(world.goldSpent).toBe(SPEED_IMPS_COST * 2);
    expect(world.speedImpsCooldown).toBe(SPEED_IMPS_COOLDOWN_TICKS - 1);
  });

  it("expires the buff after SPEED_IMPS_DURATION_TICKS", () => {
    const world = createWorld(1);
    world.goldStored = SPEED_IMPS_COST;
    stepCommands(world, [cast(0)]);
    const imp = liveImp(world, 0);
    expect(imp.boost.kind).toBe("boosted");
    for (let t = 0; t < SPEED_IMPS_DURATION_TICKS - 2; t += 1) {
      stepCommands(world, []);
    }
    expect(imp.boost.kind).toBe("boosted");
    stepCommands(world, []);
    expect(imp.boost.kind).toBe("none");
  });

  it("makes job timing reflect the boost", () => {
    const commands: Command[] = [{ kind: "tag", tick: asTick(0), tile: asTileIndex(32 * MAP_WIDTH + 35) }];
    const sorted = sortCommands(commands);
    const probe = createWorld(1);
    let ticks = 0;
    let target: Imp | undefined;
    while (ticks < 400) {
      step(probe, sorted);
      ticks += 1;
      target = findWorkingHolder(probe);
      if (target !== undefined) {
        break;
      }
    }
    if (target === undefined) {
      throw new Error("no imp started working");
    }
    const targetId = target.id;
    const boostedWorld = createWorld(1);
    const plainWorld = createWorld(1);
    for (let t = 0; t < ticks; t += 1) {
      step(boostedWorld, sorted);
      step(plainWorld, sorted);
    }
    const boostedImp = liveImp(boostedWorld, targetId);
    const plainImp = liveImp(plainWorld, targetId);
    if (boostedImp.state.kind !== "working" || plainImp.state.kind !== "working") {
      throw new Error("imp was not working in both worlds");
    }
    const before = boostedImp.state.remaining;
    boostedWorld.goldStored = SPEED_IMPS_COST;
    stepCommands(boostedWorld, [cast(boostedWorld.tick)]);
    stepCommands(plainWorld, []);
    if (boostedImp.state.kind !== "working" || plainImp.state.kind !== "working") {
      throw new Error("imp stopped working during the comparison");
    }
    expect(boostedImp.state.remaining).toBe(before - 2);
    expect(plainImp.state.remaining).toBe(before - 1);
  });

  it("conserves gold and records the cost as spent", () => {
    const world = createWorld(1);
    stepCommands(world, [{ kind: "addGold", tick: asTick(0), amount: 1000 }]);
    const before = totalGold(world);
    const storedBefore = world.goldStored;
    stepCommands(world, [cast(world.tick)]);
    expect(totalGold(world)).toBe(before);
    expect(world.goldStored).toBe(storedBefore - SPEED_IMPS_COST);
    expect(world.goldSpent).toBe(SPEED_IMPS_COST);
  });

  it("ticks the cooldown down by one each step and hashes it", () => {
    const world = createWorld(1);
    world.speedImpsCooldown = 3;
    stepCommands(world, []);
    expect(world.speedImpsCooldown).toBe(2);
    stepCommands(world, []);
    expect(world.speedImpsCooldown).toBe(1);
    stepCommands(world, []);
    expect(world.speedImpsCooldown).toBe(0);
    stepCommands(world, []);
    expect(world.speedImpsCooldown).toBe(0);

    const base = createWorld(7);
    const cooling = createWorld(7);
    cooling.speedImpsCooldown = 1;
    expect(hashWorld(base)).not.toBe(hashWorld(cooling));
  });

  it("round-trips castSpeedImps through save parsing", () => {
    expect(
      parseSaveValue({
        version: 1,
        seed: 1,
        tick: 0,
        commands: [{ kind: "castSpeedImps", tick: 4 }],
      }),
    ).toEqual({
      ok: true,
      save: { version: 1, seed: 1, tick: 0, commands: [{ kind: "castSpeedImps", tick: 4 }] },
    });
  });

  it("refreshes the boost timer instead of stacking it", () => {
    const world = createWorld(1);
    world.goldStored = 1000;
    stepCommands(world, [cast(0)]);
    const imp = liveImp(world, 0);
    for (let t = 0; t < SPEED_IMPS_COOLDOWN_TICKS - 1; t += 1) {
      stepCommands(world, []);
    }
    expect(world.speedImpsCooldown).toBe(0);
    if (imp.boost.kind !== "boosted") {
      throw new Error("imp lost its boost before the refresh");
    }
    expect(imp.boost.remaining).toBe(SPEED_IMPS_DURATION_TICKS - SPEED_IMPS_COOLDOWN_TICKS);
    stepCommands(world, [cast(world.tick)]);
    expect(imp.boost.kind).toBe("boosted");
    if (imp.boost.kind === "boosted") {
      expect(imp.boost.remaining).toBe(SPEED_IMPS_DURATION_TICKS - 1);
    }
  });
});

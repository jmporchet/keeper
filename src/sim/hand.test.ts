import { describe, expect, it } from "vitest";
import { isHeld } from "./hand";
import { asImpId, asTick, asTileIndex } from "./ids";
import { createImp, STARTING_IMP_COUNT, workerOf, type Imp } from "./imps";
import { jobAtTile, jobHeldBy } from "./jobs";
import { sortCommands, createWorld, hashWorld, MAP_WIDTH, run, step, type Command, type World } from "./world";

const TICKS = 10_000;

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
  step(world, sortCommands([command]));
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

function findCarrying(world: World): Imp | undefined {
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
          return slot.imp;
        }
        break;
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  return undefined;
}

function runUntilJob(world: World): Imp {
  for (let t = 0; t < 300; t += 1) {
    for (let i = 0; i < world.imps.slots.length; i += 1) {
      const slot = world.imps.slots[i];
      if (slot === undefined) {
        continue;
      }
      switch (slot.kind) {
        case "empty":
          break;
        case "live":
          if (jobHeldBy(world.jobs, workerOf(slot.imp)) !== undefined) {
            return slot.imp;
          }
          break;
        default: {
          const never: never = slot;
          return never;
        }
      }
    }
    step(world, sortCommands([]));
  }
  throw new Error("imp did not reserve a job");
}

describe("hand of evil", () => {
  it("picks up an imp, releases its job and takes it off the grid", () => {
    const tile = asTileIndex(32 * MAP_WIDTH + 35);
    const world = run(1, sortCommands([{ kind: "tag", tick: asTick(0), tile }]), 1);
    const imp = runUntilJob(world);
    const job = jobHeldBy(world.jobs, workerOf(imp));
    expect(job?.lifecycle.kind).toBe("reserved");
    for (let i = 0; i < world.imps.slots.length; i += 1) {
      if (i !== imp.id) {
        world.imps.slots[i] = { kind: "empty" };
      }
    }
    const tileX = imp.tileX;
    const tileY = imp.tileY;
    applyNow(world, { kind: "pickUp", tick: asTick(world.tick), impId: imp.id });
    expect(imp.state.kind).toBe("held");
    expect(world.hand.count).toBe(1);
    expect(isHeld(world.hand, imp.id)).toBe(true);
    expect(jobHeldBy(world.jobs, workerOf(imp))).toBeUndefined();
    expect(jobAtTile(world.jobs, tile)?.lifecycle.kind).toBe("open");
    expect(imp.tileX).toBe(tileX);
    expect(imp.tileY).toBe(tileY);
  });

  it("refuses a drop onto rock and keeps the imp held", () => {
    const world = run(1, sortCommands([{ kind: "pickUp", tick: asTick(0), impId: asImpId(0) }]), 1);
    const imp = liveImp(world, 0);
    const tileX = imp.tileX;
    const tileY = imp.tileY;
    applyNow(world, { kind: "drop", tick: asTick(world.tick), impId: imp.id, tileX: 1, tileY: 1 });
    expect(imp.state.kind).toBe("held");
    expect(world.hand.count).toBe(1);
    expect(isHeld(world.hand, imp.id)).toBe(true);
    expect(imp.tileX).toBe(tileX);
    expect(imp.tileY).toBe(tileY);
  });

  it("refuses pick up beyond eight held imps", () => {
    const world = createWorld(1);
    for (let i = STARTING_IMP_COUNT; i < 9; i += 1) {
      world.imps.slots[i] = { kind: "live", imp: createImp(i, 33, 33) };
    }
    const commands: Command[] = [];
    for (let i = 0; i < 9; i += 1) {
      commands.push({ kind: "pickUp", tick: asTick(0), impId: asImpId(i) });
    }
    world.commandCursor = 0;
    step(world, sortCommands(commands));
    expect(world.hand.count).toBe(8);
    for (let i = 0; i < 8; i += 1) {
      expect(isHeld(world.hand, asImpId(i))).toBe(true);
    }
    expect(isHeld(world.hand, asImpId(8))).toBe(false);
    expect(liveImp(world, 8).state.kind).not.toBe("held");
  });

  it("skips held imps in the tick loop", () => {
    const world = run(1, sortCommands([{ kind: "pickUp", tick: asTick(0), impId: asImpId(0) }]), 1);
    const imp = liveImp(world, 0);
    const tileX = imp.tileX;
    const tileY = imp.tileY;
    for (let t = 0; t < 100; t += 1) {
      step(world, sortCommands([]));
    }
    expect(imp.state.kind).toBe("held");
    expect(imp.tileX).toBe(tileX);
    expect(imp.tileY).toBe(tileY);
    expect(world.hand.count).toBe(1);
    expect(jobHeldBy(world.jobs, workerOf(imp))).toBeUndefined();
  });

  it("drops a held imp onto a walkable tile", () => {
    const world = run(1, sortCommands([{ kind: "pickUp", tick: asTick(0), impId: asImpId(0) }]), 1);
    const imp = liveImp(world, 0);
    applyNow(world, { kind: "drop", tick: asTick(world.tick), impId: imp.id, tileX: 33, tileY: 33 });
    expect(world.hand.count).toBe(0);
    expect(isHeld(world.hand, imp.id)).toBe(false);
    expect(imp.state.kind).not.toBe("held");
    expect(imp.tileX).toBe(33);
    expect(imp.tileY).toBe(33);
  });

  it("keeps gold conserved when picking up a carrying imp", () => {
    const commands: Command[] = [];
    for (let x = 35; x <= 39; x += 1) {
      commands.push({ kind: "tag", tick: asTick(0), tile: asTileIndex(32 * MAP_WIDTH + x) });
    }
    const world = run(1, sortCommands(commands), 1);
    let carrier: Imp | undefined;
    for (let t = 0; t < 3000; t += 1) {
      step(world, sortCommands([]));
      carrier = findCarrying(world);
      if (carrier !== undefined) {
        break;
      }
    }
    expect(carrier).toBeDefined();
    if (carrier === undefined) {
      throw new Error("carrier missing");
    }
    const before = totalGold(world);
    const carried = carrier.carry.kind === "gold" ? carrier.carry.amount : 0;
    expect(carried).toBeGreaterThan(0);
    applyNow(world, { kind: "pickUp", tick: asTick(world.tick), impId: carrier.id });
    expect(carrier.state.kind).toBe("held");
    expect(carrier.carry.kind).toBe("gold");
    if (carrier.carry.kind === "gold") {
      expect(carrier.carry.amount).toBe(carried);
    }
    expect(totalGold(world)).toBe(before);
    applyNow(world, { kind: "drop", tick: asTick(world.tick), impId: carrier.id, tileX: 33, tileY: 33 });
    expect(carrier.state.kind).not.toBe("held");
    expect(carrier.carry.kind).toBe("gold");
    expect(totalGold(world)).toBe(before);
  });

  it("keeps determinism with a pickup and a drop", () => {
    const commands: Command[] = [
      { kind: "pickUp", tick: asTick(0), impId: asImpId(0) },
      { kind: "drop", tick: asTick(1), impId: asImpId(0), tileX: 33, tileY: 33 },
    ];
    const a = hashWorld(run(7, sortCommands(commands), TICKS));
    const b = hashWorld(run(7, sortCommands(commands), TICKS));
    expect(a).toBe(b);
    expect(a).not.toBe(hashWorld(run(7, sortCommands([]), TICKS)));
  });
});

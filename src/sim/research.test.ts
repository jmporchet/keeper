import { describe, expect, it } from "vitest";
import {
  ARRIVE_TICKS,
  CREATURE_CAPACITY,
  CREATURE_HP,
  LIBRARY_TRAIN_TICKS,
  WARLOCK_HP,
  liveCreatureCount,
  type Creature,
  type CreatureKind,
} from "./creatures";
import { asTick, asTileIndex, type TileIndex } from "./ids";
import {
  createWorld,
  hashWorld,
  LIBRARY_COST,
  MAP_WIDTH,
  ROOM_KIND,
  run,
  sortCommands,
  step,
  TRAINING_COST,
  type Command,
} from "./world";

const LAIR_A = asTileIndex(30 * MAP_WIDTH + 30);
const LIBRARY_TILE = asTileIndex(30 * MAP_WIDTH + 32);
const TRAINING_TILE = asTileIndex(30 * MAP_WIDTH + 33);

function addGold(tick: number, amount: number): Command {
  return { kind: "addGold", tick: asTick(tick), amount };
}

function paint(tick: number, tile: TileIndex, room: "lair" | "training" | "library"): Command {
  return { kind: "paintRoom", tick: asTick(tick), tile, room };
}

function claimedBeds(count: number): TileIndex[] {
  const beds: TileIndex[] = [];
  for (let y = 30; y <= 34 && beds.length < count; y += 1) {
    for (let x = 30; x <= 34 && beds.length < count; x += 1) {
      beds.push(asTileIndex(y * MAP_WIDTH + x));
    }
  }
  return beds;
}

function lairSetup(count: number): Command[] {
  const beds = claimedBeds(count);
  const commands: Command[] = [addGold(0, 1000)];
  for (let i = 0; i < beds.length; i += 1) {
    const bed = beds[i];
    if (bed === undefined) {
      continue;
    }
    commands.push(paint(0, bed, "lair"));
  }
  return commands;
}

function creatures(world: ReturnType<typeof createWorld>): Creature[] {
  const result: Creature[] = [];
  for (let i = 0; i < world.creatures.slots.length; i += 1) {
    const slot = world.creatures.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live":
        result.push(slot.creature);
        break;
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  return result;
}

describe("library research gate", () => {
  it("never arrives as a warlock before research is done", () => {
    const world = createWorld(1);
    const commands = sortCommands(lairSetup(CREATURE_CAPACITY));
    const seen = new Set<CreatureKind>();
    for (let t = 0; t < ARRIVE_TICKS * (CREATURE_CAPACITY + 1); t += 1) {
      step(world, commands);
      for (const creature of creatures(world)) {
        seen.add(creature.kind);
      }
    }
    expect(world.researchDone).toBe(false);
    expect(liveCreatureCount(world.creatures)).toBeGreaterThan(0);
    expect(seen.has("fly")).toBe(true);
    expect(seen.has("beetle")).toBe(true);
    expect(seen.has("warlock")).toBe(false);
  });

  it("sets researchDone when library-boosted training completes and hashes it", () => {
    const world = createWorld(1);
    const commands = sortCommands([
      addGold(0, 1000),
      paint(0, LAIR_A, "lair"),
      paint(0, TRAINING_TILE, "training"),
      paint(0, LIBRARY_TILE, "library"),
    ]);
    let trainingStart = -1;
    let finished = false;
    for (let t = 0; t < 900 && !finished; t += 1) {
      step(world, commands);
      const creature = creatures(world)[0];
      if (creature === undefined) {
        continue;
      }
      if (creature.state.kind === "training" && trainingStart < 0) {
        trainingStart = world.tick;
      }
      if (trainingStart >= 0 && creature.level >= 1) {
        finished = true;
      }
    }
    expect(finished).toBe(true);
    expect(world.researchDone).toBe(true);
    expect(world.rooms[LIBRARY_TILE]).toBe(ROOM_KIND.library);
    expect(world.goldSpent).toBe(30 + TRAINING_COST + LIBRARY_COST);
    const before = hashWorld(world);
    world.researchDone = false;
    expect(hashWorld(world)).not.toBe(before);
    world.researchDone = true;
    expect(hashWorld(world)).toBe(before);
    expect(trainingStart).toBeGreaterThanOrEqual(0);
    expect(world.tick - trainingStart).toBeGreaterThanOrEqual(LIBRARY_TRAIN_TICKS);
  });

  it("picks a warlock from the seeded roll after research and hashes its kind", () => {
    const world = createWorld(1);
    world.researchDone = true;
    const commands = sortCommands(lairSetup(CREATURE_CAPACITY));
    let warlock: Creature | undefined;
    for (let t = 0; t < ARRIVE_TICKS * (CREATURE_CAPACITY + 1) && warlock === undefined; t += 1) {
      step(world, commands);
      warlock = creatures(world).find((creature) => creature.kind === "warlock");
    }
    expect(warlock).toBeDefined();
    if (warlock === undefined) {
      throw new Error("missing warlock");
    }
    expect(warlock.hp).toBe(WARLOCK_HP);
    const before = hashWorld(world);
    warlock.kind = "fly";
    warlock.hp = CREATURE_HP;
    warlock.maxHp = CREATURE_HP;
    expect(hashWorld(world)).not.toBe(before);
  });

  it("clears researchDone on a fresh world", () => {
    const world = run(1, sortCommands(lairSetup(CREATURE_CAPACITY)), 1);
    world.researchDone = true;
    const fresh = createWorld(1);
    expect(fresh.researchDone).toBe(false);
    expect(hashWorld(fresh)).not.toBe(hashWorld(world));
  });
});

import { describe, expect, it } from "vitest";
import {
  ARRIVE_TICKS,
  CREATURE_CAPACITY,
  CREATURE_MAX_LEVEL,
  TROLL_HP,
  WARLOCK_HP,
  createCreature,
  liveCreatureCount,
  type Creature,
  type CreatureKind,
} from "./creatures";
import { asTick, asTileIndex, type TileIndex } from "./ids";
import {
  createWorld,
  hashWorld,
  MAP_WIDTH,
  step,
  sortCommands,
  type Command,
  type World,
} from "./world";

const LAIR_A = asTileIndex(30 * MAP_WIDTH + 30);
const WORKSHOP_A = asTileIndex(31 * MAP_WIDTH + 31);
const TRAIN_A = asTileIndex(33 * MAP_WIDTH + 30);

function addGold(tick: number, amount: number): Command {
  return { kind: "addGold", tick: asTick(tick), amount };
}

function paint(tick: number, tile: TileIndex, room: "lair" | "workshop" | "training"): Command {
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

function creatures(world: World): Creature[] {
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

function liveCreature(world: World, index: number): Creature {
  const slot = world.creatures.slots[index];
  if (slot === undefined) {
    throw new Error("missing slot");
  }
  switch (slot.kind) {
    case "empty":
      throw new Error("empty slot");
    case "live":
      return slot.creature;
    default: {
      const never: never = slot;
      return never;
    }
  }
}

function clearImps(world: World): void {
  for (let i = 0; i < world.imps.slots.length; i += 1) {
    world.imps.slots[i] = { kind: "empty" };
  }
}

function arrivalFor(researchDone: boolean, workshop: boolean, roll: number): CreatureKind {
  const world = createWorld(1);
  const commands: Command[] = [addGold(0, 1000), paint(0, LAIR_A, "lair")];
  if (workshop) {
    commands.push(paint(0, WORKSHOP_A, "workshop"));
  }
  const sorted = sortCommands(commands);
  for (let t = 0; t < ARRIVE_TICKS; t += 1) {
    step(world, sorted);
  }
  world.researchDone = researchDone;
  clearImps(world);
  world.rng = roll;
  step(world, sorted);
  return liveCreature(world, 0).kind;
}

describe("troll portal gate", () => {
  it("never arrives as a troll without a workshop", () => {
    const world = createWorld(1);
    const commands = sortCommands(lairSetup(CREATURE_CAPACITY));
    for (let t = 0; t < ARRIVE_TICKS * 6; t += 1) {
      step(world, commands);
      for (const creature of creatures(world)) {
        expect(creature.kind).not.toBe("troll");
      }
    }
    expect(liveCreatureCount(world.creatures)).toBeGreaterThan(0);
  });

  it("gates the seeded roll by research and workshop", () => {
    expect(arrivalFor(false, false, 0)).toBe("fly");
    expect(arrivalFor(false, false, 1)).toBe("beetle");
    expect(arrivalFor(true, false, 2)).toBe("warlock");
    expect(arrivalFor(true, false, 3)).toBe("fly");
    expect(arrivalFor(false, true, 2)).toBe("troll");
    expect(arrivalFor(false, true, 3)).toBe("fly");
    expect(arrivalFor(true, true, 2)).toBe("warlock");
    expect(arrivalFor(true, true, 3)).toBe("troll");
  });

  it("picks a troll from the seeded roll when a workshop is present and hashes its kind", () => {
    const world = createWorld(1);
    const commands = sortCommands([addGold(0, 1000), paint(0, LAIR_A, "lair"), paint(0, WORKSHOP_A, "workshop")]);
    for (let t = 0; t < ARRIVE_TICKS; t += 1) {
      step(world, commands);
    }
    clearImps(world);
    world.rng = 2;
    step(world, commands);
    const creature = liveCreature(world, 0);
    expect(creature.kind).toBe("troll");
    expect(creature.hp).toBe(TROLL_HP);
    expect(creature.maxHp).toBe(TROLL_HP);
    const before = hashWorld(world);
    creature.kind = "warlock";
    creature.hp = WARLOCK_HP;
    creature.maxHp = WARLOCK_HP;
    expect(hashWorld(world)).not.toBe(before);
  });

  it("trains a troll through the shared creature lifecycle and keeps its bed", () => {
    const world = createWorld(1);
    const commands = sortCommands([addGold(0, 1000), paint(0, LAIR_A, "lair"), paint(0, TRAIN_A, "training")]);
    const creature = createCreature(0, 30, 30, LAIR_A, "troll");
    world.creatures.slots[0] = { kind: "live", creature };
    let sawTraining = false;
    let sawLevel = false;
    let returned = false;
    for (let t = 0; t < 800; t += 1) {
      step(world, commands);
      if (creature.state.kind === "training") {
        sawTraining = true;
      }
      if (creature.level >= CREATURE_MAX_LEVEL) {
        sawLevel = true;
        if (creature.state.kind === "toBed" || creature.state.kind === "sleeping") {
          returned = true;
        }
      }
      if (returned) {
        break;
      }
    }
    expect(sawTraining).toBe(true);
    expect(sawLevel).toBe(true);
    expect(returned).toBe(true);
    expect(creature.bedTile).toBe(LAIR_A);
    expect(creature.hp).toBe(TROLL_HP + 1);
    expect(liveCreatureCount(world.creatures)).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { createCreature, type Creature } from "./creatures";
import { asCreatureId, asTick, asTileIndex } from "./ids";
import { HEAL_AMOUNT, HEAL_COOLDOWN_TICKS, HEAL_COST } from "./heal";
import { EMPTY_IMP_SLOT } from "./heroes";
import { parseSaveValue } from "./save";
import {
  createWorld,
  hashWorld,
  sortCommands,
  step,
  type Command,
  type World,
} from "./world";

function addCreature(world: World, index: number, kind: "fly" | "beetle"): Creature {
  const creature = createCreature(index, 31, 31, asTileIndex(31 * world.width + 31), kind);
  world.creatures.slots[index] = { kind: "live", creature };
  return creature;
}

function clearImps(world: World): void {
  for (let i = 0; i < world.imps.slots.length; i += 1) {
    world.imps.slots[i] = EMPTY_IMP_SLOT;
  }
}

function cast(tick: number, creatureId: number): Command {
  return { kind: "castHeal", tick: asTick(tick), creatureId: asCreatureId(creatureId) };
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

describe("spell heal", () => {
  it("refuses when gold is short and mutates nothing", () => {
    const world = createWorld(1);
    clearImps(world);
    const creature = addCreature(world, 0, "fly");
    creature.hp = 1;
    world.goldStored = HEAL_COST - 1;
    const hp = creature.hp;
    stepCommands(world, [cast(0, creature.id)]);
    expect(creature.hp).toBe(hp);
    expect(world.goldStored).toBe(HEAL_COST - 1);
    expect(world.goldSpent).toBe(0);
    expect(world.healCooldown).toBe(0);
  });

  it("refuses an empty creature slot", () => {
    const world = createWorld(1);
    world.goldStored = HEAL_COST;
    stepCommands(world, [cast(0, 3)]);
    expect(world.goldStored).toBe(HEAL_COST);
    expect(world.goldSpent).toBe(0);
    expect(world.healCooldown).toBe(0);
  });

  it("refuses after defeat and victory", () => {
    const defeated = createWorld(1);
    clearImps(defeated);
    const defeatedCreature = addCreature(defeated, 0, "fly");
    defeatedCreature.hp = 1;
    defeated.goldStored = HEAL_COST;
    defeated.defeated = true;
    stepCommands(defeated, [cast(0, defeatedCreature.id)]);
    expect(defeatedCreature.hp).toBe(1);
    expect(defeated.goldSpent).toBe(0);
    expect(defeated.healCooldown).toBe(0);

    const victorious = createWorld(1);
    clearImps(victorious);
    const victoriousCreature = addCreature(victorious, 0, "fly");
    victoriousCreature.hp = 1;
    victorious.goldStored = HEAL_COST;
    victorious.victorious = true;
    stepCommands(victorious, [cast(0, victoriousCreature.id)]);
    expect(victoriousCreature.hp).toBe(1);
    expect(victorious.goldSpent).toBe(0);
    expect(victorious.healCooldown).toBe(0);
  });

  it("heals once and blocks a second cast in the same tick", () => {
    const world = createWorld(1);
    clearImps(world);
    const creature = addCreature(world, 0, "fly");
    creature.hp = 1;
    world.goldStored = 1000;
    stepCommands(world, [cast(0, creature.id), cast(0, creature.id)]);
    expect(creature.hp).toBe(3);
    expect(world.goldStored).toBe(1000 - HEAL_COST);
    expect(world.goldSpent).toBe(HEAL_COST);
    expect(world.healCooldown).toBe(HEAL_COOLDOWN_TICKS - 1);
  });

  it("blocks a recast until the cooldown elapses and then allows it", () => {
    const world = createWorld(1);
    clearImps(world);
    const creature = addCreature(world, 0, "beetle");
    creature.hp = 1;
    world.goldStored = 1000;
    stepCommands(world, [cast(0, creature.id)]);
    expect(creature.hp).toBe(1 + HEAL_AMOUNT);
    expect(world.healCooldown).toBe(HEAL_COOLDOWN_TICKS - 1);

    stepCommands(world, [cast(world.tick, creature.id)]);
    expect(creature.hp).toBe(1 + HEAL_AMOUNT);
    expect(world.goldSpent).toBe(HEAL_COST);
    expect(world.healCooldown).toBe(HEAL_COOLDOWN_TICKS - 2);

    while (world.healCooldown > 0) {
      stepCommands(world, []);
    }
    expect(world.healCooldown).toBe(0);

    stepCommands(world, [cast(world.tick, creature.id)]);
    expect(creature.hp).toBe(1 + HEAL_AMOUNT * 2);
    expect(world.goldStored).toBe(1000 - HEAL_COST * 2);
    expect(world.goldSpent).toBe(HEAL_COST * 2);
    expect(world.healCooldown).toBe(HEAL_COOLDOWN_TICKS - 1);
  });

  it("caps healing at maxHp", () => {
    const world = createWorld(1);
    clearImps(world);
    const creature = addCreature(world, 0, "fly");
    creature.hp = creature.maxHp - 1;
    world.goldStored = HEAL_COST;
    stepCommands(world, [cast(0, creature.id)]);
    expect(creature.hp).toBe(Math.min(creature.maxHp - 1 + HEAL_AMOUNT, creature.maxHp));
    expect(creature.hp).toBe(creature.maxHp);
    expect(world.goldSpent).toBe(HEAL_COST);
    expect(world.healCooldown).toBe(HEAL_COOLDOWN_TICKS - 1);
  });

  it("conserves gold and records the cost as spent", () => {
    const world = createWorld(1);
    clearImps(world);
    const creature = addCreature(world, 0, "fly");
    creature.hp = 1;
    stepCommands(world, [{ kind: "addGold", tick: asTick(0), amount: 1000 }]);
    const before = totalGold(world);
    const storedBefore = world.goldStored;
    stepCommands(world, [cast(world.tick, creature.id)]);
    expect(totalGold(world)).toBe(before);
    expect(world.goldStored).toBe(storedBefore - HEAL_COST);
    expect(world.goldSpent).toBe(HEAL_COST);
  });

  it("ticks the cooldown down by one each step and hashes it", () => {
    const world = createWorld(1);
    world.healCooldown = 3;
    stepCommands(world, []);
    expect(world.healCooldown).toBe(2);
    stepCommands(world, []);
    expect(world.healCooldown).toBe(1);
    stepCommands(world, []);
    expect(world.healCooldown).toBe(0);
    stepCommands(world, []);
    expect(world.healCooldown).toBe(0);

    const base = createWorld(7);
    const cooling = createWorld(7);
    cooling.healCooldown = 1;
    expect(hashWorld(base)).not.toBe(hashWorld(cooling));
  });

  it("round-trips castHeal through save parsing", () => {
    expect(
      parseSaveValue({
        version: 1,
        seed: 1,
        tick: 0,
        commands: [{ kind: "castHeal", tick: 4, creatureId: 2 }],
      }),
    ).toEqual({
      ok: true,
      save: { version: 1, seed: 1, tick: 0, commands: [{ kind: "castHeal", tick: 4, creatureId: 2 }] },
    });
  });
});

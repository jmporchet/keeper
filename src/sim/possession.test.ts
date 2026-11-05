import { describe, expect, it } from "vitest";
import { ARRIVE_TICKS, freeBedTiles, liveCreatureCount, type Creature } from "./creatures";
import { FIGHT_TICKS, HERO_ARRIVE_TICKS, type Hero } from "./heroes";
import { asCreatureId, asTick, asTileIndex, type CreatureId, type TileIndex } from "./ids";
import {
  applyPossess,
  findCreature,
  hashPossession,
  noPossession,
  type Possession,
} from "./possession";
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

function addGold(tick: number, amount: number): Command {
  return { kind: "addGold", tick: asTick(tick), amount };
}

function paintLair(tick: number, tile: TileIndex): Command {
  return { kind: "paintRoom", tick: asTick(tick), tile, room: "lair" };
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
    commands.push(paintLair(0, bed));
  }
  return commands;
}

function stepWith(world: World, commands: Command[]): void {
  world.commandCursor = 0;
  step(world, sortCommands(commands));
}

function liveCreature(world: World, id: CreatureId): Creature {
  const creature = findCreature(world, id);
  if (creature === undefined) {
    throw new Error("missing live creature");
  }
  return creature;
}

function liveHero(world: World, index: number): Hero {
  const slot = world.heroes.slots[index];
  if (slot === undefined) {
    throw new Error("missing hero slot");
  }
  switch (slot.kind) {
    case "empty":
      throw new Error("empty hero slot");
    case "live":
      return slot.hero;
    default: {
      const never: never = slot;
      return never;
    }
  }
}

function creaturesSleeping(world: World, count: number): boolean {
  if (liveCreatureCount(world.creatures) !== count) {
    return false;
  }
  for (let i = 0; i < world.creatures.slots.length; i += 1) {
    const slot = world.creatures.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "live":
        if (slot.creature.state.kind !== "sleeping") {
          return false;
        }
        break;
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  return true;
}

function setupSleepingCreatures(count: number): World {
  const world = createWorld(1);
  const setup = sortCommands(lairSetup(count));
  for (let i = 0; i < 600; i += 1) {
    step(world, setup);
    if (creaturesSleeping(world, count)) {
      break;
    }
  }
  return world;
}

describe("possession commands", () => {
  it("possesses a live creature and releases it", () => {
    const world = createWorld(1);
    const setup = sortCommands(lairSetup(1));
    for (let i = 0; i < ARRIVE_TICKS + 1; i += 1) {
      step(world, setup);
    }
    const creature = liveCreature(world, asCreatureId(0));
    stepWith(world, [{ kind: "possess", tick: world.tick, creatureId: creature.id }]);
    expect(world.possession).toEqual({ kind: "creature", id: creature.id });
    stepWith(world, [{ kind: "releasePossess", tick: world.tick }]);
    expect(world.possession).toEqual({ kind: "none" });
  });

  it("refuses possess when the creature is not live", () => {
    const world = createWorld(1);
    stepWith(world, [{ kind: "possess", tick: world.tick, creatureId: asCreatureId(0) }]);
    expect(world.possession).toEqual({ kind: "none" });
    stepWith(world, [{ kind: "possess", tick: world.tick, creatureId: asCreatureId(7) }]);
    expect(world.possession).toEqual({ kind: "none" });
  });

  it("moves only the possessed creature and refuses a non-possessed id", () => {
    const world = setupSleepingCreatures(2);
    const first = liveCreature(world, asCreatureId(0));
    const second = liveCreature(world, asCreatureId(1));
    expect(first.bedTile).toBe(asTileIndex(30 * MAP_WIDTH + 30));
    expect(second.bedTile).toBe(asTileIndex(30 * MAP_WIDTH + 31));
    const firstX = first.bedTile % MAP_WIDTH;
    const firstY = (first.bedTile / MAP_WIDTH) | 0;
    first.tileX = firstX;
    first.tileY = firstY;
    const secondX = second.tileX;
    const secondY = second.tileY;
    stepWith(world, [
      { kind: "possess", tick: world.tick, creatureId: first.id },
      { kind: "possessMove", tick: world.tick, creatureId: second.id, dx: 1, dy: 0 },
      { kind: "possessMove", tick: world.tick, creatureId: first.id, dx: 1, dy: 0 },
    ]);
    expect(world.possession).toEqual({ kind: "creature", id: first.id });
    expect(first.tileX).toBe(firstX + 1);
    expect(first.tileY).toBe(firstY);
    expect(second.tileX).toBe(secondX);
    expect(second.tileY).toBe(secondY);
  });

  it("refuses diagonal, non-walkable and rock destinations", () => {
    const world = setupSleepingCreatures(1);
    const creature = liveCreature(world, asCreatureId(0));
    stepWith(world, [{ kind: "possess", tick: world.tick, creatureId: creature.id }]);
    const startX = creature.tileX;
    const startY = creature.tileY;
    stepWith(world, [{ kind: "possessMove", tick: world.tick, creatureId: creature.id, dx: 1, dy: 1 }]);
    expect(creature.tileX).toBe(startX);
    expect(creature.tileY).toBe(startY);
    creature.tileX = 2;
    creature.tileY = 2;
    stepWith(world, [{ kind: "possessMove", tick: world.tick, creatureId: creature.id, dx: -1, dy: 0 }]);
    expect(creature.tileX).toBe(2);
    expect(creature.tileY).toBe(2);
    creature.tileY = 3;
    stepWith(world, [{ kind: "possessMove", tick: world.tick, creatureId: creature.id, dx: 0, dy: 1 }]);
    expect(creature.tileX).toBe(2);
    expect(creature.tileY).toBe(3);
  });

  it("auto-clears possession when the possessed creature dies", () => {
    const world = run(1, sortCommands(lairSetup(1)), HERO_ARRIVE_TICKS + 1);
    const creature = liveCreature(world, asCreatureId(0));
    const hero = liveHero(world, 0);
    const bed = creature.bedTile;
    creature.state = creature.sleeping;
    hero.tileX = creature.tileX + 1;
    hero.tileY = creature.tileY;
    hero.attackCooldown = 0;
    creature.attackCooldown = FIGHT_TICKS;
    stepWith(world, [{ kind: "possess", tick: world.tick, creatureId: creature.id }]);
    expect(world.possession).toEqual({ kind: "creature", id: creature.id });
    creature.hp = 1;
    hero.attackCooldown = 0;
    stepWith(world, []);
    expect(liveCreatureCount(world.creatures)).toBe(0);
    expect(world.possession).toEqual({ kind: "none" });
    expect(freeBedTiles(world)).toContain(bed);
  });

  it("includes possession in the world hash", () => {
    const world = setupSleepingCreatures(1);
    const creature = liveCreature(world, asCreatureId(0));
    const before = hashWorld(world);
    applyPossess(world, creature.id);
    const after = hashWorld(world);
    expect(after).not.toBe(before);
    const none: Possession = noPossession();
    const possessed: Possession = { kind: "creature", id: creature.id };
    expect(hashPossession(none)).not.toBe(hashPossession(possessed));
  });

  it("is deterministic after 10000 ticks with possession commands", () => {
    const commands = lairSetup(2);
    commands.push({ kind: "possess", tick: asTick(ARRIVE_TICKS + 1), creatureId: asCreatureId(0) });
    commands.push({ kind: "possessMove", tick: asTick(ARRIVE_TICKS + 2), creatureId: asCreatureId(0), dx: 0, dy: -1 });
    commands.push({ kind: "releasePossess", tick: asTick(ARRIVE_TICKS + 3) });
    commands.push({ kind: "possess", tick: asTick(ARRIVE_TICKS * 2 + 1), creatureId: asCreatureId(1) });
    commands.push({ kind: "possessMove", tick: asTick(ARRIVE_TICKS * 2 + 2), creatureId: asCreatureId(1), dx: 1, dy: 0 });
    const a = hashWorld(run(7, sortCommands(commands), 10000));
    const b = hashWorld(run(7, sortCommands(commands), 10000));
    expect(a).toBe(b);
  });
});

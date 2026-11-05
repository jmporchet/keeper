import { describe, expect, it } from "vitest";
import {
  ARRIVE_TICKS,
  BEETLE_HP,
  beginWander,
  CREATURE_CAPACITY,
  createCreature,
  createCreatureBoard,
  freeBedTiles,
  hashCreatures,
  HUNGER_TICKS,
  lairTileCount,
  liveCreatureCount,
  type Creature,
  type CreatureKind,
} from "./creatures";
import { asTick, asTileIndex, type TileIndex } from "./ids";
import { CREATURE_WAGE, PAY_TICKS } from "./wages";
import {
  sortCommands,
  createWorld,
  hashWorld,
  MAP_WIDTH,
  PORTAL_X,
  PORTAL_Y,
  ROOM_KIND,
  run,
  step,
  tileKindAt,
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

describe("creature portal", () => {
  it("arrives at the portal and claims the smallest free lair tile", () => {
    const world = run(1, sortCommands(lairSetup(3)), ARRIVE_TICKS + 1);
    expect(liveCreatureCount(world.creatures)).toBe(1);
    expect(lairTileCount(world)).toBe(3);
    const creature = liveCreature(world, 0);
    expect(creature.tileX).toBe(PORTAL_X);
    expect(creature.tileY).toBe(PORTAL_Y);
    expect(tileKindAt(world.tiles, PORTAL_Y * MAP_WIDTH + PORTAL_X)).toBe("portal");
    const bedY = (creature.bedTile / MAP_WIDTH) | 0;
    const bedX = creature.bedTile - bedY * MAP_WIDTH;
    expect(bedX).toBe(30);
    expect(bedY).toBe(30);
    expect(world.rooms[creature.bedTile]).toBe(ROOM_KIND.lair);
  });

  it("arrives as both fly and beetle over repeated arrival ticks", () => {
    const commands = lairSetup(CREATURE_CAPACITY);
    commands.push(addGold(0, 5000));
    const world = createWorld(1);
    const sorted = sortCommands(commands);
    const seen = new Set<CreatureKind>();
    for (let t = 0; t < ARRIVE_TICKS * 4; t += 1) {
      step(world, sorted);
      for (const creature of creatures(world)) {
        seen.add(creature.kind);
      }
    }
    expect(seen.has("fly")).toBe(true);
    expect(seen.has("beetle")).toBe(true);
  });

  it("gives a beetle more hp than a fly", () => {
    const bed = asTileIndex(30 * MAP_WIDTH + 30);
    const fly = createCreature(0, PORTAL_X, PORTAL_Y, bed, "fly");
    const beetle = createCreature(1, PORTAL_X, PORTAL_Y, bed, "beetle");
    expect(beetle.kind).toBe("beetle");
    expect(beetle.hp).toBe(BEETLE_HP);
    expect(beetle.maxHp).toBe(BEETLE_HP);
    expect(beetle.hp).toBeGreaterThan(fly.hp);
  });

  it("hashes creature kind", () => {
    const bed = asTileIndex(30 * MAP_WIDTH + 30);
    const fly = createCreature(0, PORTAL_X, PORTAL_Y, bed, "fly");
    const beetle = createCreature(0, PORTAL_X, PORTAL_Y, bed, "beetle");
    beetle.hp = fly.hp;
    beetle.maxHp = fly.maxHp;
    const flyBoard = createCreatureBoard();
    const beetleBoard = createCreatureBoard();
    flyBoard.slots[0] = { kind: "live", creature: fly };
    beetleBoard.slots[0] = { kind: "live", creature: beetle };
    expect(hashCreatures(flyBoard)).not.toBe(hashCreatures(beetleBoard));
  });

  it("includes creature kind in the world hash", () => {
    const world = run(1, sortCommands(lairSetup(1)), ARRIVE_TICKS + 1);
    const creature = liveCreature(world, 0);
    const before = hashWorld(world);
    creature.kind = creature.kind === "fly" ? "beetle" : "fly";
    expect(hashWorld(world)).not.toBe(before);
  });

  it("walks to its bed and sleeps there", () => {
    const world = run(1, sortCommands(lairSetup(2)), ARRIVE_TICKS + 80);
    const creature = liveCreature(world, 0);
    expect(creature.state.kind).toBe("sleeping");
    const bedY = (creature.bedTile / MAP_WIDTH) | 0;
    const bedX = creature.bedTile - bedY * MAP_WIDTH;
    expect(creature.tileX).toBe(bedX);
    expect(creature.tileY).toBe(bedY);
  });

  it("does not arrive without a free bed", () => {
    const world = run(1, sortCommands(lairSetup(1)), ARRIVE_TICKS * 3 + 1);
    expect(liveCreatureCount(world.creatures)).toBe(1);
    expect(lairTileCount(world)).toBe(1);
  });

  it("does not arrive without a lair", () => {
    const world = run(1, sortCommands([]), ARRIVE_TICKS * 5 + 1);
    expect(liveCreatureCount(world.creatures)).toBe(0);
    expect(lairTileCount(world)).toBe(0);
  });

  it("stops at CREATURE_CAPACITY even with spare beds", () => {
    const world = createWorld(1);
    const commands = sortCommands(lairSetup(CREATURE_CAPACITY + 2));
    let peak = 0;
    for (let t = 0; t < ARRIVE_TICKS * (CREATURE_CAPACITY + 1) * 4; t += 1) {
      step(world, commands);
      const count = liveCreatureCount(world.creatures);
      expect(count).toBeLessThanOrEqual(CREATURE_CAPACITY);
      if (count > peak) {
        peak = count;
      }
    }
    expect(lairTileCount(world)).toBe(CREATURE_CAPACITY + 2);
    expect(peak).toBe(CREATURE_CAPACITY);
  });

  it("never lets two creatures claim the same bed", () => {
    const world = createWorld(1);
    const commands = sortCommands(lairSetup(4));
    let peak = 0;
    for (let t = 0; t < ARRIVE_TICKS * 12 + 1; t += 1) {
      step(world, commands);
      const live = creatures(world);
      if (live.length > peak) {
        peak = live.length;
      }
      const seen = new Set<number>();
      for (const creature of live) {
        expect(world.rooms[creature.bedTile]).toBe(ROOM_KIND.lair);
        expect(seen.has(creature.bedTile)).toBe(false);
        seen.add(creature.bedTile);
      }
    }
    expect(peak).toBe(4);
  });

  it("is deterministic after 10000 ticks with lair paint and arrivals", () => {
    const commands: Command[] = lairSetup(4);
    commands.push({ kind: "tag", tick: asTick(0), tile: asTileIndex(32 * MAP_WIDTH + 38) });
    const a = hashWorld(run(7, sortCommands(commands), 10000));
    const b = hashWorld(run(7, sortCommands(commands), 10000));
    expect(a).toBe(b);
    expect(a).not.toBe(hashWorld(run(7, sortCommands([addGold(0, 1000)]), 10000)));
  });

  it("includes creatures and bed claims in the world hash", () => {
    const commands = lairSetup(2);
    const before = hashWorld(run(1, sortCommands(commands), ARRIVE_TICKS));
    const after = hashWorld(run(1, sortCommands(commands), ARRIVE_TICKS + 1));
    expect(before).not.toBe(after);
  });
});

describe("creature wandering", () => {
  it("wanders from sleep to a different tile and keeps its bed", () => {
    const world = createWorld(1);
    const commands = sortCommands(lairSetup(1));
    let bed = -1;
    let sawSleeping = false;
    let sawWandering = false;
    let reachedDifferent = false;
    for (let t = 0; t < 1200; t += 1) {
      step(world, commands);
      for (const creature of creatures(world)) {
        if (creature.state.kind === "sleeping") {
          sawSleeping = true;
          bed = creature.bedTile;
        }
        if (creature.state.kind === "wandering") {
          sawWandering = true;
          expect(freeBedTiles(world)).not.toContain(creature.bedTile);
        }
        if (bed < 0) {
          continue;
        }
        expect(creature.bedTile).toBe(bed);
        const bedY = (bed / MAP_WIDTH) | 0;
        const bedX = bed - bedY * MAP_WIDTH;
        if (creature.tileX !== bedX || creature.tileY !== bedY) {
          reachedDifferent = true;
        }
      }
    }
    expect(sawSleeping).toBe(true);
    expect(sawWandering).toBe(true);
    expect(reachedDifferent).toBe(true);
  });

  it("keeps counting hunger down while wandering", () => {
    const world = createWorld(1);
    const commands = sortCommands(lairSetup(1));
    let checked = false;
    for (let t = 0; t < 1600 && !checked; t += 1) {
      step(world, commands);
      const creature = creatures(world)[0];
      if (creature === undefined || creature.state.kind !== "wandering") {
        continue;
      }
      const state = creature.state;
      if (state.remaining <= 10 || state.pathLength - state.pathStep <= 1) {
        continue;
      }
      const start = state.remaining;
      for (let i = 0; i < 8; i += 1) {
        step(world, commands);
        const next = creature.state;
        if (next.kind !== "wandering") {
          throw new Error("wander ended before hunger check finished");
        }
        expect(next.remaining).toBe(start - i - 1);
      }
      expect(creature.state.kind).toBe("wandering");
      expect(start).toBeGreaterThan(creature.state.remaining);
      expect(creature.state.remaining).not.toBe(HUNGER_TICKS);
      checked = true;
    }
    expect(checked).toBe(true);
  });

  it("pays a wandering creature at payday", () => {
    const world = createWorld(1);
    const commands = sortCommands(lairSetup(1));
    while (world.tick < PAY_TICKS) {
      step(world, commands);
    }
    const creature = creatures(world)[0];
    if (creature === undefined) {
      throw new Error("missing creature before payday");
    }
    creature.state = creature.sleeping;
    expect(beginWander(world, creature)).toBe(true);
    step(world, commands);
    expect(creature.state.kind).toBe("wandering");
    expect(world.goldPaidOut).toBe(CREATURE_WAGE);
    expect(liveCreatureCount(world.creatures)).toBe(1);
  });

  it("becomes hungry when hunger reaches zero mid-wander", () => {
    const world = createWorld(1);
    const commands = sortCommands(lairSetup(1));
    let checked = false;
    for (let t = 0; t < 1600 && !checked; t += 1) {
      step(world, commands);
      const creature = creatures(world)[0];
      if (creature === undefined || creature.state.kind !== "wandering") {
        continue;
      }
      creature.state.remaining = 1;
      step(world, commands);
      expect(creature.state.kind).toBe("hungry");
      checked = true;
    }
    expect(checked).toBe(true);
  });
});

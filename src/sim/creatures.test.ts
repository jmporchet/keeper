import { describe, expect, it } from "vitest";
import { ARRIVE_TICKS, CREATURE_CAPACITY, lairTileCount, liveCreatureCount, type Creature } from "./creatures";
import { asTick, asTileIndex, type TileIndex } from "./ids";
import {
  asCommandLog,
  hashWorld,
  MAP_WIDTH,
  PORTAL_X,
  PORTAL_Y,
  ROOM_KIND,
  run,
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
    const world = run(1, asCommandLog(lairSetup(3)), ARRIVE_TICKS + 1);
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

  it("walks to its bed and sleeps there", () => {
    const world = run(1, asCommandLog(lairSetup(2)), ARRIVE_TICKS + 80);
    const creature = liveCreature(world, 0);
    expect(creature.state.kind).toBe("sleeping");
    const bedY = (creature.bedTile / MAP_WIDTH) | 0;
    const bedX = creature.bedTile - bedY * MAP_WIDTH;
    expect(creature.tileX).toBe(bedX);
    expect(creature.tileY).toBe(bedY);
  });

  it("does not arrive without a free bed", () => {
    const world = run(1, asCommandLog(lairSetup(1)), ARRIVE_TICKS * 3 + 1);
    expect(liveCreatureCount(world.creatures)).toBe(1);
    expect(lairTileCount(world)).toBe(1);
  });

  it("does not arrive without a lair", () => {
    const world = run(1, asCommandLog([]), ARRIVE_TICKS * 5 + 1);
    expect(liveCreatureCount(world.creatures)).toBe(0);
    expect(lairTileCount(world)).toBe(0);
  });

  it("stops at CREATURE_CAPACITY even with spare beds", () => {
    const world = run(1, asCommandLog(lairSetup(CREATURE_CAPACITY + 2)), ARRIVE_TICKS * (CREATURE_CAPACITY + 1) + 1);
    expect(lairTileCount(world)).toBe(CREATURE_CAPACITY + 2);
    expect(liveCreatureCount(world.creatures)).toBe(CREATURE_CAPACITY);
  });

  it("never lets two creatures claim the same bed", () => {
    const world = run(1, asCommandLog(lairSetup(4)), ARRIVE_TICKS * 12 + 1);
    const live = creatures(world);
    expect(live.length).toBe(4);
    const seen = new Set<number>();
    for (let i = 0; i < live.length; i += 1) {
      const creature = live[i];
      if (creature === undefined) {
        continue;
      }
      expect(world.rooms[creature.bedTile]).toBe(ROOM_KIND.lair);
      expect(seen.has(creature.bedTile)).toBe(false);
      seen.add(creature.bedTile);
    }
  });

  it("is deterministic after 10000 ticks with lair paint and arrivals", () => {
    const commands: Command[] = lairSetup(4);
    commands.push({ kind: "tag", tick: asTick(0), tile: asTileIndex(32 * MAP_WIDTH + 38) });
    const a = hashWorld(run(7, asCommandLog(commands), 10000));
    const b = hashWorld(run(7, asCommandLog(commands), 10000));
    expect(a).toBe(b);
    expect(a).not.toBe(hashWorld(run(7, asCommandLog([addGold(0, 1000)]), 10000)));
  });

  it("includes creatures and bed claims in the world hash", () => {
    const commands = lairSetup(2);
    const before = hashWorld(run(1, asCommandLog(commands), ARRIVE_TICKS));
    const after = hashWorld(run(1, asCommandLog(commands), ARRIVE_TICKS + 1));
    expect(before).not.toBe(after);
  });
});

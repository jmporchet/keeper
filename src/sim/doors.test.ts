import { describe, expect, it } from "vitest";
import { createHero, HERO_HP } from "./heroes";
import { asTick, asTileIndex, type TileIndex } from "./ids";
import {
  DOOR_COST,
  DOOR_HP,
  HEART_X,
  HEART_Y,
  MAP_WIDTH,
  PORTAL_X,
  PORTAL_Y,
  ROOM_KIND,
  TRAP_COST,
  TRAP_DAMAGE,
  TRAP_GAS_LIVE,
  TRAP_GAS_SPENT,
  TRAP_NONE,
} from "./map";
import { createPathScratch } from "./path";
import { findPath } from "./pathfind";
import { parseSaveValue } from "./save";
import {
  doorCount,
  hashWorld,
  run,
  sortCommands,
  step,
  tileKindAt,
  trapCount,
  TREASURY_COST,
  type Command,
  type World,
} from "./world";

const HEART_TILE = asTileIndex(HEART_Y * MAP_WIDTH + HEART_X);
const EARTH_TILE = asTileIndex(10 * MAP_WIDTH + 4);
const DOOR_A = asTileIndex(33 * MAP_WIDTH + 32);
const DOOR_WALL = [
  asTileIndex(33 * MAP_WIDTH + 30),
  asTileIndex(33 * MAP_WIDTH + 31),
  asTileIndex(33 * MAP_WIDTH + 32),
  asTileIndex(33 * MAP_WIDTH + 33),
  asTileIndex(33 * MAP_WIDTH + 34),
];
const TRAP_A = asTileIndex(34 * MAP_WIDTH + 32);

function addGold(tick: number, amount: number): Command {
  return { kind: "addGold", tick: asTick(tick), amount };
}

function paintDoor(tick: number, tile: TileIndex): Command {
  return { kind: "paintDoor", tick: asTick(tick), tile };
}

function paintTrap(tick: number, tile: TileIndex): Command {
  return { kind: "paintTrap", tick: asTick(tick), tile };
}

function paintRoom(tick: number, tile: TileIndex, room: "treasury"): Command {
  return { kind: "paintRoom", tick: asTick(tick), tile, room };
}

function wallCommands(): Command[] {
  const commands: Command[] = [addGold(0, 1000)];
  for (const tile of DOOR_WALL) {
    commands.push(paintDoor(0, tile));
  }
  return commands;
}

function clearImps(world: World): void {
  for (let i = 0; i < world.imps.slots.length; i += 1) {
    world.imps.slots[i] = { kind: "empty" };
  }
}

function heroPathLength(world: World, start: number, goal: number): number {
  const scratch = createPathScratch();
  const out = new Int16Array(MAP_WIDTH * MAP_WIDTH);
  return findPath(world.tiles, world.width, world.height, start, goal, scratch, out, world.doorHp);
}

describe("doors", () => {
  it("refuses a door on unclaimed floor", () => {
    const world = run(1, sortCommands([addGold(0, 100), paintDoor(1, EARTH_TILE)]), 2);
    expect(world.doorHp[EARTH_TILE]).toBe(0);
    expect(world.goldStored).toBe(100);
    expect(world.goldSpent).toBe(0);
    expect(doorCount(world)).toBe(0);
  });

  it("refuses a door without enough gold", () => {
    const world = run(1, sortCommands([paintDoor(0, HEART_TILE)]), 1);
    expect(world.doorHp[HEART_TILE]).toBe(0);
    expect(world.goldStored).toBe(0);
    expect(world.goldSpent).toBe(0);
  });

  it("refuses a door on a room or an existing trap", () => {
    const onRoom = run(
      1,
      sortCommands([addGold(0, 100), paintRoom(0, HEART_TILE, "treasury"), paintDoor(1, HEART_TILE)]),
      2,
    );
    expect(tileKindAt(onRoom.tiles, HEART_TILE)).toBe("room");
    expect(onRoom.rooms[HEART_TILE]).toBe(ROOM_KIND.treasury);
    expect(onRoom.doorHp[HEART_TILE]).toBe(0);
    expect(onRoom.goldSpent).toBe(TREASURY_COST);

    const onTrap = run(
      1,
      sortCommands([addGold(0, 100), paintTrap(0, HEART_TILE), paintDoor(1, HEART_TILE)]),
      2,
    );
    expect(onTrap.trapState[HEART_TILE]).toBe(TRAP_GAS_LIVE);
    expect(onTrap.doorHp[HEART_TILE]).toBe(0);
    expect(onTrap.goldSpent).toBe(TRAP_COST);
  });

  it("refuses a room on a door or trap tile", () => {
    const onDoor = run(
      1,
      sortCommands([addGold(0, 200), paintDoor(0, HEART_TILE), paintRoom(1, HEART_TILE, "treasury")]),
      2,
    );
    expect(tileKindAt(onDoor.tiles, HEART_TILE)).toBe("claimed");
    expect(onDoor.rooms[HEART_TILE]).toBe(ROOM_KIND.none);
    expect(onDoor.doorHp[HEART_TILE]).toBe(DOOR_HP);
    expect(onDoor.goldSpent).toBe(DOOR_COST);

    const onTrap = run(
      1,
      sortCommands([addGold(0, 200), paintTrap(0, HEART_TILE), paintRoom(1, HEART_TILE, "treasury")]),
      2,
    );
    expect(tileKindAt(onTrap.tiles, HEART_TILE)).toBe("claimed");
    expect(onTrap.rooms[HEART_TILE]).toBe(ROOM_KIND.none);
    expect(onTrap.trapState[HEART_TILE]).toBe(TRAP_GAS_LIVE);
    expect(onTrap.goldSpent).toBe(TRAP_COST);
  });

  it("paints a door, pays DOOR_COST and records the spend", () => {
    const world = run(1, sortCommands([addGold(0, 100), paintDoor(1, DOOR_A)]), 2);
    expect(tileKindAt(world.tiles, DOOR_A)).toBe("claimed");
    expect(world.doorHp[DOOR_A]).toBe(DOOR_HP);
    expect(world.goldStored).toBe(100 - DOOR_COST);
    expect(world.goldSpent).toBe(DOOR_COST);
    expect(doorCount(world)).toBe(1);
    expect(hashWorld(world)).not.toBe(hashWorld(run(1, sortCommands([addGold(0, 100)]), 2)));
  });

  it("blocks hero pathfinding through intact doors until one breaks", () => {
    const world = run(1, sortCommands(wallCommands()), 1);
    const start = PORTAL_Y * MAP_WIDTH + PORTAL_X;
    const goal = HEART_Y * MAP_WIDTH + HEART_X;
    expect(heroPathLength(world, start, goal)).toBe(0);
    const scratch = createPathScratch();
    const out = new Int16Array(MAP_WIDTH * MAP_WIDTH);
    expect(findPath(world.tiles, world.width, world.height, start, goal, scratch, out)).toBeGreaterThan(0);
    world.doorHp[DOOR_A] = 0;
    expect(heroPathLength(world, start, goal)).toBeGreaterThan(0);
  });

  it("lets a hero damage a door to zero and then march through", () => {
    const world = run(1, sortCommands(wallCommands()), 1);
    clearImps(world);
    const hero = createHero(0, 32, 34, HERO_HP);
    world.heroes.slots[0] = { kind: "live", hero };
    const log = sortCommands([]);
    let ticks = 0;
    while (world.doorHp[DOOR_A] !== 0 && ticks < 80) {
      step(world, log);
      ticks += 1;
    }
    expect(world.doorHp[DOOR_A]).toBe(0);
    expect(doorCount(world)).toBe(DOOR_WALL.length - 1);
    expect(heroPathLength(world, hero.tileY * MAP_WIDTH + hero.tileX, HEART_Y * MAP_WIDTH + HEART_X)).toBeGreaterThan(0);
    const beforeY = hero.tileY;
    for (let i = 0; i < 12; i += 1) {
      step(world, log);
    }
    expect(hero.tileY).toBeLessThan(beforeY);
  });
});

describe("gas traps", () => {
  it("refuses a trap on unclaimed floor or without enough gold", () => {
    const unclaimed = run(1, sortCommands([addGold(0, 100), paintTrap(1, EARTH_TILE)]), 2);
    expect(unclaimed.trapState[EARTH_TILE]).toBe(TRAP_NONE);
    expect(unclaimed.goldStored).toBe(100);
    expect(unclaimed.goldSpent).toBe(0);

    const short = run(1, sortCommands([paintTrap(0, HEART_TILE)]), 1);
    expect(short.trapState[HEART_TILE]).toBe(TRAP_NONE);
    expect(short.goldStored).toBe(0);
    expect(short.goldSpent).toBe(0);
  });

  it("refuses a trap on a door", () => {
    const world = run(
      1,
      sortCommands([addGold(0, 100), paintDoor(0, HEART_TILE), paintTrap(1, HEART_TILE)]),
      2,
    );
    expect(world.doorHp[HEART_TILE]).toBe(DOOR_HP);
    expect(world.trapState[HEART_TILE]).toBe(TRAP_NONE);
    expect(world.goldSpent).toBe(DOOR_COST);
  });

  it("paints a gas trap, pays TRAP_COST and records the spend", () => {
    const world = run(1, sortCommands([addGold(0, 100), paintTrap(1, TRAP_A)]), 2);
    expect(tileKindAt(world.tiles, TRAP_A)).toBe("claimed");
    expect(world.trapState[TRAP_A]).toBe(TRAP_GAS_LIVE);
    expect(world.goldStored).toBe(100 - TRAP_COST);
    expect(world.goldSpent).toBe(TRAP_COST);
    expect(trapCount(world)).toBe(1);
  });

  it("damages a hero once when it steps on a live trap", () => {
    const world = run(1, sortCommands([addGold(0, 100), paintTrap(0, TRAP_A)]), 1);
    const hero = createHero(0, 32, 34, HERO_HP);
    world.heroes.slots[0] = { kind: "live", hero };
    step(world, sortCommands([]));
    expect(hero.hp).toBe(HERO_HP - TRAP_DAMAGE);
    expect(world.trapState[TRAP_A]).toBe(TRAP_GAS_SPENT);
    expect(trapCount(world)).toBe(0);
    step(world, sortCommands([]));
    step(world, sortCommands([]));
    expect(hero.hp).toBe(HERO_HP - TRAP_DAMAGE);
    expect(world.trapState[TRAP_A]).toBe(TRAP_GAS_SPENT);
  });

  it("leaves a live trap armed when only imps walk over it", () => {
    const world = run(1, sortCommands([addGold(0, 100), paintTrap(0, HEART_TILE)]), 100);
    expect(world.trapState[HEART_TILE]).toBe(TRAP_GAS_LIVE);
    expect(trapCount(world)).toBe(1);
  });

  it("is deterministic with doors and traps", () => {
    const commands: Command[] = [
      addGold(0, 1000),
      paintDoor(1, DOOR_A),
      paintTrap(1, TRAP_A),
      paintDoor(1, asTileIndex(33 * MAP_WIDTH + 31)),
    ];
    const a = hashWorld(run(9, sortCommands(commands), 10000));
    const b = hashWorld(run(9, sortCommands(commands), 10000));
    expect(a).toBe(b);
    expect(a).not.toBe(hashWorld(run(9, sortCommands([addGold(0, 1000)]), 10000)));
  });
});

describe("door and trap save parsing", () => {
  it("round-trips paintDoor and paintTrap commands", () => {
    const parsed = parseSaveValue({
      version: 1,
      seed: 1,
      tick: 0,
      commands: [
        { kind: "paintDoor", tick: 2, tile: DOOR_A },
        { kind: "paintTrap", tick: 3, tile: TRAP_A },
      ],
    });
    expect(parsed).toEqual({
      ok: true,
      save: {
        version: 1,
        seed: 1,
        tick: 0,
        commands: [
          { kind: "paintDoor", tick: 2, tile: DOOR_A },
          { kind: "paintTrap", tick: 3, tile: TRAP_A },
        ],
      },
    });
  });

  it("rejects a paintDoor command without a tile", () => {
    expect(
      parseSaveValue({ version: 1, seed: 1, tick: 0, commands: [{ kind: "paintDoor", tick: 0 }] }),
    ).toEqual({
      ok: false,
      error: { kind: "invalidCommand", index: 0, reason: "invalidTile" },
    });
  });
});

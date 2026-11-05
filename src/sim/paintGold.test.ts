import { describe, expect, it } from "vitest";
import { asTick, asTileIndex, type TileIndex } from "./ids";
import {
  DOOR_COST,
  DOOR_HP,
  LIBRARY_COST,
  MAP_WIDTH,
  ROOM_KIND,
  TRAP_COST,
  TRAP_GAS_LIVE,
  TRAP_NONE,
} from "./map";
import {
  createWorld,
  sortCommands,
  step,
  tileKindAt,
  type Command,
  type World,
} from "./world";

const TREASURY_TILE = asTileIndex(30 * MAP_WIDTH + 31);
const LIBRARY_TILE = asTileIndex(31 * MAP_WIDTH + 30);
const DOOR_TILE = asTileIndex(31 * MAP_WIDTH + 31);
const TRAP_TILE = asTileIndex(31 * MAP_WIDTH + 32);

function addGold(tick: number, amount: number): Command {
  return { kind: "addGold", tick: asTick(tick), amount };
}

function paintTreasury(tick: number, tile: TileIndex): Command {
  return { kind: "paintRoom", tick: asTick(tick), tile, room: "treasury" };
}

function paintLibrary(tick: number, tile: TileIndex): Command {
  return { kind: "paintRoom", tick: asTick(tick), tile, room: "library" };
}

function paintDoor(tick: number, tile: TileIndex): Command {
  return { kind: "paintDoor", tick: asTick(tick), tile };
}

function paintTrap(tick: number, tile: TileIndex): Command {
  return { kind: "paintTrap", tick: asTick(tick), tile };
}

function stockTreasury(world: World, amount: number): void {
  world.goldStored = 0;
  world.treasuryStock[TREASURY_TILE] = amount;
  world.treasuryVersion += 1;
}

describe("paint costs from treasury gold", () => {
  it("spends treasury stock for a library paint", () => {
    const commands = sortCommands([
      addGold(0, 100),
      paintTreasury(0, TREASURY_TILE),
      paintLibrary(1, LIBRARY_TILE),
    ]);
    const world = createWorld(1);
    step(world, commands);
    stockTreasury(world, 100);
    const spentBefore = world.goldSpent;
    step(world, commands);
    expect(world.rooms[LIBRARY_TILE]).toBe(ROOM_KIND.library);
    expect(world.treasuryStock[TREASURY_TILE]).toBe(100 - LIBRARY_COST);
    expect(world.goldSpent).toBe(spentBefore + LIBRARY_COST);
  });

  it("spends treasury stock for a door paint", () => {
    const commands = sortCommands([
      addGold(0, 100),
      paintTreasury(0, TREASURY_TILE),
      paintDoor(1, DOOR_TILE),
    ]);
    const world = createWorld(1);
    step(world, commands);
    stockTreasury(world, 100);
    const spentBefore = world.goldSpent;
    step(world, commands);
    expect(world.doorHp[DOOR_TILE]).toBe(DOOR_HP);
    expect(world.treasuryStock[TREASURY_TILE]).toBe(100 - DOOR_COST);
    expect(world.goldSpent).toBe(spentBefore + DOOR_COST);
  });

  it("spends treasury stock for a trap paint", () => {
    const commands = sortCommands([
      addGold(0, 100),
      paintTreasury(0, TREASURY_TILE),
      paintTrap(1, TRAP_TILE),
    ]);
    const world = createWorld(1);
    step(world, commands);
    stockTreasury(world, 100);
    const spentBefore = world.goldSpent;
    step(world, commands);
    expect(world.trapState[TRAP_TILE]).toBe(TRAP_GAS_LIVE);
    expect(world.treasuryStock[TREASURY_TILE]).toBe(100 - TRAP_COST);
    expect(world.goldSpent).toBe(spentBefore + TRAP_COST);
  });

  it("refuses paint when stored and treasury gold are below the cost", () => {
    const cases: Array<{ command: Command; cost: number; check: (world: World) => void }> = [
      {
        command: paintLibrary(1, LIBRARY_TILE),
        cost: LIBRARY_COST,
        check: (world) => {
          expect(world.rooms[LIBRARY_TILE]).toBe(ROOM_KIND.none);
          expect(tileKindAt(world.tiles, LIBRARY_TILE)).toBe("claimed");
        },
      },
      {
        command: paintDoor(1, DOOR_TILE),
        cost: DOOR_COST,
        check: (world) => {
          expect(world.doorHp[DOOR_TILE]).toBe(0);
        },
      },
      {
        command: paintTrap(1, TRAP_TILE),
        cost: TRAP_COST,
        check: (world) => {
          expect(world.trapState[TRAP_TILE]).toBe(TRAP_NONE);
        },
      },
    ];
    for (const entry of cases) {
      const commands = sortCommands([
        addGold(0, 100),
        paintTreasury(0, TREASURY_TILE),
        entry.command,
      ]);
      const world = createWorld(1);
      step(world, commands);
      stockTreasury(world, entry.cost - 1);
      const spentBefore = world.goldSpent;
      const stockBefore = world.treasuryStock[TREASURY_TILE];
      step(world, commands);
      expect(world.goldStored).toBe(0);
      expect(world.treasuryStock[TREASURY_TILE]).toBe(stockBefore);
      expect(world.goldSpent).toBe(spentBefore);
      entry.check(world);
    }
  });

  it("spends stored gold before treasury stock", () => {
    const commands = sortCommands([
      addGold(0, 100),
      paintTreasury(0, TREASURY_TILE),
      paintLibrary(1, LIBRARY_TILE),
    ]);
    const world = createWorld(1);
    step(world, commands);
    world.goldStored = LIBRARY_COST + 10;
    world.treasuryStock[TREASURY_TILE] = 100;
    world.treasuryVersion += 1;
    const spentBefore = world.goldSpent;
    step(world, commands);
    expect(world.rooms[LIBRARY_TILE]).toBe(ROOM_KIND.library);
    expect(world.goldStored).toBe(10);
    expect(world.treasuryStock[TREASURY_TILE]).toBe(100);
    expect(world.goldSpent).toBe(spentBefore + LIBRARY_COST);
  });
});

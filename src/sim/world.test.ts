import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { asTick, asTileIndex } from "./ids";
import { commandList, extraGold } from "./commandArbitrary";
import {
  sortCommands,
  countTagged,
  createWorld,
  hashWorld,
  MAP_HEIGHT,
  MAP_WIDTH,
  PORTAL_X,
  PORTAL_Y,
  run,
  setTile,
  TILE_KIND,
  TILE_KIND_COUNT,
  TILE_KINDS,
  tileKindAt,
  type Command,
  type TileKind,
} from "./world";

const TICKS = 10_000;

function asciiChar(kind: TileKind): string {
  switch (kind) {
    case "earth":
      return ".";
    case "goldSeam":
      return "$";
    case "rock":
      return "#";
    case "dirt":
      return ",";
    case "claimed":
      return "+";
    case "room":
      return "R";
    case "taggedEarth":
      return "*";
    case "taggedGold":
      return "S";
    case "portal":
      return "P";
    default: {
      const never: never = kind;
      return never;
    }
  }
}

function mapAscii(world: ReturnType<typeof createWorld>): string {
  const rows: string[] = [];
  for (let y = 0; y < world.height; y += 1) {
    let row = "";
    for (let x = 0; x < world.width; x += 1) {
      row += asciiChar(tileKindAt(world.tiles, y * world.width + x));
    }
    rows.push(row);
  }
  return rows.join("\n");
}

describe("sim core", () => {
  it("same seed and command log give the same state hash after 10000 ticks", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), commandList(TICKS), (seed, commands) => {
        const a = hashWorld(run(seed, sortCommands(commands), TICKS));
        const b = hashWorld(run(seed, sortCommands(commands), TICKS));
        expect(a).toBe(b);
      }),
      { numRuns: 20 },
    );
  });

  it("a different seed or command list generally differs", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), fc.integer({ min: 1, max: 0xffffffff }), (seed, delta) => {
        const other = (seed + delta) >>> 0;
        const a = hashWorld(run(seed, sortCommands([]), TICKS));
        const b = hashWorld(run(other, sortCommands([]), TICKS));
        expect(a).not.toBe(b);
      }),
      { numRuns: 20 },
    );
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), commandList(TICKS), extraGold(TICKS), (seed, commands, extra) => {
        const withExtra = commands.concat([extra]);
        const a = hashWorld(run(seed, sortCommands(commands), TICKS));
        const b = hashWorld(run(seed, sortCommands(withExtra), TICKS));
        expect(a).not.toBe(b);
      }),
      { numRuns: 20 },
    );
  });
});

describe("tile grid", () => {
  it("prints the starting map as ASCII", () => {
    expect(mapAscii(createWorld(1))).toMatchSnapshot();
  });

  it("has the 64x64 starting map invariants", () => {
    const world = createWorld(1);
    expect(world.width).toBe(MAP_WIDTH);
    expect(world.height).toBe(MAP_HEIGHT);
    expect(MAP_WIDTH).toBe(64);
    expect(MAP_HEIGHT).toBe(64);
    expect(world.tiles.length).toBe(MAP_WIDTH * MAP_HEIGHT);
    expect(world.tiles).toBeInstanceOf(Uint8Array);

    let rock = 0;
    let earth = 0;
    let gold = 0;
    let claimed = 0;
    let dirt = 0;
    let room = 0;
    let portal = 0;
    for (let y = 0; y < world.height; y += 1) {
      for (let x = 0; x < world.width; x += 1) {
        const i = y * world.width + x;
        const kind = tileKindAt(world.tiles, i);
        const border = x < 2 || y < 2 || x >= world.width - 2 || y >= world.height - 2;
        if (border) {
          expect(kind).toBe("rock");
        }
        switch (kind) {
          case "rock":
            rock += 1;
            break;
          case "earth":
            earth += 1;
            break;
          case "goldSeam":
            gold += 1;
            break;
          case "claimed":
            claimed += 1;
            break;
          case "dirt":
            dirt += 1;
            break;
          case "room":
            room += 1;
            break;
          case "portal":
            portal += 1;
            break;
          case "taggedEarth":
          case "taggedGold":
            throw new Error("starting map must not be tagged");
          default: {
            const never: never = kind;
            expect(never).toBeUndefined();
          }
        }
      }
    }
    expect(dirt).toBe(0);
    expect(room).toBe(0);
    expect(portal).toBe(1);
    expect(gold).toBeGreaterThan(0);
    expect(claimed).toBe(25);
    expect(earth).toBeGreaterThan(0);
    expect(rock).toBeGreaterThan(0);
    expect(tileKindAt(world.tiles, 32 * world.width + 32)).toBe("claimed");
    expect(TILE_KIND.earth).toBe(0);
    expect(TILE_KIND.goldSeam).toBe(1);
    expect(TILE_KIND.rock).toBe(2);
    expect(TILE_KIND.dirt).toBe(3);
    expect(TILE_KIND.claimed).toBe(4);
    expect(TILE_KIND.room).toBe(5);
    expect(TILE_KIND.taggedEarth).toBe(6);
    expect(TILE_KIND.taggedGold).toBe(7);
    expect(TILE_KIND.portal).toBe(8);
  });

  it("TILE_KIND codes match TILE_KINDS order", () => {
    expect(TILE_KINDS.length).toBe(TILE_KIND_COUNT);
    expect(TILE_KIND_COUNT).toBe(9);
    for (let i = 0; i < TILE_KINDS.length; i += 1) {
      const kind = TILE_KINDS[i];
      if (kind === undefined) {
        throw new Error("missing kind");
      }
      expect(TILE_KIND[kind]).toBe(i);
    }
  });

  it("keeps walkableTileCount exact when the portal is rewritten", () => {
    const world = createWorld(1);
    let walkable = 0;
    for (let i = 0; i < world.tiles.length; i += 1) {
      const kind = tileKindAt(world.tiles, i);
      if (kind === "claimed" || kind === "dirt" || kind === "room" || kind === "portal") {
        walkable += 1;
      }
    }
    expect(world.walkableTileCount).toBe(walkable);
    const portal = asTileIndex(PORTAL_Y * MAP_WIDTH + PORTAL_X);
    expect(tileKindAt(world.tiles, portal)).toBe("portal");
    setTile(world, portal, TILE_KIND.room);
    expect(world.walkableTileCount).toBe(walkable);
    setTile(world, portal, TILE_KIND.earth);
    expect(world.walkableTileCount).toBe(walkable - 1);
    setTile(world, portal, TILE_KIND.portal);
    expect(world.walkableTileCount).toBe(walkable);
  });
});

describe("tag tiles", () => {
  it("sweep tags exactly the swept diggable tiles and refuses rock", () => {
    const y = 10;
    const commands: Command[] = [];
    for (let x = 0; x <= 5; x += 1) {
      commands.push({ kind: "tag", tick: asTick(0), tile: asTileIndex(y * MAP_WIDTH + x) });
    }
    commands.push({ kind: "tag", tick: asTick(0), tile: asTileIndex(31 * MAP_WIDTH + 38) });
    const world = run(1, sortCommands(commands), 1);
    expect(tileKindAt(world.tiles, y * MAP_WIDTH + 0)).toBe("rock");
    expect(tileKindAt(world.tiles, y * MAP_WIDTH + 1)).toBe("rock");
    expect(tileKindAt(world.tiles, y * MAP_WIDTH + 2)).toBe("taggedEarth");
    expect(tileKindAt(world.tiles, y * MAP_WIDTH + 3)).toBe("taggedEarth");
    expect(tileKindAt(world.tiles, y * MAP_WIDTH + 4)).toBe("taggedEarth");
    expect(tileKindAt(world.tiles, y * MAP_WIDTH + 5)).toBe("taggedEarth");
    expect(tileKindAt(world.tiles, 31 * MAP_WIDTH + 38)).toBe("taggedGold");
    expect(countTagged(world)).toBe(5);
    let row = "";
    for (let x = 0; x <= 5; x += 1) {
      row += asciiChar(tileKindAt(world.tiles, y * MAP_WIDTH + x));
    }
    expect(row).toBe("##****");
  });

  it("untag restores earth and gold", () => {
    const earth = asTileIndex(10 * MAP_WIDTH + 4);
    const gold = asTileIndex(31 * MAP_WIDTH + 38);
    const world = run(
      1,
      sortCommands([
        { kind: "tag", tick: asTick(0), tile: earth },
        { kind: "tag", tick: asTick(0), tile: gold },
        { kind: "untag", tick: asTick(1), tile: earth },
        { kind: "untag", tick: asTick(1), tile: gold },
      ]),
      2,
    );
    expect(tileKindAt(world.tiles, earth)).toBe("earth");
    expect(tileKindAt(world.tiles, gold)).toBe("goldSeam");
    expect(countTagged(world)).toBe(0);
  });

  it("tagging is included in the world hash", () => {
    const tile = asTileIndex(10 * MAP_WIDTH + 4);
    const tagged = hashWorld(run(1, sortCommands([{ kind: "tag", tick: asTick(0), tile }]), 4));
    const plain = hashWorld(run(1, sortCommands([]), 4));
    expect(tagged).not.toBe(plain);
    const a = hashWorld(run(7, sortCommands([{ kind: "tag", tick: asTick(0), tile }]), 20));
    const b = hashWorld(run(7, sortCommands([{ kind: "tag", tick: asTick(0), tile }]), 20));
    expect(a).toBe(b);
  });
});

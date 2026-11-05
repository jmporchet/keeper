import { describe, expect, it } from "vitest";
import { ROOM_KIND, TILE_KINDS } from "../sim";
import {
  ATLAS_CELL,
  ATLAS_CELL_COUNT,
  ATLAS_COLUMNS,
  ATLAS_ROWS,
  atlasCellForKind,
  atlasCellForRoomKind,
} from "./atlas";

describe("cave floor atlas", () => {
  it("maps tile kinds to the intended atlas cells", () => {
    expect(atlasCellForKind("earth")).toBe(ATLAS_CELL.earthTop);
    expect(atlasCellForKind("taggedEarth")).toBe(ATLAS_CELL.earthTop);
    expect(atlasCellForKind("dirt")).toBe(ATLAS_CELL.dirt);
    expect(atlasCellForKind("claimed")).toBe(ATLAS_CELL.claimedFlags);
    expect(atlasCellForKind("rock")).toBe(ATLAS_CELL.rock);
    expect(atlasCellForKind("goldSeam")).toBe(ATLAS_CELL.goldVeins);
    expect(atlasCellForKind("taggedGold")).toBe(ATLAS_CELL.goldVeins);
    expect(atlasCellForKind("room")).toBe(ATLAS_CELL.roomFloor);
    expect(atlasCellForKind("portal")).toBe(ATLAS_CELL.portalFloor);
  });

  it("keeps rock and gold on distinct cells", () => {
    expect(atlasCellForKind("rock")).not.toBe(atlasCellForKind("goldSeam"));
  });

  it("keeps every kind inside the atlas grid", () => {
    for (const kind of TILE_KINDS) {
      const cell = atlasCellForKind(kind);
      expect(cell).toBeGreaterThanOrEqual(0);
      expect(cell).toBeLessThan(ATLAS_CELL_COUNT);
      expect(cell % ATLAS_COLUMNS).toBeLessThan(ATLAS_COLUMNS);
      expect(Math.floor(cell / ATLAS_COLUMNS)).toBeLessThan(ATLAS_ROWS);
    }
  });

  it("maps each room kind to a distinct floor cell", () => {
    const cells = [
      atlasCellForRoomKind(ROOM_KIND.treasury),
      atlasCellForRoomKind(ROOM_KIND.lair),
      atlasCellForRoomKind(ROOM_KIND.hatchery),
      atlasCellForRoomKind(ROOM_KIND.training),
      atlasCellForRoomKind(ROOM_KIND.workshop),
      atlasCellForRoomKind(ROOM_KIND.library),
    ];
    expect(new Set(cells).size).toBe(cells.length);
    expect(cells[0]).toBe(ATLAS_CELL.treasuryFloor);
    expect(cells[1]).toBe(ATLAS_CELL.lairFloor);
    expect(cells[2]).toBe(ATLAS_CELL.hatcheryFloor);
    expect(cells[3]).toBe(ATLAS_CELL.trainingFloor);
    expect(cells[4]).toBe(ATLAS_CELL.workshopFloor);
    expect(cells[5]).toBe(ATLAS_CELL.libraryFloor);
  });

  it("falls back to the generic room floor for none and unknown room kinds", () => {
    expect(atlasCellForRoomKind(ROOM_KIND.none)).toBe(ATLAS_CELL.roomFloor);
    expect(atlasCellForRoomKind(99)).toBe(ATLAS_CELL.roomFloor);
  });

  it("keeps every room floor cell inside the atlas grid", () => {
    for (let roomCode = 0; roomCode <= ROOM_KIND.library; roomCode += 1) {
      const cell = atlasCellForRoomKind(roomCode);
      expect(cell).toBeGreaterThanOrEqual(0);
      expect(cell).toBeLessThan(ATLAS_CELL_COUNT);
      expect(cell % ATLAS_COLUMNS).toBeLessThan(ATLAS_COLUMNS);
      expect(Math.floor(cell / ATLAS_COLUMNS)).toBeLessThan(ATLAS_ROWS);
    }
  });
});

import { describe, expect, it } from "vitest";
import { TILE_KINDS } from "../sim";
import { ATLAS_CELL, ATLAS_CELL_COUNT, ATLAS_COLUMNS, ATLAS_ROWS, atlasCellForKind } from "./atlas";

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
});

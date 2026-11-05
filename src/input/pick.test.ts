import { describe, expect, it } from "vitest";
import { asTileIndex, MAP_HALF, MAP_WIDTH, tileIndexFromWorld } from "../sim";

describe("tile picking", () => {
  it("maps a world-space hit on a tile center to that tile index", () => {
    expect(tileIndexFromWorld(0, 0)).toBe(asTileIndex(32 * MAP_WIDTH + 32));
    expect(tileIndexFromWorld(5 - MAP_HALF, 10 - MAP_HALF)).toBe(asTileIndex(10 * MAP_WIDTH + 5));
  });

  it("rejects hits outside the map", () => {
    expect(tileIndexFromWorld(-MAP_HALF - 1, 0)).toBeUndefined();
    expect(tileIndexFromWorld(0, MAP_HALF + 40)).toBeUndefined();
  });
});

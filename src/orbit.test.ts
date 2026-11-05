import { describe, expect, it } from "vitest";
import { ORBIT_RADIUS, TICKS_PER_TURN, orbitPosition } from "./orbit";

describe("orbitPosition", () => {
  it("stays at the fixed radius and returns to start after a full turn", () => {
    const start = orbitPosition(0);
    const quarter = orbitPosition(TICKS_PER_TURN / 4);
    const full = orbitPosition(TICKS_PER_TURN);
    expect(Math.hypot(start.x, start.z)).toBeCloseTo(ORBIT_RADIUS);
    expect(Math.hypot(quarter.x, quarter.z)).toBeCloseTo(ORBIT_RADIUS);
    expect(full.x).toBeCloseTo(start.x);
    expect(full.y).toBe(start.y);
    expect(full.z).toBeCloseTo(start.z);
    expect(quarter.x).toBeCloseTo(0);
    expect(quarter.z).toBeCloseTo(ORBIT_RADIUS);
  });
});

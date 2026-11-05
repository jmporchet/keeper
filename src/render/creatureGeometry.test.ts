import { describe, expect, it } from "vitest";
import {
  CREATURE_GEOMETRY_BASE_Y,
  CREATURE_KIND_BEETLE,
  CREATURE_KIND_FLY,
  CREATURE_KIND_HERO,
  createBeetleGeometry,
  createCreatureGeometry,
  createFlyGeometry,
  createHeroGeometry,
} from "./creatureGeometry";

function boundsOf(geometry: ReturnType<typeof createFlyGeometry>) {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error("geometry has no bounding box");
  }
  return {
    width: bounds.max.x - bounds.min.x,
    height: bounds.max.y - bounds.min.y,
    depth: bounds.max.z - bounds.min.z,
    minY: bounds.min.y,
  };
}

describe("creature silhouettes", () => {
  it("builds a bounded fly silhouette with a flat base", () => {
    const geometry = createFlyGeometry();
    const position = geometry.getAttribute("position");
    expect(position.count).toBeGreaterThan(0);
    expect(position.count).toBeLessThanOrEqual(600);
    expect(geometry.groups.length).toBe(0);
    const bounds = boundsOf(geometry);
    expect(bounds.minY).toBeCloseTo(CREATURE_GEOMETRY_BASE_Y, 5);
    expect(bounds.height).toBeGreaterThanOrEqual(0.24);
    expect(bounds.height).toBeLessThanOrEqual(0.34);
    expect(bounds.width).toBeGreaterThanOrEqual(0.68);
    expect(bounds.width).toBeLessThanOrEqual(0.78);
    expect(bounds.depth).toBeGreaterThanOrEqual(0.36);
    expect(bounds.depth).toBeLessThanOrEqual(0.46);
    const kinds = geometry.getAttribute("aKind");
    expect(kinds.count).toBe(position.count);
    for (let i = 0; i < kinds.count; i += 1) {
      expect(kinds.getX(i)).toBe(CREATURE_KIND_FLY);
    }
  });

  it("builds a wide low beetle silhouette with six legs", () => {
    const geometry = createBeetleGeometry();
    const position = geometry.getAttribute("position");
    expect(position.count).toBeGreaterThan(0);
    expect(position.count).toBeLessThanOrEqual(600);
    expect(geometry.groups.length).toBe(0);
    const bounds = boundsOf(geometry);
    expect(bounds.minY).toBeCloseTo(CREATURE_GEOMETRY_BASE_Y, 5);
    expect(bounds.height).toBeGreaterThanOrEqual(0.26);
    expect(bounds.height).toBeLessThanOrEqual(0.32);
    expect(bounds.width).toBeGreaterThanOrEqual(0.78);
    expect(bounds.width).toBeLessThanOrEqual(0.86);
    expect(bounds.depth).toBeGreaterThanOrEqual(0.88);
    expect(bounds.depth).toBeLessThanOrEqual(1.04);
    const kinds = geometry.getAttribute("aKind");
    expect(kinds.count).toBe(position.count);
    for (let i = 0; i < kinds.count; i += 1) {
      expect(kinds.getX(i)).toBe(CREATURE_KIND_BEETLE);
    }
  });

  it("builds a humanoid hero silhouette with shield and sword", () => {
    const geometry = createHeroGeometry();
    const position = geometry.getAttribute("position");
    expect(position.count).toBeGreaterThan(0);
    expect(position.count).toBeLessThanOrEqual(600);
    expect(geometry.groups.length).toBe(0);
    const bounds = boundsOf(geometry);
    expect(bounds.minY).toBeCloseTo(CREATURE_GEOMETRY_BASE_Y, 5);
    expect(bounds.height).toBeGreaterThanOrEqual(0.86);
    expect(bounds.height).toBeLessThanOrEqual(0.92);
    expect(bounds.width).toBeGreaterThanOrEqual(0.68);
    expect(bounds.width).toBeLessThanOrEqual(0.8);
    expect(bounds.depth).toBeGreaterThanOrEqual(0.2);
    expect(bounds.depth).toBeLessThanOrEqual(0.3);
    const kinds = geometry.getAttribute("aKind");
    expect(kinds.count).toBe(position.count);
    for (let i = 0; i < kinds.count; i += 1) {
      expect(kinds.getX(i)).toBe(CREATURE_KIND_HERO);
    }
  });

  it("merges the three tagged kinds into one bounded geometry", () => {
    const geometry = createCreatureGeometry();
    const position = geometry.getAttribute("position");
    expect(position.count).toBeGreaterThan(0);
    expect(position.count).toBeLessThanOrEqual(1600);
    expect(geometry.groups.length).toBe(0);
    const kinds = geometry.getAttribute("aKind");
    expect(kinds.count).toBe(position.count);
    const seen = new Set<number>();
    for (let i = 0; i < kinds.count; i += 1) {
      seen.add(kinds.getX(i));
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([CREATURE_KIND_FLY, CREATURE_KIND_BEETLE, CREATURE_KIND_HERO]);
  });
});

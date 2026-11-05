import { describe, expect, it } from "vitest";
import { createImpGeometry, IMP_GEOMETRY_BASE_Y } from "./impGeometry";

describe("imp silhouette", () => {
  it("merges the parts into one bounded low-poly geometry", () => {
    const geometry = createImpGeometry();
    const position = geometry.getAttribute("position");
    expect(position.count).toBeGreaterThan(0);
    expect(position.count).toBeLessThanOrEqual(600);
    expect(geometry.groups.length).toBe(0);
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    expect(bounds).not.toBeNull();
    if (bounds === null) {
      return;
    }
    expect(bounds.min.y).toBeCloseTo(IMP_GEOMETRY_BASE_Y, 5);
    const height = bounds.max.y - bounds.min.y;
    expect(height).toBeGreaterThanOrEqual(0.7);
    expect(height).toBeLessThanOrEqual(0.74);
    expect(bounds.max.x - bounds.min.x).toBeLessThanOrEqual(0.6);
    expect(bounds.max.z - bounds.min.z).toBeLessThanOrEqual(0.6);
  });
});

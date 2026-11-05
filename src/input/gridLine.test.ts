import { describe, expect, it } from "vitest";
import type { TileKind } from "../sim";
import { matchesMode, sweepModeFor, type SweepMode } from "./bindCamera";
import { walkGridLine } from "./gridLine";

type Point = { x: number; y: number };

function collect(fromX: number, fromY: number, toX: number, toY: number): Point[] {
  const points: Point[] = [];
  walkGridLine(fromX, fromY, toX, toY, (x, y) => {
    points.push({ x, y });
  });
  return points;
}

function expectContiguous(points: Point[], from: Point, to: Point): void {
  expect(points.length).toBeGreaterThan(0);
  expect(points[0]).toEqual(from);
  expect(points[points.length - 1]).toEqual(to);
  const seen = new Set<string>();
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (point === undefined) {
      throw new Error("missing point");
    }
    const key = `${String(point.x)},${String(point.y)}`;
    expect(seen.has(key)).toBe(false);
    seen.add(key);
    if (i === 0) {
      continue;
    }
    const previous = points[i - 1];
    if (previous === undefined) {
      throw new Error("missing previous point");
    }
    expect(Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y)).toBe(1);
  }
}

describe("grid line", () => {
  it("visits a single tile when the line does not move", () => {
    const points = collect(3, 4, 3, 4);
    expect(points).toEqual([{ x: 3, y: 4 }]);
  });

  it("walks a horizontal line without gaps", () => {
    const points = collect(2, 5, 7, 5);
    expect(points).toHaveLength(6);
    expectContiguous(points, { x: 2, y: 5 }, { x: 7, y: 5 });
  });

  it("walks a vertical line without gaps", () => {
    const points = collect(4, 1, 4, 8);
    expect(points).toHaveLength(8);
    expectContiguous(points, { x: 4, y: 1 }, { x: 4, y: 8 });
  });

  it("walks a diagonal line through a 4-connected staircase", () => {
    const points = collect(0, 0, 3, 3);
    expect(points).toHaveLength(7);
    expectContiguous(points, { x: 0, y: 0 }, { x: 3, y: 3 });
  });

  it("walks a steep line without gaps", () => {
    const points = collect(1, 2, 4, 11);
    expect(points).toHaveLength(13);
    expectContiguous(points, { x: 1, y: 2 }, { x: 4, y: 11 });
  });

  it("walks in the reversed direction", () => {
    const points = collect(7, 5, 2, 5);
    expect(points).toHaveLength(6);
    expectContiguous(points, { x: 7, y: 5 }, { x: 2, y: 5 });
  });

  it("walks a long jump with no duplicates", () => {
    const points = collect(0, 0, 9, 3);
    expect(points).toHaveLength(13);
    expectContiguous(points, { x: 0, y: 0 }, { x: 9, y: 3 });
  });

  it("tags every tile between a press and one far move", () => {
    const width = 16;
    const height = 16;
    const kinds: TileKind[] = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        kinds.push("earth");
      }
    }
    const tagged: Point[] = [];
    const swept = new Set<string>();
    let mode: SweepMode;
    const from = { x: 2, y: 3 };
    const to = { x: 11, y: 3 };
    walkGridLine(from.x, from.y, to.x, to.y, (x, y) => {
      const key = `${String(x)},${String(y)}`;
      if (swept.has(key)) {
        return;
      }
      swept.add(key);
      const kind = kinds[y * width + x];
      if (kind === undefined) {
        throw new Error("missing tile kind");
      }
      if (mode === undefined) {
        mode = sweepModeFor(kind);
      }
      if (mode === undefined) {
        return;
      }
      if (!matchesMode(kind, mode)) {
        return;
      }
      tagged.push({ x, y });
    });
    expect(tagged).toHaveLength(10);
    for (let x = from.x; x <= to.x; x += 1) {
      expect(tagged).toContainEqual({ x, y: 3 });
    }
  });
});

import { describe, expect, it } from "vitest";
import { max, median, percentile } from "./stats";

describe("perf statistics", () => {
  it("computes the median for odd and even samples", () => {
    expect(median([5])).toBe(5);
    expect(median([9, 1, 5])).toBe(5);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([40, 10, 30, 20])).toBe(25);
  });

  it("computes nearest-rank percentiles", () => {
    const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(samples, 0)).toBe(1);
    expect(percentile(samples, 50)).toBe(5);
    expect(percentile(samples, 95)).toBe(10);
    expect(percentile(samples, 100)).toBe(10);
  });

  it("returns the maximum sample", () => {
    expect(max([3, 9, 1])).toBe(9);
    expect(max([-4])).toBe(-4);
  });

  it("rejects empty samples", () => {
    expect(() => median([])).toThrow();
    expect(() => percentile([], 95)).toThrow();
    expect(() => max([])).toThrow();
  });

  it("rejects percentiles outside the range", () => {
    expect(() => percentile([1], -1)).toThrow();
    expect(() => percentile([1], 101)).toThrow();
  });
});

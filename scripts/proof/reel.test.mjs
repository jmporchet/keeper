import { describe, expect, it } from "vitest";
import {
  allocateWindows,
  buildConcatArgs,
  buildConcatList,
  buildCutArgs,
  MAX_TOTAL_MS,
  MIN_TOTAL_MS,
} from "./reel.mjs";

function clip(name, windowMs) {
  return { name, windowMs };
}

function totalMs(allocations) {
  let total = 0;
  for (const allocation of allocations) {
    total += allocation.outputMs;
  }
  return total;
}

describe("proof reel budget", () => {
  it("keeps a reel inside the 10-20 s bounds and targets 13 s", () => {
    const clips = [
      clip("digClaim", 2500),
      clip("hand", 2500),
      clip("pause", 2500),
      clip("treasury", 2500),
      clip("lair", 2500),
      clip("hatchery", 2500),
      clip("saveReplay", 2500),
      clip("panelPerf", 2500),
    ];
    const allocations = allocateWindows(clips, { targetMs: 13000 });
    expect(totalMs(allocations)).toBe(13000);
    expect(totalMs(allocations)).toBeGreaterThanOrEqual(MIN_TOTAL_MS);
    expect(totalMs(allocations)).toBeLessThanOrEqual(MAX_TOTAL_MS);
    expect(allocations.map((allocation) => allocation.name)).toEqual(clips.map((entry) => entry.name));
    for (const allocation of allocations) {
      expect(allocation.outputMs).toBeGreaterThanOrEqual(1000);
      expect(allocation.sourceStartMs + allocation.outputMs).toBe(allocation.sourceEndMs);
    }
  });

  it("keeps every clip when the footage already fits the reel bounds", () => {
    const clips = [clip("a", 4000), clip("b", 4000), clip("c", 4000)];
    const allocations = allocateWindows(clips, { targetMs: 13000 });
    expect(allocations.map((allocation) => allocation.outputMs)).toEqual([4000, 4000, 4000]);
    expect(totalMs(allocations)).toBe(12000);
  });

  it("shortens a long clip and keeps registry order", () => {
    const clips = [clip("long", 15000), clip("short", 5000)];
    const allocations = allocateWindows(clips, { targetMs: 13000 });
    expect(allocations[0].name).toBe("long");
    expect(allocations[1].name).toBe("short");
    expect(allocations[0].outputMs).toBeLessThan(15000);
    expect(allocations[0].outputMs).toBeLessThanOrEqual(6500);
    expect(allocations[0].sourceStartMs).toBeGreaterThan(0);
    expect(allocations[1].outputMs).toBeLessThanOrEqual(5000);
    expect(totalMs(allocations)).toBeGreaterThanOrEqual(MIN_TOTAL_MS);
    expect(totalMs(allocations)).toBeLessThanOrEqual(MAX_TOTAL_MS);
  });

  it("clamps the target to the hard reel bounds", () => {
    const clips = [clip("a", 8000), clip("b", 8000), clip("c", 8000)];
    const high = allocateWindows(clips, { targetMs: 25000 });
    expect(totalMs(high)).toBe(MAX_TOTAL_MS);
    const low = allocateWindows(clips, { targetMs: 5000 });
    expect(totalMs(low)).toBe(MIN_TOTAL_MS);
  });

  it("rejects too little footage", () => {
    const clips = [
      clip("a", 1000),
      clip("b", 1000),
      clip("c", 1000),
      clip("d", 1000),
      clip("e", 1000),
      clip("f", 1000),
      clip("g", 1000),
      clip("h", 1000),
    ];
    expect(() => allocateWindows(clips, { targetMs: 13000 })).toThrow(/under 10000 ms/);
  });

  it("rejects a clip window under one second", () => {
    const clips = [clip("a", 9000), clip("b", 999)];
    expect(() => allocateWindows(clips, { targetMs: 13000 })).toThrow(/under 1000 ms/);
  });

  it("builds ffmpeg cut arguments", () => {
    const args = buildCutArgs({
      input: "proof/tmp/a/recording.webm",
      output: "proof/tmp/cut/a.mp4",
      startMs: 1500,
      endMs: 3500,
    });
    expect(args).toContain("-ss");
    expect(args).toContain("1.500");
    expect(args).toContain("-to");
    expect(args).toContain("3.500");
    expect(args).toContain("libx264");
    expect(args).toContain("yuv420p");
    expect(args).toContain("25");
    expect(args).toContain("1280x720");
    expect(args.at(-1)).toBe("proof/tmp/cut/a.mp4");
  });

  it("builds ffmpeg concat arguments and list entries", () => {
    const args = buildConcatArgs({
      listPath: "proof/tmp/concat.txt",
      output: "proof/play.mp4",
    });
    expect(args).toContain("-f");
    expect(args).toContain("concat");
    expect(args).toContain("-safe");
    expect(args).toContain("0");
    expect(args).toContain("+faststart");
    expect(args.at(-1)).toBe("proof/play.mp4");
    const list = buildConcatList([{ file: "proof/tmp/cut/a.mp4" }, { file: "proof/tmp/cut/b.mp4" }]);
    expect(list).toBe("file 'proof/tmp/cut/a.mp4'\nfile 'proof/tmp/cut/b.mp4'\n");
  });
});

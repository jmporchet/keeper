import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  applyHeldKeys,
  applyOrbit,
  applyPan,
  applyPanPixels,
  applyZoom,
  clampPose,
  createCameraPose,
  eyeFromPose,
  MAX_DISTANCE,
  MAX_PITCH,
  MIN_DISTANCE,
  MIN_PITCH,
  TARGET_MAX_X,
  TARGET_MAX_Z,
  TARGET_MIN_X,
  TARGET_MIN_Z,
  type CameraPose,
} from "./pose";

function onMap(pose: CameraPose): void {
  expect(pose.targetX).toBeGreaterThanOrEqual(TARGET_MIN_X);
  expect(pose.targetX).toBeLessThanOrEqual(TARGET_MAX_X);
  expect(pose.targetZ).toBeGreaterThanOrEqual(TARGET_MIN_Z);
  expect(pose.targetZ).toBeLessThanOrEqual(TARGET_MAX_Z);
}

function withinLimits(pose: CameraPose): void {
  onMap(pose);
  expect(pose.pitch).toBeGreaterThanOrEqual(MIN_PITCH);
  expect(pose.pitch).toBeLessThanOrEqual(MAX_PITCH);
  expect(pose.distance).toBeGreaterThanOrEqual(MIN_DISTANCE);
  expect(pose.distance).toBeLessThanOrEqual(MAX_DISTANCE);
}

describe("camera pose", () => {
  it("starts looking at the map centre within pitch and zoom limits", () => {
    const pose = createCameraPose();
    withinLimits(pose);
    expect(pose.targetX).toBe(0);
    expect(pose.targetZ).toBe(0);
    const eye = eyeFromPose(pose);
    expect(eye.y).toBeGreaterThan(0);
  });

  it("clamps the target to the map after a huge pan", () => {
    const pose = createCameraPose();
    applyPan(pose, 10000, 10000);
    onMap(pose);
    expect(pose.targetX === TARGET_MIN_X || pose.targetX === TARGET_MAX_X).toBe(true);
    applyPan(pose, -20000, -20000);
    onMap(pose);
  });

  it("clamps pitch when orbiting vertically", () => {
    const pose = createCameraPose();
    applyOrbit(pose, 0, -100000);
    expect(pose.pitch).toBe(MAX_PITCH);
    applyOrbit(pose, 0, 100000);
    expect(pose.pitch).toBe(MIN_PITCH);
  });

  it("clamps zoom at both ends", () => {
    const pose = createCameraPose();
    applyZoom(pose, -100000);
    expect(pose.distance).toBe(MIN_DISTANCE);
    applyZoom(pose, 100000);
    expect(pose.distance).toBe(MAX_DISTANCE);
  });

  it("pixel pan and held WASD stay on the map", () => {
    const pose = createCameraPose();
    applyPanPixels(pose, 50000, -50000);
    onMap(pose);
    applyHeldKeys(pose, { w: true, a: true, s: true, d: true });
    onMap(pose);
  });

  it("keeps the target on the map after 1000 random inputs", () => {
    const kind = fc.constantFrom("orbit", "pan", "panPixels", "zoom", "wasd");
    const input = fc.record({
      kind,
      a: fc.double({ min: -1e6, max: 1e6, noNaN: true }),
      b: fc.double({ min: -1e6, max: 1e6, noNaN: true }),
      w: fc.boolean(),
      aKey: fc.boolean(),
      s: fc.boolean(),
      d: fc.boolean(),
    });
    fc.assert(
      fc.property(fc.array(input, { minLength: 1000, maxLength: 1000 }), (ops) => {
        const pose = createCameraPose();
        for (const op of ops) {
          switch (op.kind) {
            case "orbit":
              applyOrbit(pose, op.a, op.b);
              break;
            case "pan":
              applyPan(pose, op.a, op.b);
              break;
            case "panPixels":
              applyPanPixels(pose, op.a, op.b);
              break;
            case "zoom":
              applyZoom(pose, op.a);
              break;
            case "wasd":
              applyHeldKeys(pose, { w: op.w, a: op.aKey, s: op.s, d: op.d });
              break;
            default: {
              const never: never = op.kind;
              return never;
            }
          }
        }
        withinLimits(pose);
        clampPose(pose);
        withinLimits(pose);
      }),
      { numRuns: 10 },
    );
  });
});

import { MAP_HEIGHT, MAP_HALF, MAP_WIDTH } from "../sim";

export const MIN_PITCH = 0.2;
export const MAX_PITCH = 1.35;
export const MIN_DISTANCE = 12;
export const MAX_DISTANCE = 90;
export const TARGET_MIN_X = -MAP_HALF;
export const TARGET_MAX_X = MAP_WIDTH - MAP_HALF;
export const TARGET_MIN_Z = -MAP_HALF;
export const TARGET_MAX_Z = MAP_HEIGHT - MAP_HALF;
export const ORBIT_SENSITIVITY = 0.005;
export const PAN_PIXEL_SENSITIVITY = 0.045;
export const PAN_KEY_SPEED = 0.55;
export const ZOOM_SENSITIVITY = 0.035;

export type CameraPose = {
  targetX: number;
  targetZ: number;
  yaw: number;
  pitch: number;
  distance: number;
};

export function createCameraPose(): CameraPose {
  return {
    targetX: 0,
    targetZ: 0,
    yaw: 0.7,
    pitch: 0.95,
    distance: 56,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export function clampPose(pose: CameraPose): void {
  pose.targetX = clamp(pose.targetX, TARGET_MIN_X, TARGET_MAX_X);
  pose.targetZ = clamp(pose.targetZ, TARGET_MIN_Z, TARGET_MAX_Z);
  pose.pitch = clamp(pose.pitch, MIN_PITCH, MAX_PITCH);
  pose.distance = clamp(pose.distance, MIN_DISTANCE, MAX_DISTANCE);
}

export function applyOrbit(pose: CameraPose, dx: number, dy: number): void {
  pose.yaw += dx * ORBIT_SENSITIVITY;
  pose.pitch -= dy * ORBIT_SENSITIVITY;
  clampPose(pose);
}

export function applyPan(pose: CameraPose, right: number, forward: number): void {
  const sy = Math.sin(pose.yaw);
  const cy = Math.cos(pose.yaw);
  pose.targetX += right * cy + forward * sy;
  pose.targetZ += -right * sy + forward * cy;
  clampPose(pose);
}

export function applyPanPixels(pose: CameraPose, dx: number, dy: number): void {
  const scale = PAN_PIXEL_SENSITIVITY * (pose.distance / 40);
  applyPan(pose, -dx * scale, dy * scale);
}

export function applyZoom(pose: CameraPose, wheelDelta: number): void {
  pose.distance += wheelDelta * ZOOM_SENSITIVITY;
  clampPose(pose);
}

export function applyHeldKeys(
  pose: CameraPose,
  held: { w: boolean; a: boolean; s: boolean; d: boolean },
): void {
  let right = 0;
  let forward = 0;
  if (held.w) {
    forward -= PAN_KEY_SPEED;
  }
  if (held.s) {
    forward += PAN_KEY_SPEED;
  }
  if (held.a) {
    right -= PAN_KEY_SPEED;
  }
  if (held.d) {
    right += PAN_KEY_SPEED;
  }
  if (right === 0 && forward === 0) {
    return;
  }
  applyPan(pose, right, forward);
}

export function eyeFromPose(pose: CameraPose): { x: number; y: number; z: number } {
  const cp = Math.cos(pose.pitch);
  const sp = Math.sin(pose.pitch);
  const sy = Math.sin(pose.yaw);
  const cy = Math.cos(pose.yaw);
  return {
    x: pose.targetX + sy * cp * pose.distance,
    y: sp * pose.distance,
    z: pose.targetZ + cy * cp * pose.distance,
  };
}

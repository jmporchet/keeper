import * as THREE from "three";
import { HEART_X, HEART_Y, MAP_HALF, ROOM_KIND, type World } from "../sim";

export const DUNGEON_EXPOSURE = 1.05;
export const FOG_ENABLED = true;
export const FOG_COLOR = 0x0b0806;
export const FOG_DENSITY = 0.012;
export const TORCH_LIGHT_COUNT = 6;
export const TORCH_LIGHT_COLOR = 0xff8a3c;
export const TORCH_LIGHT_INTENSITY = 14;
export const TORCH_LIGHT_DISTANCE = 12;
export const TORCH_LIGHT_DECAY = 2;
export const TORCH_LIGHT_HEIGHT = 2;
export const HEART_LIGHT_COLOR = 0xffb060;
export const HEART_LIGHT_INTENSITY = 28;
export const HEART_LIGHT_DISTANCE = 18;
export const HEART_LIGHT_HEIGHT = 3;

const TORCH_ROOM_KINDS = [
  ROOM_KIND.treasury,
  ROOM_KIND.lair,
  ROOM_KIND.hatchery,
  ROOM_KIND.training,
  ROOM_KIND.workshop,
  ROOM_KIND.library,
] as const;

export type TorchLightPool = {
  readonly lights: THREE.PointLight[];
  readonly heart: THREE.PointLight;
  readonly baseIntensities: Float32Array;
  syncedRoomsVersion: number;
};

export function createTorchLighting(scene: THREE.Scene): TorchLightPool {
  scene.add(new THREE.HemisphereLight(0x4a4038, 0x080604, 0.35));
  scene.add(new THREE.AmbientLight(0x1a1512, 0.25));
  const heart = new THREE.PointLight(HEART_LIGHT_COLOR, HEART_LIGHT_INTENSITY, HEART_LIGHT_DISTANCE, TORCH_LIGHT_DECAY);
  heart.position.set(HEART_X - MAP_HALF, HEART_LIGHT_HEIGHT, HEART_Y - MAP_HALF);
  scene.add(heart);
  if (FOG_ENABLED) {
    scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);
  }
  const lights: THREE.PointLight[] = [];
  const baseIntensities = new Float32Array(TORCH_LIGHT_COUNT);
  for (let i = 0; i < TORCH_LIGHT_COUNT; i += 1) {
    const light = new THREE.PointLight(TORCH_LIGHT_COLOR, 0, TORCH_LIGHT_DISTANCE, TORCH_LIGHT_DECAY);
    light.position.set(HEART_X - MAP_HALF, TORCH_LIGHT_HEIGHT, HEART_Y - MAP_HALF);
    light.visible = false;
    scene.add(light);
    lights.push(light);
  }
  return { lights, heart, baseIntensities, syncedRoomsVersion: -1 };
}

function roomAnchorTile(world: World, roomKind: number): number {
  for (let i = 0; i < world.rooms.length; i += 1) {
    const room = world.rooms[i];
    if (room === roomKind) {
      return i;
    }
  }
  return -1;
}

export function syncTorchLights(world: World, pool: TorchLightPool): void {
  if (pool.syncedRoomsVersion === world.roomsVersion) {
    return;
  }
  pool.syncedRoomsVersion = world.roomsVersion;
  for (let slot = 0; slot < pool.lights.length; slot += 1) {
    const light = pool.lights[slot];
    if (light === undefined) {
      continue;
    }
    const roomKind = TORCH_ROOM_KINDS[slot];
    if (roomKind === undefined) {
      continue;
    }
    const tile = roomAnchorTile(world, roomKind);
    if (tile < 0) {
      pool.baseIntensities[slot] = 0;
      light.intensity = 0;
      light.visible = false;
      continue;
    }
    const y = (tile / world.width) | 0;
    const x = tile - y * world.width;
    light.position.set(x - MAP_HALF, TORCH_LIGHT_HEIGHT, y - MAP_HALF);
    pool.baseIntensities[slot] = TORCH_LIGHT_INTENSITY;
    light.intensity = TORCH_LIGHT_INTENSITY;
    light.visible = true;
  }
}

export function flickerTorchLights(pool: TorchLightPool, time: number): void {
  pool.heart.intensity = HEART_LIGHT_INTENSITY * (0.94 + 0.06 * Math.sin(time * 2.7));
  for (let i = 0; i < pool.lights.length; i += 1) {
    const base = pool.baseIntensities[i];
    const light = pool.lights[i];
    if (base === undefined || base === 0 || light === undefined) {
      continue;
    }
    light.intensity = base * (0.9 + 0.1 * Math.sin(time * 3.1 + i * 1.7));
  }
}

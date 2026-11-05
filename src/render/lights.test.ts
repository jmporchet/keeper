import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  asTick,
  asTileIndex,
  createWorld,
  HEART_X,
  HEART_Y,
  MAP_HALF,
  MAP_WIDTH,
  sortCommands,
  step,
} from "../sim";
import {
  createTorchLighting,
  syncTorchLights,
  TORCH_LIGHT_COLOR,
  TORCH_LIGHT_COUNT,
  TORCH_LIGHT_DECAY,
  TORCH_LIGHT_DISTANCE,
  TORCH_LIGHT_INTENSITY,
  type TorchLightPool,
} from "./lights";

function lightAt(pool: TorchLightPool, index: number): THREE.PointLight {
  const light = pool.lights[index];
  if (light === undefined) {
    throw new Error("missing torch light");
  }
  return light;
}

function pointLightCount(scene: THREE.Scene): number {
  return scene.children.filter((child) => child instanceof THREE.PointLight).length;
}

describe("torch light pool", () => {
  it("allocates a fixed pool and leaves unused lights dark", () => {
    const world = createWorld(1);
    const scene = new THREE.Scene();
    const pool = createTorchLighting(scene);
    expect(pool.lights).toHaveLength(TORCH_LIGHT_COUNT);
    expect(pointLightCount(scene)).toBe(TORCH_LIGHT_COUNT + 1);
    syncTorchLights(world, pool);
    for (let i = 0; i < TORCH_LIGHT_COUNT; i += 1) {
      const light = lightAt(pool, i);
      expect(light.intensity).toBe(0);
      expect(light.visible).toBe(false);
      expect(light.color.getHex()).toBe(TORCH_LIGHT_COLOR);
      expect(light.distance).toBe(TORCH_LIGHT_DISTANCE);
      expect(light.decay).toBe(TORCH_LIGHT_DECAY);
    }
    expect(pool.heart.position.x).toBe(HEART_X - MAP_HALF);
    expect(pool.heart.position.z).toBe(HEART_Y - MAP_HALF);
    expect(pool.heart.intensity).toBeGreaterThan(0);
  });

  it("syncs lit pool lights from room anchors", () => {
    const world = createWorld(1);
    const tick = asTick(world.tick);
    step(
      world,
      sortCommands([
        { kind: "addGold", tick, amount: 1000 },
        { kind: "paintRoom", tick, tile: asTileIndex(30 * MAP_WIDTH + 30), room: "treasury" },
        { kind: "paintRoom", tick, tile: asTileIndex(31 * MAP_WIDTH + 30), room: "lair" },
      ]),
    );
    const scene = new THREE.Scene();
    const pool = createTorchLighting(scene);
    syncTorchLights(world, pool);
    const treasury = lightAt(pool, 0);
    expect(treasury.visible).toBe(true);
    expect(treasury.intensity).toBe(TORCH_LIGHT_INTENSITY);
    expect(treasury.position.x).toBe(30 - MAP_HALF);
    expect(treasury.position.z).toBe(30 - MAP_HALF);
    const lair = lightAt(pool, 1);
    expect(lair.visible).toBe(true);
    expect(lair.intensity).toBe(TORCH_LIGHT_INTENSITY);
    expect(lair.position.x).toBe(30 - MAP_HALF);
    expect(lair.position.z).toBe(31 - MAP_HALF);
    for (let i = 2; i < TORCH_LIGHT_COUNT; i += 1) {
      const light = lightAt(pool, i);
      expect(light.intensity).toBe(0);
      expect(light.visible).toBe(false);
    }
  });

  it("reuses the same lights when rooms change", () => {
    const world = createWorld(1);
    const tick = asTick(world.tick);
    const nextTick = asTick(world.tick + 1);
    const commands = sortCommands([
      { kind: "addGold", tick, amount: 1000 },
      { kind: "paintRoom", tick, tile: asTileIndex(30 * MAP_WIDTH + 30), room: "treasury" },
      { kind: "paintRoom", tick: nextTick, tile: asTileIndex(30 * MAP_WIDTH + 31), room: "lair" },
    ]);
    step(world, commands);
    const scene = new THREE.Scene();
    const pool = createTorchLighting(scene);
    syncTorchLights(world, pool);
    const lights = pool.lights;
    const heart = pool.heart;
    const pointLights = pointLightCount(scene);
    step(world, commands);
    syncTorchLights(world, pool);
    expect(pool.lights).toBe(lights);
    expect(pool.heart).toBe(heart);
    expect(pointLightCount(scene)).toBe(pointLights);
    for (let i = 0; i < TORCH_LIGHT_COUNT; i += 1) {
      expect(lightAt(pool, i)).toBe(lights[i]);
    }
    expect(lightAt(pool, 1).intensity).toBe(TORCH_LIGHT_INTENSITY);
  });
});

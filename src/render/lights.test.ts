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
  AMBIENT_LIGHT_COLOR,
  AMBIENT_LIGHT_INTENSITY,
  createTorchLighting,
  DUNGEON_EXPOSURE,
  FOG_COLOR,
  FOG_DENSITY,
  FOG_ENABLED,
  HEART_LIGHT_DISTANCE,
  HEMISPHERE_GROUND_COLOR,
  HEMISPHERE_LIGHT_INTENSITY,
  HEMISPHERE_SKY_COLOR,
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

  it("exports the tuned fill, fog and light constants", () => {
    expect(DUNGEON_EXPOSURE).toBe(1.2);
    expect(HEMISPHERE_LIGHT_INTENSITY).toBe(1.0);
    expect(AMBIENT_LIGHT_INTENSITY).toBe(1.0);
    expect(FOG_ENABLED).toBe(true);
    expect(FOG_COLOR).toBe(0x140f0b);
    expect(FOG_DENSITY).toBe(0.008);
    expect(TORCH_LIGHT_INTENSITY).toBe(16);
    expect(TORCH_LIGHT_DISTANCE).toBe(16);
    expect(HEART_LIGHT_DISTANCE).toBe(26);
    expect(AMBIENT_LIGHT_COLOR).toBe(0x8a7a6a);
    expect(HEMISPHERE_SKY_COLOR).toBe(0x8a7a6a);
    expect(HEMISPHERE_GROUND_COLOR).toBe(0x2a2018);
  });

  it("configures scene fog and fill lights from the exported constants", () => {
    const scene = new THREE.Scene();
    createTorchLighting(scene);
    expect(FOG_ENABLED).toBe(true);
    if (FOG_ENABLED) {
      expect(scene.fog).toBeInstanceOf(THREE.FogExp2);
      expect((scene.fog as THREE.FogExp2).density).toBe(FOG_DENSITY);
      expect((scene.fog as THREE.FogExp2).color.getHex()).toBe(FOG_COLOR);
    } else {
      expect(scene.fog).toBeNull();
    }
    const hemisphere = scene.children.find((child) => child instanceof THREE.HemisphereLight);
    const ambient = scene.children.find((child) => child instanceof THREE.AmbientLight);
    expect(hemisphere).toBeInstanceOf(THREE.HemisphereLight);
    expect(ambient).toBeInstanceOf(THREE.AmbientLight);
    expect((hemisphere as THREE.HemisphereLight).intensity).toBe(HEMISPHERE_LIGHT_INTENSITY);
    expect((hemisphere as THREE.HemisphereLight).color.getHex()).toBe(HEMISPHERE_SKY_COLOR);
    expect((hemisphere as THREE.HemisphereLight).groundColor.getHex()).toBe(HEMISPHERE_GROUND_COLOR);
    expect((ambient as THREE.AmbientLight).intensity).toBe(AMBIENT_LIGHT_INTENSITY);
    expect((ambient as THREE.AmbientLight).color.getHex()).toBe(AMBIENT_LIGHT_COLOR);
  });
});

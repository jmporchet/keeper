import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  asTileIndex,
  createChicken,
  createCreature,
  createWorld,
  MAP_WIDTH,
  ROOM_KIND,
  TREASURY_CAPACITY,
  type ChickenSlot,
  type CreatureSlot,
} from "../sim";
import { PROPS_CAPACITY, createPropMeshes, type PropMeshes } from "./props";
import { syncPropInstances } from "./props.hot";

function makeVisual(): PropMeshes {
  return createPropMeshes(new THREE.Scene());
}

function sync(
  world: ReturnType<typeof createWorld>,
  chickens: ChickenSlot[],
  creatures: CreatureSlot[],
  visual: PropMeshes,
): void {
  syncPropInstances(
    world.rooms,
    world.treasuryStock,
    MAP_WIDTH,
    chickens,
    creatures,
    visual.mesh,
    visual.dummy,
    visual.color,
  );
}

function instanceHex(mesh: THREE.InstancedMesh, index: number): number {
  const color = new THREE.Color();
  mesh.getColorAt(index, color);
  return color.getHex();
}

function instanceScale(mesh: THREE.InstancedMesh, index: number): number {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, rotation, scale);
  return scale.length();
}

describe("room props packing", () => {
  it("emits a multi-box gold pile for a stocked treasury tile and none for empty stock", () => {
    const world = createWorld(1);
    const tile = 30 * MAP_WIDTH + 30;
    world.rooms[tile] = ROOM_KIND.treasury;
    world.treasuryStock[tile] = TREASURY_CAPACITY;
    const visual = makeVisual();
    sync(world, [], [], visual);
    expect(visual.mesh.count).toBeGreaterThan(1);
    expect(visual.mesh.count).toBeLessThanOrEqual(PROPS_CAPACITY);
    const gold = new THREE.Color();
    visual.mesh.getColorAt(0, gold);
    expect(gold.b).toBeLessThan(gold.r);
    expect(gold.b).toBeLessThan(gold.g);
    world.treasuryStock[tile] = 0;
    sync(world, [], [], visual);
    expect(visual.mesh.count).toBe(0);
  });

  it("emits mattress and pillow instances for an occupied bed and none for an empty slot", () => {
    const world = createWorld(1);
    const bedTile = asTileIndex(30 * MAP_WIDTH + 31);
    world.rooms[bedTile] = ROOM_KIND.lair;
    const creature = createCreature(0, 30, 31, bedTile, "fly");
    const creatures: CreatureSlot[] = [{ kind: "live", creature }];
    const visual = makeVisual();
    sync(world, [], creatures, visual);
    expect(visual.mesh.count).toBe(2);
    expect(instanceHex(visual.mesh, 0)).not.toBe(instanceHex(visual.mesh, 1));
    const empty: CreatureSlot[] = [{ kind: "empty" }];
    sync(world, [], empty, visual);
    expect(visual.mesh.count).toBe(0);
  });

  it("emits body, head and beak instances for a live chicken and none for an empty slot", () => {
    const world = createWorld(1);
    const hatcheryTile = asTileIndex(30 * MAP_WIDTH + 32);
    world.rooms[hatcheryTile] = ROOM_KIND.hatchery;
    const chickens: ChickenSlot[] = [{ kind: "live", chicken: createChicken(0, hatcheryTile) }];
    const visual = makeVisual();
    sync(world, chickens, [], visual);
    expect(visual.mesh.count).toBe(3);
    expect(instanceHex(visual.mesh, 0)).not.toBe(instanceHex(visual.mesh, 1));
    expect(instanceHex(visual.mesh, 1)).not.toBe(instanceHex(visual.mesh, 2));
    const empty: ChickenSlot[] = [{ kind: "empty" }];
    sync(world, empty, [], visual);
    expect(visual.mesh.count).toBe(0);
  });

  it("keeps treasury, bed and chicken colors and scales distinct", () => {
    const treasuryWorld = createWorld(1);
    const treasuryTile = 30 * MAP_WIDTH + 30;
    treasuryWorld.rooms[treasuryTile] = ROOM_KIND.treasury;
    treasuryWorld.treasuryStock[treasuryTile] = TREASURY_CAPACITY;
    const treasuryVisual = makeVisual();
    sync(treasuryWorld, [], [], treasuryVisual);

    const bedWorld = createWorld(1);
    const bedTile = asTileIndex(30 * MAP_WIDTH + 31);
    bedWorld.rooms[bedTile] = ROOM_KIND.lair;
    const creatures: CreatureSlot[] = [
      { kind: "live", creature: createCreature(0, 30, 31, bedTile, "fly") },
    ];
    const bedVisual = makeVisual();
    sync(bedWorld, [], creatures, bedVisual);

    const chickenWorld = createWorld(1);
    const hatcheryTile = asTileIndex(30 * MAP_WIDTH + 32);
    chickenWorld.rooms[hatcheryTile] = ROOM_KIND.hatchery;
    const chickens: ChickenSlot[] = [{ kind: "live", chicken: createChicken(0, hatcheryTile) }];
    const chickenVisual = makeVisual();
    sync(chickenWorld, chickens, [], chickenVisual);

    const treasuryHex = instanceHex(treasuryVisual.mesh, 0);
    const bedHex = instanceHex(bedVisual.mesh, 0);
    const chickenHex = instanceHex(chickenVisual.mesh, 0);
    expect(treasuryHex).not.toBe(bedHex);
    expect(bedHex).not.toBe(chickenHex);
    expect(chickenHex).not.toBe(treasuryHex);

    const treasuryScale = instanceScale(treasuryVisual.mesh, 0);
    const bedScale = instanceScale(bedVisual.mesh, 0);
    const chickenScale = instanceScale(chickenVisual.mesh, 0);
    expect(treasuryScale).not.toBeCloseTo(bedScale, 5);
    expect(bedScale).not.toBeCloseTo(chickenScale, 5);
    expect(chickenScale).not.toBeCloseTo(treasuryScale, 5);
  });

  it("stays within capacity when every tile is a full treasury", () => {
    const world = createWorld(1);
    world.rooms.fill(ROOM_KIND.treasury);
    world.treasuryStock.fill(TREASURY_CAPACITY);
    const visual = makeVisual();
    sync(world, [], [], visual);
    expect(visual.mesh.count).toBeGreaterThan(0);
    expect(visual.mesh.count).toBeLessThanOrEqual(PROPS_CAPACITY);
    expect(visual.mesh.count).toBeLessThanOrEqual(visual.mesh.instanceMatrix.count);
  });

  it("draws small markers on training, workshop and library tiles", () => {
    const world = createWorld(1);
    const trainingTile = 30 * MAP_WIDTH + 30;
    const workshopTile = 30 * MAP_WIDTH + 31;
    const libraryTile = 30 * MAP_WIDTH + 32;
    world.rooms[trainingTile] = ROOM_KIND.training;
    world.rooms[workshopTile] = ROOM_KIND.workshop;
    world.rooms[libraryTile] = ROOM_KIND.library;
    const visual = makeVisual();
    sync(world, [], [], visual);
    expect(visual.mesh.count).toBe(4);
  });
});

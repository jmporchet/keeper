import * as THREE from "three";
import { CREATURE_CAPACITY, HERO_CAPACITY, type CreatureBoard, type HeroBoard } from "../sim";
import { createCreatureGeometry } from "./creatureGeometry";
import { syncCreatureInstances } from "./creatures.hot";

export type CreatureMeshes = {
  mesh: THREE.InstancedMesh;
  kind: THREE.InstancedBufferAttribute;
  dummy: THREE.Object3D;
  color: THREE.Color;
};

function createCreatureMaterial(): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float aKind;\nattribute float aCreatureKind;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nif (abs(aKind - aCreatureKind) > 0.5) {\n\ttransformed = vec3(0.0, -1000.0, 0.0);\n}",
      );
  };
  return material;
}

export function createCreatureMeshes(scene: THREE.Scene): CreatureMeshes {
  const capacity = CREATURE_CAPACITY + HERO_CAPACITY;
  const geometry = createCreatureGeometry();
  const kind = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  geometry.setAttribute("aCreatureKind", kind);
  const material = createCreatureMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.count = 0;
  mesh.visible = false;
  mesh.frustumCulled = false;
  const color = new THREE.Color(0xffffff);
  for (let i = 0; i < capacity; i += 1) {
    mesh.setColorAt(i, color);
  }
  if (mesh.instanceColor !== null) {
    mesh.instanceColor.needsUpdate = true;
  }
  scene.add(mesh);
  return {
    mesh,
    kind,
    dummy: new THREE.Object3D(),
    color,
  };
}

export function syncCreatures(
  board: CreatureBoard,
  heroes: HeroBoard,
  alpha: number,
  visual: CreatureMeshes,
): void {
  syncCreatureInstances(
    board.slots,
    heroes.slots,
    alpha,
    visual.mesh,
    visual.kind,
    visual.dummy,
    visual.color,
  );
}

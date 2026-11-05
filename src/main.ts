import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { orbitPosition } from "./orbit";
import {
  createWorld,
  hashWorld,
  KIND_CLAIMED,
  KIND_DIRT,
  KIND_EARTH,
  KIND_GOLD_SEAM,
  KIND_ROCK,
  KIND_ROOM,
  KIND_TAGGED_EARTH,
  KIND_TAGGED_GOLD,
  MAP_HALF,
  MAX_FRAME_DELTA,
  MAX_STEPS_PER_FRAME,
  step,
  TICK_DT,
  type World,
} from "./sim";

declare global {
  interface Window {
    __keeper: { tick: number; hash: number; step(n: number): void };
  }
}

const canvas = document.createElement("canvas");
canvas.style.display = "block";
canvas.style.width = "100%";
canvas.style.height = "100%";
document.body.append(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0806);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
const lookAt = new THREE.Vector3(0, 0, 0);

const world = createWorld(1);
const meshes: THREE.Mesh[] = [];
const meshHeights = new Float32Array(world.width * world.height);

function colorFor(kind: number): number {
  switch (kind) {
    case KIND_GOLD_SEAM:
      return 0xc9a227;
    case KIND_TAGGED_GOLD:
      return 0xe8c547;
    case KIND_CLAIMED:
      return 0x6a5340;
    case KIND_ROOM:
      return 0x8a6a50;
    case KIND_DIRT:
      return 0x4a382c;
    case KIND_ROCK:
      return 0x1a1210;
    case KIND_TAGGED_EARTH:
      return 0x3d2a1c;
    case KIND_EARTH:
      return 0x2a1d14;
    default:
      return 0x2a1d14;
  }
}

function heightFor(kind: number): number {
  switch (kind) {
    case KIND_CLAIMED:
    case KIND_DIRT:
    case KIND_ROOM:
      return 0.2;
    case KIND_EARTH:
    case KIND_GOLD_SEAM:
    case KIND_ROCK:
    case KIND_TAGGED_EARTH:
    case KIND_TAGGED_GOLD:
      return 1;
    default:
      return 1;
  }
}

function addTileMesh(x: number, y: number, kind: number): void {
  const height = heightFor(kind);
  const geometry = new THREE.BoxGeometry(1, height, 1);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: colorFor(kind) }));
  const lx = x - MAP_HALF;
  const lz = y - MAP_HALF;
  mesh.position.set(lx, height / 2, lz);
  scene.add(mesh);
  meshes.push(mesh);
  meshHeights[meshes.length - 1] = height;
}

function syncTiles(from: World): void {
  for (let y = 0; y < from.height; y += 1) {
    for (let x = 0; x < from.width; x += 1) {
      const i = y * from.width + x;
      const kind = from.tiles[i];
      if (kind === undefined) {
        continue;
      }
      const mesh = meshes[i];
      if (mesh === undefined) {
        addTileMesh(x, y, kind);
        continue;
      }
      const height = heightFor(kind);
      const material = mesh.material;
      if (material instanceof THREE.MeshStandardMaterial) {
        material.color.setHex(colorFor(kind));
      }
      const base = meshHeights[i];
      if (base !== undefined && base > 0) {
        mesh.scale.set(1, height / base, 1);
      }
      mesh.position.y = height / 2;
    }
  }
}

syncTiles(world);

scene.add(new THREE.AmbientLight(0x3a3228, 0.4));
const torch = new THREE.PointLight(0xffbb77, 60, 24);
torch.position.set(0, 5, 0);
scene.add(torch);

const proof = new URLSearchParams(window.location.search).has("proof");

function placeCamera(tick: number): void {
  const pos = orbitPosition(tick);
  camera.position.set(pos.x, pos.y, pos.z);
  camera.lookAt(lookAt);
}

function render(): void {
  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (proof) {
    render();
  }
});

if (proof) {
  placeCamera(world.tick);
  render();
  window.__keeper = {
    get tick() {
      return world.tick;
    },
    get hash() {
      return hashWorld(world);
    },
    step(n: number) {
      for (let i = 0; i < n; i += 1) {
        step(world, []);
      }
      syncTiles(world);
      placeCamera(world.tick);
      render();
    },
  };
} else {
  placeCamera(0);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(lookAt);
  controls.update();
  let last = performance.now();
  let accumulator = 0;
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    let delta = (now - last) / 1000;
    last = now;
    if (delta > MAX_FRAME_DELTA) {
      delta = MAX_FRAME_DELTA;
    }
    accumulator += delta;
    let steps = 0;
    while (accumulator >= TICK_DT && steps < MAX_STEPS_PER_FRAME) {
      step(world, []);
      accumulator -= TICK_DT;
      steps += 1;
    }
    syncTiles(world);
    controls.update();
    render();
  };
  requestAnimationFrame(loop);
}

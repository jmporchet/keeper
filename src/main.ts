import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createActor } from "xstate";
import { appMachine, isPaused, isSimStepping } from "./app/appMachine";
import { orbitPosition } from "./orbit";
import {
  createWorld,
  hashWorld,
  MAP_HALF,
  MAX_FRAME_DELTA,
  MAX_STEPS_PER_FRAME,
  step,
  TICK_DT,
  tileKindAt,
  type TileKind,
  type World,
} from "./sim";

declare global {
  interface Window {
    __keeper: { tick: number; hash: number; step(n: number): void };
  }
}

const actor = createActor(appMachine);
actor.start();

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

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 400);
const lookAt = new THREE.Vector3(0, 0, 0);

const world = createWorld(1);
const meshes: THREE.Mesh[] = [];
const meshHeights = new Float32Array(world.width * world.height);

function colorFor(kind: TileKind): number {
  switch (kind) {
    case "goldSeam":
      return 0xc9a227;
    case "claimed":
      return 0x6a5340;
    case "earth":
      return 0x2a1d14;
    case "rock":
      return 0x121014;
    case "dirt":
      return 0x4a3728;
    case "room":
      return 0x8a6a48;
    default: {
      const never: never = kind;
      return never;
    }
  }
}

function heightFor(kind: TileKind): number {
  switch (kind) {
    case "claimed":
    case "dirt":
    case "room":
      return 0.2;
    case "earth":
    case "goldSeam":
      return 1;
    case "rock":
      return 1.4;
    default: {
      const never: never = kind;
      return never;
    }
  }
}

function addTileMesh(x: number, y: number, kind: TileKind): void {
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
      const kind = tileKindAt(from.tiles, i);
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

scene.add(new THREE.AmbientLight(0x3a3228, 0.55));
const torch = new THREE.PointLight(0xffbb77, 200, 80);
torch.position.set(0, 18, 0);
scene.add(torch);

const tickHud = document.getElementById("tick");
const pauseOverlay = document.getElementById("pause-overlay");

function syncHud(): void {
  if (tickHud !== null) {
    tickHud.textContent = `tick ${String(world.tick)}`;
  }
  if (pauseOverlay !== null) {
    pauseOverlay.classList.toggle("visible", isPaused(actor.getSnapshot()));
  }
}

actor.subscribe(() => {
  syncHud();
});

actor.send({ type: "ASSETS_REQUESTED" });
actor.send({ type: "ASSETS_READY" });
syncHud();

const proof = new URLSearchParams(window.location.search).has("proof");

function placeCamera(tick: number): void {
  const pos = orbitPosition(tick);
  camera.position.set(pos.x, pos.y, pos.z);
  camera.lookAt(lookAt);
}

function render(): void {
  if (actor.getSnapshot().matches("ContextLost")) {
    return;
  }
  renderer.render(scene, camera);
}

function togglePause(): void {
  const snapshot = actor.getSnapshot();
  if (snapshot.matches({ Sandbox: "Running" })) {
    actor.send({ type: "PAUSE" });
    return;
  }
  if (snapshot.matches({ Sandbox: "Paused" })) {
    actor.send({ type: "RESUME" });
  }
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" || event.key === "p" || event.key === "P") {
    togglePause();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    actor.send({ type: "PAUSE" });
    return;
  }
  actor.send({ type: "RESUME" });
});

canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  actor.send({ type: "CONTEXT_LOST" });
});

canvas.addEventListener("webglcontextrestored", () => {
  actor.send({ type: "CONTEXT_RESTORED" });
});

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
      if (!isSimStepping(actor.getSnapshot())) {
        syncHud();
        return;
      }
      for (let i = 0; i < n; i += 1) {
        step(world, []);
      }
      syncTiles(world);
      placeCamera(world.tick);
      syncHud();
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
      if (!isSimStepping(actor.getSnapshot())) {
        break;
      }
      step(world, []);
      accumulator -= TICK_DT;
      steps += 1;
    }
    if (!isSimStepping(actor.getSnapshot())) {
      accumulator = 0;
    }
    syncTiles(world);
    controls.update();
    syncHud();
    render();
  };
  requestAnimationFrame(loop);
}

import {
  ACESFilmicToneMapping,
  Color,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { createActor } from "xstate";
import { appMachine, isPaused, isSimStepping } from "./app/appMachine";
import { createCameraPose, eyeFromPose } from "./camera/pose";
import { bindCameraInput } from "./input/bindCamera";
import { createImpMeshes, syncImps } from "./render/imps";
import { addTorchLighting, DUNGEON_EXPOSURE } from "./render/lights";
import { createMapMeshes, syncMap } from "./render/map";
import {
  carryingCount,
  countTagged,
  createWorld,
  hashWorld,
  MAP_HALF,
  MAP_WIDTH,
  MAX_FRAME_DELTA,
  MAX_STEPS_PER_FRAME,
  step,
  TICK_DT,
  tileKindAt,
  type Command,
} from "./sim";

declare global {
  interface Window {
    __keeper: {
      tick: number;
      hash: number;
      taggedCount: number;
      dirtCount: number;
      claimedCount: number;
      goldStored: number;
      carryingCount: number;
      drawCalls: number;
      camera: { targetX: number; targetZ: number; yaw: number; pitch: number; distance: number };
      canvasPointForTile(tx: number, ty: number): { x: number; y: number } | null;
      step(n: number): void;
    };
  }
}

const actor = createActor(appMachine);
actor.start();

const canvas = document.createElement("canvas");
canvas.style.display = "block";
canvas.style.width = "100%";
canvas.style.height = "100%";
document.body.append(canvas);

const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = DUNGEON_EXPOSURE;

const scene = new Scene();
scene.background = new Color(0x1c1612);

const camera = new PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 400);
const pose = createCameraPose();

const world = createWorld(1);
const commands: Command[] = [];
const map = createMapMeshes(scene);
const impsVisual = createImpMeshes(scene);
syncMap(world.tiles, world.width, world.tilesVersion, map);
syncImps(world.imps, 1, impsVisual);
addTorchLighting(scene);
const screenPoint = new Vector3();

const tickHud = document.getElementById("tick");
const pauseOverlay = document.getElementById("pause-overlay");

function syncHud(): void {
  if (tickHud !== null) {
    tickHud.textContent = `tick ${String(world.tick)} · gold ${String(world.goldStored)}`;
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

function placeCamera(): void {
  const eye = eyeFromPose(pose);
  camera.position.set(eye.x, eye.y, eye.z);
  camera.lookAt(pose.targetX, 0, pose.targetZ);
}

const cameraInput = bindCameraInput(
  canvas,
  pose,
  camera,
  world,
  (command) => {
    commands.push(command);
  },
  () => {
    placeCamera();
    if (proof) {
      render();
    }
  },
);

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

function cameraSnapshot(): {
  targetX: number;
  targetZ: number;
  yaw: number;
  pitch: number;
  distance: number;
} {
  return {
    targetX: pose.targetX,
    targetZ: pose.targetZ,
    yaw: pose.yaw,
    pitch: pose.pitch,
    distance: pose.distance,
  };
}

function canvasPointForTile(tx: number, ty: number): { x: number; y: number } | null {
  if (tx < 0 || ty < 0 || tx >= MAP_WIDTH || ty >= world.height) {
    return null;
  }
  screenPoint.set(tx - MAP_HALF, 0, ty - MAP_HALF);
  screenPoint.project(camera);
  const x = (screenPoint.x * 0.5 + 0.5) * canvas.clientWidth;
  const y = (-screenPoint.y * 0.5 + 0.5) * canvas.clientHeight;
  if (x < 0 || y < 0 || x > canvas.clientWidth || y > canvas.clientHeight) {
    return null;
  }
  return { x, y };
}

if (proof) {
  placeCamera();
  render();
  window.__keeper = {
    get tick() {
      return world.tick;
    },
    get hash() {
      return hashWorld(world);
    },
    get drawCalls() {
      return renderer.info.render.calls;
    },
    get camera() {
      return cameraSnapshot();
    },
    get taggedCount() {
      return countTagged(world);
    },
    get dirtCount() {
      let n = 0;
      for (let i = 0; i < world.tiles.length; i += 1) {
        if (tileKindAt(world.tiles, i) === "dirt") {
          n += 1;
        }
      }
      return n;
    },
    get claimedCount() {
      let n = 0;
      for (let i = 0; i < world.tiles.length; i += 1) {
        if (tileKindAt(world.tiles, i) === "claimed") {
          n += 1;
        }
      }
      return n;
    },
    get goldStored() {
      return world.goldStored;
    },
    get carryingCount() {
      return carryingCount(world.imps);
    },
    canvasPointForTile,
    step(n: number) {
      if (!isSimStepping(actor.getSnapshot())) {
        syncHud();
        return;
      }
      for (let i = 0; i < n; i += 1) {
        step(world, commands);
        cameraInput.tickHeldKeys();
      }
      syncMap(world.tiles, world.width, world.tilesVersion, map);
      syncImps(world.imps, 1, impsVisual);
      placeCamera();
      syncHud();
      render();
    },
  };
} else {
  placeCamera();
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
      step(world, commands);
      accumulator -= TICK_DT;
      steps += 1;
    }
    if (!isSimStepping(actor.getSnapshot())) {
      accumulator = 0;
    }
    cameraInput.tickHeldKeys();
    syncMap(world.tiles, world.width, world.tilesVersion, map);
    syncImps(world.imps, accumulator / TICK_DT, impsVisual);
    placeCamera();
    syncHud();
    render();
  };
  requestAnimationFrame(loop);
}

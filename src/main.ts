import {
  ACESFilmicToneMapping,
  Color,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { createActor } from "xstate";
import { appMachine, appStateName, isPaused, isReplaying, isSimStepping } from "./app/appMachine";
import { createCameraPose, eyeFromPose } from "./camera/pose";
import { bindCameraInput } from "./input/bindCamera";
import { isPainting } from "./input/inputCameraMachine";
import { createCreatureMeshes, syncCreatures } from "./render/creatures";
import { createPropMeshes, syncProps } from "./render/props";
import { createImpMeshes, syncImps } from "./render/imps";
import { addTorchLighting, DUNGEON_EXPOSURE } from "./render/lights";
import { createMapMeshes, syncMap } from "./render/map";
import {
  requireSorted,
  buildSave,
  carryingCount,
  countTagged,
  createWorld,
  hashWorld,
  HEART_X,
  HEART_Y,
  liveImpCount,
  isWalkableCode,
  MAP_HALF,
  MAP_WIDTH,
  MAX_FRAME_DELTA,
  MAX_STEPS_PER_FRAME,
  parseSave,
  replaySave,
  ROOM_KIND,
  SAVE_STORAGE_KEY,
  serializeSave,
  step,
  TICK_DT,
  tileKindAt,
  asTileIndex,
  jobAtTile,
  jobHeldBy,
  treasuryStockTotal,
  treasuryTileCount,
  lairTileCount,
  liveCreatureCount,
  workerOf,
  type Command,
  type CommandLog,
  type Job,
  type RoomTool,
  type Save,
} from "./sim";
import { createHud, hudGold } from "./ui/hud";
import { createSandboxPanel } from "./ui/sandboxPanel";
import { max, median, percentile } from "./perf/stats";

type JobDebug = { tileX: number; tileY: number; kind: string; state: string; holder: number | null };
type ImpDebug = { id: number; tileX: number; tileY: number; state: string; boost: number; job: JobDebug | null };
type CreatureDebug = {
  id: number;
  tileX: number;
  tileY: number;
  state: string;
  bedTileX: number;
  bedTileY: number;
};
type BenchResult = { samples: number[]; median: number; p95: number; max: number };

declare global {
  interface Window {
    __keeper: {
      tick: number;
      hash: number;
      worldHash: number;
      taggedCount: number;
      dirtCount: number;
      claimedCount: number;
      goldStored: number;
      goldSpent: number;
      impCount: number;
      creatureCount: number;
      lairTileCount: number;
      carryingCount: number;
      hudText: string;
      drawCalls: number;
      heldCount: number;
      painting: boolean;
      appState: string;
      treasuryTileCount: number;
      treasuryStockTotal: number;
      maxImpsPerTile: number;
      camera: { targetX: number; targetZ: number; yaw: number; pitch: number; distance: number };
      canvasPointForTile(tx: number, ty: number): { x: number; y: number } | null;
      tileKind(tx: number, ty: number): string | null;
      treasuryTiles(): { x: number; y: number; stock: number }[];
      jobSnapshot(tx: number, ty: number): JobDebug | null;
      impSnapshot(): ImpDebug[];
      creatureSnapshot(): CreatureDebug[];
      dropTiles(fromX: number, fromY: number): { x: number; y: number }[];
      step(n: number): void;
      spawnImps(n: number): void;
      saveNow(): Save;
      loadFromStorage(): boolean;
      benchSim(batches: number, ticksPerBatch: number): BenchResult;
      benchFrame(frames: number): Promise<BenchResult>;
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

let world = createWorld(1);
let commands: Command[] = [];
let commandLog: CommandLog = requireSorted(commands);
const hudElement = document.getElementById("hud");
const hud = createHud(hudElement);
const props = createPropMeshes(scene);
const map = createMapMeshes(scene);
const impsVisual = createImpMeshes(scene);
const creaturesVisual = createCreatureMeshes(scene);
syncMap(world, map, world.tick);
syncProps(world, props);
syncImps(world.imps, world.hand, 1, undefined, impsVisual, world.tick);
syncCreatures(world.creatures, 1, creaturesVisual);
addTorchLighting(scene);
const screenPoint = new Vector3();

const pauseOverlay = document.getElementById("pause-overlay");
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
  () => world,
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

function togglePaint(room: RoomTool): void {
  const snapshot = cameraInput.actor.getSnapshot();
  if (isPainting(snapshot)) {
    cameraInput.actor.send({ type: "CLEAR_TOOL" });
    return;
  }
  cameraInput.actor.send({ type: "SELECT_ROOM_TOOL", room });
}

function loadSave(save: Save): void {
  actor.send({ type: "LOAD_SAVE", save });
  if (!isReplaying(actor.getSnapshot())) {
    return;
  }
  try {
    const replayed = replaySave(save);
    world = replayed;
    commands = save.commands.slice();
    commandLog = requireSorted(commands);
    syncMap(world, map, world.tick);
    syncProps(world, props);
    syncImps(world.imps, world.hand, 1, cameraInput.cursorTile(), impsVisual, world.tick);
    syncCreatures(world.creatures, 1, creaturesVisual);
    placeCamera();
    actor.send({ type: "REPLAY_DONE" });
  } catch {
    actor.send({ type: "REPLAY_ERROR" });
  }
}

const sandboxPanel = createSandboxPanel(
  document.getElementById("sandbox-panel"),
  () => world.tick,
  (command) => {
    commands.push(command);
  },
  togglePaint,
  () => buildSave(world, commands),
  loadSave,
);

function syncPaintMode(): void {
  const snapshot = cameraInput.actor.getSnapshot();
  sandboxPanel.setPainting(isPainting(snapshot), snapshot.context.room);
}

cameraInput.actor.subscribe(() => {
  syncPaintMode();
});
syncPaintMode();

function hudText(): string {
  return hudElement === null ? "" : hudElement.textContent ?? "";
}

function syncHud(): void {
  hud.update(hudGold(world.goldStored, treasuryStockTotal(world)), liveImpCount(world.imps), world.tick);
  const snapshot = actor.getSnapshot();
  const paused = isPaused(snapshot);
  sandboxPanel.setPaused(paused);
  sandboxPanel.setReplaying(isReplaying(snapshot));
  if (pauseOverlay !== null) {
    pauseOverlay.classList.toggle("visible", paused);
  }
}

actor.subscribe(() => {
  syncHud();
});

actor.send({ type: "ASSETS_REQUESTED" });
actor.send({ type: "ASSETS_READY" });
syncHud();

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
  if (event.key === "Escape") {
    if (isPainting(cameraInput.actor.getSnapshot())) {
      cameraInput.actor.send({ type: "ESCAPE" });
      return;
    }
    togglePause();
    return;
  }
  if (event.key === "p" || event.key === "P") {
    togglePause();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    actor.send({ type: "TAB_HIDDEN" });
    return;
  }
  actor.send({ type: "TAB_VISIBLE" });
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

function jobDebug(job: Job): JobDebug {
  const tileY = (job.tile / world.width) | 0;
  const tileX = job.tile - tileY * world.width;
  const holder = job.lifecycle.kind === "reserved" ? job.lifecycle.worker : null;
  return { tileX, tileY, kind: job.jobKind, state: job.lifecycle.kind, holder };
}

function tileKindDebug(tx: number, ty: number): string | null {
  if (tx < 0 || ty < 0 || tx >= world.width || ty >= world.height) {
    return null;
  }
  return tileKindAt(world.tiles, ty * world.width + tx);
}

function jobSnapshotDebug(tx: number, ty: number): JobDebug | null {
  if (tx < 0 || ty < 0 || tx >= world.width || ty >= world.height) {
    return null;
  }
  const job = jobAtTile(world.jobs, asTileIndex(ty * world.width + tx));
  return job === undefined ? null : jobDebug(job);
}

function hasAdjacentJob(tx: number, ty: number): boolean {
  const north = ty > 0 ? jobAtTile(world.jobs, asTileIndex((ty - 1) * world.width + tx)) : undefined;
  if (north !== undefined) {
    return true;
  }
  const east = tx + 1 < world.width ? jobAtTile(world.jobs, asTileIndex(ty * world.width + tx + 1)) : undefined;
  if (east !== undefined) {
    return true;
  }
  const south = ty + 1 < world.height ? jobAtTile(world.jobs, asTileIndex((ty + 1) * world.width + tx)) : undefined;
  if (south !== undefined) {
    return true;
  }
  const west = tx > 0 ? jobAtTile(world.jobs, asTileIndex(ty * world.width + tx - 1)) : undefined;
  return west !== undefined;
}

function maxImpsPerTile(): number {
  const occupancy = world.imps.occupancy;
  const heart = HEART_Y * world.width + HEART_X;
  let best = 0;
  for (let i = 0; i < occupancy.length; i += 1) {
    const count = occupancy[i];
    if (count === undefined || count <= best || i === heart) {
      continue;
    }
    if (world.rooms[i] === ROOM_KIND.treasury) {
      continue;
    }
    const y = (i / world.width) | 0;
    const x = i - y * world.width;
    if (hasAdjacentJob(x, y)) {
      continue;
    }
    best = count;
  }
  return best;
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
    get worldHash() {
      return hashWorld(world);
    },
    get drawCalls() {
      return renderer.info.render.calls;
    },
    get heldCount() {
      return world.hand.count;
    },
    get maxImpsPerTile() {
      return maxImpsPerTile();
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
    get goldSpent() {
      return world.goldSpent;
    },
    get painting() {
      return isPainting(cameraInput.actor.getSnapshot());
    },
    get appState() {
      return appStateName(actor.getSnapshot());
    },
    get treasuryTileCount() {
      return treasuryTileCount(world);
    },
    get treasuryStockTotal() {
      return treasuryStockTotal(world);
    },
    get impCount() {
      return liveImpCount(world.imps);
    },
    get creatureCount() {
      return liveCreatureCount(world.creatures);
    },
    get lairTileCount() {
      return lairTileCount(world);
    },
    get carryingCount() {
      return carryingCount(world.imps);
    },
    get hudText() {
      return hudText();
    },
    impSnapshot() {
      const imps: ImpDebug[] = [];
      for (let i = 0; i < world.imps.slots.length; i += 1) {
        const slot = world.imps.slots[i];
        if (slot === undefined) {
          continue;
        }
        switch (slot.kind) {
          case "empty":
            break;
          case "live": {
            const imp = slot.imp;
            const job = jobHeldBy(world.jobs, workerOf(imp));
            imps.push({
              id: imp.id,
              tileX: imp.tileX,
              tileY: imp.tileY,
              state: imp.state.kind,
              boost: imp.boost.kind === "boosted" ? imp.boost.remaining : 0,
              job: job === undefined ? null : jobDebug(job),
            });
            break;
          }
          default: {
            const never: never = slot;
            return never;
          }
        }
      }
      return imps;
    },
    creatureSnapshot() {
      const creatures: CreatureDebug[] = [];
      for (let i = 0; i < world.creatures.slots.length; i += 1) {
        const slot = world.creatures.slots[i];
        if (slot === undefined) {
          continue;
        }
        switch (slot.kind) {
          case "empty":
            break;
          case "live": {
            const creature = slot.creature;
            const bedY = (creature.bedTile / world.width) | 0;
            const bedX = creature.bedTile - bedY * world.width;
            creatures.push({
              id: creature.id,
              tileX: creature.tileX,
              tileY: creature.tileY,
              state: creature.state.kind,
              bedTileX: bedX,
              bedTileY: bedY,
            });
            break;
          }
          default: {
            const never: never = slot;
            return never;
          }
        }
      }
      return creatures;
    },
    dropTiles(fromX: number, fromY: number) {
      const tiles: { x: number; y: number }[] = [];
      for (let y = 0; y < world.height; y += 1) {
        for (let x = 0; x < world.width; x += 1) {
          const code = world.tiles[y * world.width + x];
          if (code === undefined || !isWalkableCode(code)) {
            continue;
          }
          if (Math.max(Math.abs(x - fromX), Math.abs(y - fromY)) < 5) {
            continue;
          }
          tiles.push({ x, y });
        }
      }
      return tiles;
    },
    canvasPointForTile,
    tileKind: tileKindDebug,
    treasuryTiles() {
      const tiles: { x: number; y: number; stock: number }[] = [];
      for (let i = 0; i < world.rooms.length; i += 1) {
        const room = world.rooms[i];
        if (room !== ROOM_KIND.treasury) {
          continue;
        }
        const stock = world.treasuryStock[i];
        const y = (i / world.width) | 0;
        const x = i - y * world.width;
        tiles.push({ x, y, stock: stock === undefined ? 0 : stock });
      }
      return tiles;
    },
    jobSnapshot: jobSnapshotDebug,
    step(n: number) {
      if (!isSimStepping(actor.getSnapshot())) {
        syncHud();
        return;
      }
      for (let i = 0; i < n; i += 1) {
        step(world, commandLog);
        cameraInput.tickHeldKeys();
      }
      syncMap(world, map, world.tick);
      syncProps(world, props);
      syncImps(world.imps, world.hand, 1, cameraInput.cursorTile(), impsVisual, world.tick);
      syncCreatures(world.creatures, 1, creaturesVisual);
      placeCamera();
      syncHud();
      render();
    },
    spawnImps(n: number) {
      const tick = world.tick;
      for (let i = 0; i < n; i += 1) {
        commands.push({ kind: "spawnImp", tick });
      }
    },
    saveNow() {
      const save = buildSave(world, commands);
      localStorage.setItem(SAVE_STORAGE_KEY, serializeSave(save));
      return save;
    },
    loadFromStorage() {
      const stored = localStorage.getItem(SAVE_STORAGE_KEY);
      if (stored === null) {
        return false;
      }
      const parsed = parseSave(stored);
      if (!parsed.ok) {
        return false;
      }
      loadSave(parsed.save);
      return true;
    },
    benchSim(batches: number, ticksPerBatch: number) {
      const perTickMs: number[] = [];
      for (let b = 0; b < batches; b += 1) {
        const start = performance.now();
        for (let t = 0; t < ticksPerBatch; t += 1) {
          step(world, commandLog);
        }
        const elapsed = performance.now() - start;
        perTickMs.push(elapsed / ticksPerBatch);
      }
      return {
        samples: perTickMs,
        median: median(perTickMs),
        p95: percentile(perTickMs, 95),
        max: max(perTickMs),
      };
    },
    async benchFrame(frames: number) {
      const gl = renderer.getContext();
      const pixel = new Uint8Array(4);
      const perFrameMs: number[] = [];
      const startFrame = renderer.info.render.frame;
      for (let f = 0; f < frames; f += 1) {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            const start = performance.now();
            syncMap(world, map, world.tick);
            syncProps(world, props);
            syncImps(world.imps, world.hand, 1, undefined, impsVisual, world.tick);
            syncCreatures(world.creatures, 1, creaturesVisual);
            placeCamera();
            syncHud();
            renderer.render(scene, camera);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            const elapsed = performance.now() - start;
            perFrameMs.push(elapsed);
            step(world, commandLog);
            resolve();
          });
        });
      }
      const advanced = renderer.info.render.frame - startFrame;
      if (advanced !== frames) {
        throw new Error(`benchFrame rendered ${String(advanced)} of ${String(frames)} frames`);
      }
      return {
        samples: perFrameMs,
        median: median(perFrameMs),
        p95: percentile(perFrameMs, 95),
        max: max(perFrameMs),
      };
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
      step(world, commandLog);
      accumulator -= TICK_DT;
      steps += 1;
    }
    if (!isSimStepping(actor.getSnapshot())) {
      accumulator = 0;
    }
    cameraInput.tickHeldKeys();
    syncMap(world, map, now / 1000);
    syncProps(world, props);
    syncImps(world.imps, world.hand, accumulator / TICK_DT, cameraInput.cursorTile(), impsVisual, now / 1000);
    syncCreatures(world.creatures, accumulator / TICK_DT, creaturesVisual);
    placeCamera();
    syncHud();
    render();
  };
  requestAnimationFrame(loop);
}

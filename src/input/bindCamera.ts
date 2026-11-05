import type { Camera } from "three";
import { createActor } from "xstate";
import {
  applyHeldKeys,
  applyOrbit,
  applyPanPixels,
  applyZoom,
  type CameraPose,
} from "../camera/pose";
import {
  asTileIndex,
  HAND_CAPACITY,
  isWalkableCode,
  tileKindAt,
  type Command,
  type ImpId,
  type TileIndex,
  type TileKind,
  type World,
} from "../sim";
import { walkGridLine } from "./gridLine";
import { inputCameraMachine, isHolding, isOrbiting, isPainting, isPanning, isTagging } from "./inputCameraMachine";
import { pickTileIndex } from "./pick";

export type HeldKeys = { w: boolean; a: boolean; s: boolean; d: boolean };

export type SweepMode = "tag" | "untag" | undefined;

function panKeyFromCode(code: string): keyof HeldKeys | undefined {
  switch (code) {
    case "KeyW":
      return "w";
    case "KeyA":
      return "a";
    case "KeyS":
      return "s";
    case "KeyD":
      return "d";
    default:
      return undefined;
  }
}

export function sweepModeFor(kind: TileKind): SweepMode {
  switch (kind) {
    case "earth":
    case "goldSeam":
      return "tag";
    case "taggedEarth":
    case "taggedGold":
      return "untag";
    case "rock":
    case "dirt":
    case "claimed":
    case "room":
    case "portal":
      return undefined;
    default: {
      const never: never = kind;
      return never;
    }
  }
}

export function matchesMode(kind: TileKind, mode: "tag" | "untag"): boolean {
  switch (mode) {
    case "tag":
      return kind === "earth" || kind === "goldSeam";
    case "untag":
      return kind === "taggedEarth" || kind === "taggedGold";
    default: {
      const never: never = mode;
      return never;
    }
  }
}

export function bindCameraInput(
  canvas: HTMLCanvasElement,
  pose: CameraPose,
  camera: Camera,
  getWorld: () => World,
  enqueue: (command: Command) => void,
  onChange: () => void,
): {
  actor: ReturnType<typeof createActor<typeof inputCameraMachine>>;
  tickHeldKeys: () => void;
  cursorTile: () => TileIndex | undefined;
} {
  const actor = createActor(inputCameraMachine);
  actor.start();
  const held: HeldKeys = { w: false, a: false, s: false, d: false };
  const heldStack: ImpId[] = [];
  let lastX = 0;
  let lastY = 0;
  let sweepMode: SweepMode;
  let lastSweepTile: TileIndex | undefined;
  let lastPaintTile: TileIndex | undefined;
  const swept = new Uint8Array(getWorld().width * getWorld().height);
  const painted = new Uint8Array(getWorld().width * getWorld().height);

  function resetSweep(): void {
    sweepMode = undefined;
    lastSweepTile = undefined;
    swept.fill(0);
  }

  function resetPaint(): void {
    lastPaintTile = undefined;
    painted.fill(0);
  }

  function paintTile(tile: TileIndex): void {
    if (painted[tile] === 1) {
      return;
    }
    painted[tile] = 1;
    const world = getWorld();
    enqueue({
      kind: "paintRoom",
      tick: world.tick,
      tile: asTileIndex(tile),
      room: actor.getSnapshot().context.room,
    });
  }

  function applySweepTile(tile: TileIndex): void {
    if (swept[tile] === 1) {
      return;
    }
    swept[tile] = 1;
    const world = getWorld();
    const kind = tileKindAt(world.tiles, tile);
    if (sweepMode === undefined) {
      sweepMode = sweepModeFor(kind);
    }
    if (sweepMode === undefined) {
      return;
    }
    if (!matchesMode(kind, sweepMode)) {
      return;
    }
    enqueue({
      kind: sweepMode,
      tick: world.tick,
      tile: asTileIndex(tile),
    });
  }

  function applySweepPoint(x: number, y: number): void {
    const world = getWorld();
    if (x < 0 || y < 0 || x >= world.width || y >= world.height) {
      return;
    }
    applySweepTile(asTileIndex(y * world.width + x));
  }

  function applyPaintPoint(x: number, y: number): void {
    const world = getWorld();
    if (x < 0 || y < 0 || x >= world.width || y >= world.height) {
      return;
    }
    paintTile(asTileIndex(y * world.width + x));
  }

  function applySweepTo(tile: TileIndex): void {
    const world = getWorld();
    const x = tile % world.width;
    const y = (tile / world.width) | 0;
    const previous = lastSweepTile;
    lastSweepTile = tile;
    if (previous === undefined) {
      applySweepTile(tile);
      return;
    }
    walkGridLine(previous % world.width, (previous / world.width) | 0, x, y, applySweepPoint);
  }

  function applyPaintTo(tile: TileIndex): void {
    const world = getWorld();
    const x = tile % world.width;
    const y = (tile / world.width) | 0;
    const previous = lastPaintTile;
    lastPaintTile = tile;
    if (previous === undefined) {
      paintTile(tile);
      return;
    }
    walkGridLine(previous % world.width, (previous / world.width) | 0, x, y, applyPaintPoint);
  }

  function pickFromEvent(event: PointerEvent): TileIndex | undefined {
    return pickTileIndex(camera, canvas, event.clientX, event.clientY);
  }

  function pickImpFromEvent(event: PointerEvent): ImpId | undefined {
    const tile = pickFromEvent(event);
    if (tile === undefined) {
      return undefined;
    }
    const world = getWorld();
    const y = (tile / world.width) | 0;
    const x = tile - y * world.width;
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
          if (imp.state.kind !== "held" && imp.tileX === x && imp.tileY === y) {
            return imp.id;
          }
          break;
        }
        default: {
          const never: never = slot;
          return never;
        }
      }
    }
    return undefined;
  }

  function cursorTile(): TileIndex | undefined {
    return pickTileIndex(camera, canvas, lastX, lastY);
  }

  actor.subscribe(() => {
    const snapshot = actor.getSnapshot();
    if (!isTagging(snapshot)) {
      resetSweep();
    }
    if (!isPainting(snapshot)) {
      resetPaint();
    }
  });

  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  canvas.addEventListener("pointerdown", (event) => {
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    const world = getWorld();
    const snapshot = actor.getSnapshot();
    if (event.button === 2) {
      if (isHolding(snapshot)) {
        const tile = pickFromEvent(event);
        if (tile === undefined) {
          actor.send({ type: "DROP_REFUSED" });
          return;
        }
        const code = world.tiles[tile];
        if (code === undefined || !isWalkableCode(code)) {
          actor.send({ type: "DROP_REFUSED" });
          return;
        }
        const impId = heldStack.pop();
        if (impId === undefined) {
          actor.send({ type: "DROP_REFUSED" });
          return;
        }
        const y = (tile / world.width) | 0;
        const x = tile - y * world.width;
        enqueue({ kind: "drop", tick: world.tick, impId, tileX: x, tileY: y });
        actor.send({ type: "DROP_WALKABLE" });
        return;
      }
      actor.send({ type: "RIGHT_DOWN" });
      return;
    }
    if (event.button === 1) {
      event.preventDefault();
      actor.send({ type: "MIDDLE_DOWN" });
      return;
    }
    if (event.button !== 0) {
      return;
    }
    if (isTagging(snapshot)) {
      const tile = pickFromEvent(event);
      if (tile !== undefined) {
        applySweepTo(tile);
      }
      return;
    }
    if (isPainting(snapshot)) {
      const tile = pickFromEvent(event);
      if (tile !== undefined) {
        resetPaint();
        applyPaintTo(tile);
      }
      return;
    }
    if (snapshot.matches("Idle") && event.shiftKey) {
      const impId = pickImpFromEvent(event);
      if (impId !== undefined) {
        enqueue({ kind: "slap", tick: world.tick, impId });
        actor.send({ type: "SLAP_IMP" });
        return;
      }
    }
    if (isHolding(snapshot) || snapshot.matches("Idle")) {
      const impId = pickImpFromEvent(event);
      if (impId !== undefined && snapshot.context.heldCount < HAND_CAPACITY) {
        heldStack.push(impId);
        enqueue({ kind: "pickUp", tick: world.tick, impId });
        actor.send({ type: "LEFT_DOWN_IMP" });
        return;
      }
      if (isHolding(snapshot)) {
        return;
      }
    }
    const tile = pickFromEvent(event);
    if (tile === undefined) {
      return;
    }
    resetSweep();
    actor.send({ type: "LEFT_DOWN_TILE" });
    if (isTagging(actor.getSnapshot())) {
      applySweepTo(tile);
    }
  });

  canvas.addEventListener("pointermove", (event) => {
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    const snapshot = actor.getSnapshot();
    if (isOrbiting(snapshot)) {
      applyOrbit(pose, dx, dy);
      onChange();
      return;
    }
    if (isPanning(snapshot) && snapshot.context.pointerPan) {
      applyPanPixels(pose, dx, dy);
      onChange();
      return;
    }
    if (isTagging(snapshot)) {
      const tile = pickFromEvent(event);
      if (tile !== undefined) {
        applySweepTo(tile);
      }
      return;
    }
    if (isPainting(snapshot)) {
      const tile = pickFromEvent(event);
      if (tile !== undefined) {
        applyPaintTo(tile);
      }
    }
  });

  canvas.addEventListener("pointerup", () => {
    const snapshot = actor.getSnapshot();
    if (isTagging(snapshot)) {
      actor.send({ type: "TAG_RELEASE" });
      resetSweep();
      return;
    }
    if (isPainting(snapshot)) {
      resetPaint();
      return;
    }
    actor.send({ type: "POINTER_UP" });
  });

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      applyZoom(pose, event.deltaY);
      onChange();
    },
    { passive: false },
  );

  window.addEventListener("keydown", (event) => {
    const key = panKeyFromCode(event.code);
    if (key === undefined) {
      return;
    }
    if (held[key]) {
      return;
    }
    held[key] = true;
    actor.send({ type: "PAN_KEY_DOWN" });
  });

  window.addEventListener("keyup", (event) => {
    const key = panKeyFromCode(event.code);
    if (key === undefined) {
      return;
    }
    if (!held[key]) {
      return;
    }
    held[key] = false;
    actor.send({ type: "PAN_KEY_UP" });
  });

  function tickHeldKeys(): void {
    if (!isPanning(actor.getSnapshot())) {
      return;
    }
    applyHeldKeys(pose, held);
    onChange();
  }

  return { actor, tickHeldKeys, cursorTile };
}

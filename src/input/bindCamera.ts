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
import { inputCameraMachine, isHolding, isOrbiting, isPanning, isTagging } from "./inputCameraMachine";
import { pickTileIndex } from "./pick";

export type HeldKeys = { w: boolean; a: boolean; s: boolean; d: boolean };

type SweepMode = "tag" | "untag" | undefined;

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

function sweepModeFor(kind: TileKind): SweepMode {
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
      return undefined;
    default: {
      const never: never = kind;
      return never;
    }
  }
}

function matchesMode(kind: TileKind, mode: "tag" | "untag"): boolean {
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
  world: World,
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
  const swept = new Uint8Array(world.width * world.height);

  function resetSweep(): void {
    sweepMode = undefined;
    swept.fill(0);
  }

  function applySweepTile(tile: TileIndex): void {
    if (swept[tile] === 1) {
      return;
    }
    swept[tile] = 1;
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

  function pickFromEvent(event: PointerEvent): TileIndex | undefined {
    return pickTileIndex(camera, canvas, event.clientX, event.clientY);
  }

  function pickImpFromEvent(event: PointerEvent): ImpId | undefined {
    const tile = pickFromEvent(event);
    if (tile === undefined) {
      return undefined;
    }
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

  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  canvas.addEventListener("pointerdown", (event) => {
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
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
        applySweepTile(tile);
      }
      return;
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
      applySweepTile(tile);
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
        applySweepTile(tile);
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

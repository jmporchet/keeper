import { createActor } from "xstate";
import {
  applyHeldKeys,
  applyOrbit,
  applyPanPixels,
  applyZoom,
  type CameraPose,
} from "../camera/pose";
import { inputCameraMachine, isOrbiting, isPanning } from "./inputCameraMachine";

export type HeldKeys = { w: boolean; a: boolean; s: boolean; d: boolean };

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

export function bindCameraInput(
  canvas: HTMLCanvasElement,
  pose: CameraPose,
  onChange: () => void,
): { actor: ReturnType<typeof createActor<typeof inputCameraMachine>>; tickHeldKeys: () => void } {
  const actor = createActor(inputCameraMachine);
  actor.start();
  const held: HeldKeys = { w: false, a: false, s: false, d: false };
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  canvas.addEventListener("pointerdown", (event) => {
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    if (event.button === 2) {
      actor.send({ type: "RIGHT_DOWN" });
      return;
    }
    if (event.button === 1) {
      event.preventDefault();
      actor.send({ type: "MIDDLE_DOWN" });
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
    }
  });

  canvas.addEventListener("pointerup", () => {
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

  return { actor, tickHeldKeys };
}

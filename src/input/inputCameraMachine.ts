import { assign, setup, type SnapshotFrom } from "xstate";
import { HAND_CAPACITY } from "../sim";

export type InputCameraEvent =
  | { type: "RIGHT_DOWN" }
  | { type: "MIDDLE_DOWN" }
  | { type: "PAN_KEY_DOWN" }
  | { type: "POINTER_UP" }
  | { type: "PAN_KEY_UP" }
  | { type: "LEFT_DOWN_TILE" }
  | { type: "LEFT_DOWN_IMP" }
  | { type: "SELECT_ROOM_TOOL" }
  | { type: "CLEAR_TOOL" }
  | { type: "ESCAPE" }
  | { type: "DROP_WALKABLE" }
  | { type: "DROP_REFUSED" }
  | { type: "TAG_RELEASE" }
  | { type: "SLAP_IMP" };

export type InputCameraContext = {
  panKeys: number;
  pointerPan: boolean;
  heldCount: number;
};

export const inputCameraMachine = setup({
  types: {
    context: {} as InputCameraContext,
    events: {} as InputCameraEvent,
  },
  guards: {
    noPanKeys: ({ context }) => context.panKeys === 0,
    lastPanKey: ({ context }) => context.panKeys <= 1 && !context.pointerPan,
    handHasRoom: ({ context }) => context.heldCount < HAND_CAPACITY,
    lastHeld: ({ context }) => context.heldCount <= 1,
  },
  actions: {
    markPointerPan: assign({ pointerPan: true }),
    clearPointerPan: assign({ pointerPan: false }),
    incPanKeys: assign({ panKeys: ({ context }) => context.panKeys + 1 }),
    decPanKeys: assign({ panKeys: ({ context }) => Math.max(0, context.panKeys - 1) }),
    incHeld: assign({ heldCount: ({ context }) => context.heldCount + 1 }),
    decHeld: assign({ heldCount: ({ context }) => Math.max(0, context.heldCount - 1) }),
  },
}).createMachine({
  id: "inputCamera",
  initial: "Idle",
  context: { panKeys: 0, pointerPan: false, heldCount: 0 },
  states: {
    Idle: {
      on: {
        RIGHT_DOWN: "Orbiting",
        MIDDLE_DOWN: { target: "Panning", actions: "markPointerPan" },
        PAN_KEY_DOWN: { target: "Panning", actions: "incPanKeys" },
        LEFT_DOWN_TILE: "Tagging",
        SELECT_ROOM_TOOL: "Painting",
        LEFT_DOWN_IMP: { target: "Holding", guard: "handHasRoom", actions: "incHeld" },
        SLAP_IMP: {},
      },
    },
    Orbiting: {
      on: {
        POINTER_UP: "Idle",
      },
    },
    Panning: {
      on: {
        PAN_KEY_DOWN: { actions: "incPanKeys" },
        MIDDLE_DOWN: { actions: "markPointerPan" },
        POINTER_UP: [
          { guard: "noPanKeys", target: "Idle", actions: "clearPointerPan" },
          { actions: "clearPointerPan" },
        ],
        PAN_KEY_UP: [
          { guard: "lastPanKey", target: "Idle", actions: "decPanKeys" },
          { actions: "decPanKeys" },
        ],
      },
    },
    Tagging: {
      on: {
        TAG_RELEASE: "Idle",
        POINTER_UP: "Idle",
      },
    },
    Painting: {
      on: {
        ESCAPE: "Idle",
        CLEAR_TOOL: "Idle",
      },
    },
    Holding: {
      on: {
        LEFT_DOWN_IMP: { target: "Holding", guard: "handHasRoom", actions: "incHeld" },
        DROP_WALKABLE: [
          { guard: "lastHeld", target: "Idle", actions: "decHeld" },
          { target: "Holding", actions: "decHeld" },
        ],
        DROP_REFUSED: "Holding",
      },
    },
  },
});

export type InputCameraSnapshot = SnapshotFrom<typeof inputCameraMachine>;

export function isOrbiting(snapshot: InputCameraSnapshot): boolean {
  return snapshot.matches("Orbiting");
}

export function isPanning(snapshot: InputCameraSnapshot): boolean {
  return snapshot.matches("Panning");
}

export function isTagging(snapshot: InputCameraSnapshot): boolean {
  return snapshot.matches("Tagging");
}

export function isHolding(snapshot: InputCameraSnapshot): boolean {
  return snapshot.matches("Holding");
}

export function isPainting(snapshot: InputCameraSnapshot): boolean {
  return snapshot.matches("Painting");
}

import { assign, setup, type SnapshotFrom } from "xstate";
import { HAND_CAPACITY, type CreatureId, type Possession, type RoomTool } from "../sim";

export type InputCameraEvent =
  | { type: "RIGHT_DOWN" }
  | { type: "MIDDLE_DOWN" }
  | { type: "PAN_KEY_DOWN" }
  | { type: "POINTER_UP" }
  | { type: "PAN_KEY_UP" }
  | { type: "LEFT_DOWN_TILE" }
  | { type: "LEFT_DOWN_IMP" }
  | { type: "SELECT_ROOM_TOOL"; room: RoomTool }
  | { type: "CLEAR_TOOL" }
  | { type: "ESCAPE" }
  | { type: "DROP_WALKABLE" }
  | { type: "DROP_REFUSED" }
  | { type: "TAG_RELEASE" }
  | { type: "SLAP_IMP" }
  | { type: "POSSESS_CREATURE"; creatureId: CreatureId }
  | { type: "EXIT_POSSESS" }
  | { type: "POSSESS_MOVE"; dx: number; dy: number };

export type InputCameraContext = {
  panKeys: number;
  pointerPan: boolean;
  heldCount: number;
  room: RoomTool;
  possession: Possession;
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
    selectRoom: assign({ room: ({ event }) => (event.type === "SELECT_ROOM_TOOL" ? event.room : "treasury") }),
    incHeld: assign({ heldCount: ({ context }) => context.heldCount + 1 }),
    decHeld: assign({ heldCount: ({ context }) => Math.max(0, context.heldCount - 1) }),
    setPossession: assign({
      possession: ({ event }): Possession =>
        event.type === "POSSESS_CREATURE"
          ? { kind: "creature", id: event.creatureId }
          : { kind: "none" },
    }),
    clearPossession: assign({ possession: (): Possession => ({ kind: "none" }) }),
    resetPan: assign({ panKeys: 0, pointerPan: false }),
  },
}).createMachine({
  id: "inputCamera",
  initial: "Idle",
  context: { panKeys: 0, pointerPan: false, heldCount: 0, room: "treasury", possession: { kind: "none" } },
  states: {
    Idle: {
      on: {
        RIGHT_DOWN: "Orbiting",
        MIDDLE_DOWN: { target: "Panning", actions: "markPointerPan" },
        PAN_KEY_DOWN: { target: "Panning", actions: "incPanKeys" },
        LEFT_DOWN_TILE: "Tagging",
        SELECT_ROOM_TOOL: { target: "Painting", actions: "selectRoom" },
        LEFT_DOWN_IMP: { target: "Holding", guard: "handHasRoom", actions: "incHeld" },
        SLAP_IMP: {},
        POSSESS_CREATURE: { target: "Possessed", actions: ["setPossession", "resetPan"] },
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
    Possessed: {
      on: {
        EXIT_POSSESS: { target: "Idle", actions: "clearPossession" },
        ESCAPE: { target: "Idle", actions: "clearPossession" },
        POSSESS_CREATURE: { target: "Possessed", actions: "setPossession" },
        POSSESS_MOVE: {},
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

export function isPossessed(snapshot: InputCameraSnapshot): boolean {
  return snapshot.matches("Possessed");
}

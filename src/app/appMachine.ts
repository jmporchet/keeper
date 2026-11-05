import { setup, type SnapshotFrom } from "xstate";
import type { Save } from "../sim/save";

export type AppEvent =
  | { type: "ASSETS_REQUESTED" }
  | { type: "ASSETS_READY" }
  | { type: "LOAD_ERROR" }
  | { type: "RETRY" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "CONTEXT_LOST" }
  | { type: "CONTEXT_RESTORED" }
  | { type: "LOAD_SAVE"; save: Save }
  | { type: "REPLAY_DONE" }
  | { type: "REPLAY_ERROR" };

export const appMachine = setup({
  types: {
    events: {} as AppEvent,
  },
}).createMachine({
  id: "app",
  initial: "Booting",
  states: {
    Booting: {
      on: {
        ASSETS_REQUESTED: "Loading",
      },
    },
    Loading: {
      on: {
        ASSETS_READY: "Sandbox",
        LOAD_ERROR: "Failed",
      },
    },
    Failed: {
      on: {
        RETRY: "Loading",
      },
    },
    Sandbox: {
      initial: "Running",
      on: {
        CONTEXT_LOST: "ContextLost",
        LOAD_SAVE: ".Replaying",
      },
      states: {
        Running: {
          on: {
            PAUSE: "Paused",
          },
        },
        Paused: {
          on: {
            RESUME: "Running",
          },
        },
        Replaying: {
          on: {
            REPLAY_DONE: "Running",
            REPLAY_ERROR: "Paused",
          },
        },
      },
    },
    ContextLost: {
      on: {
        CONTEXT_RESTORED: "Sandbox",
      },
    },
  },
});

export type AppSnapshot = SnapshotFrom<typeof appMachine>;

export function isSimStepping(snapshot: AppSnapshot): boolean {
  return snapshot.matches({ Sandbox: "Running" });
}

export function isPaused(snapshot: AppSnapshot): boolean {
  return snapshot.matches({ Sandbox: "Paused" });
}

export function isReplaying(snapshot: AppSnapshot): boolean {
  return snapshot.matches({ Sandbox: "Replaying" });
}

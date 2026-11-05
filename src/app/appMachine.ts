import { setup, type SnapshotFrom } from "xstate";

export type AppEvent =
  | { type: "ASSETS_REQUESTED" }
  | { type: "ASSETS_READY" }
  | { type: "LOAD_ERROR" }
  | { type: "RETRY" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "CONTEXT_LOST" }
  | { type: "CONTEXT_RESTORED" };

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

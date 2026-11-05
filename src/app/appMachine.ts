import { setup, type SnapshotFrom } from "xstate";
import type { Save } from "../sim/save";

export type AppEvent =
  | { type: "ASSETS_REQUESTED" }
  | { type: "ASSETS_READY" }
  | { type: "LOAD_ERROR" }
  | { type: "RETRY" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "TAB_HIDDEN" }
  | { type: "TAB_VISIBLE" }
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
        TAB_HIDDEN: "#app.Hidden",
        CONTEXT_LOST: "#app.ContextLost.Visible",
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
        Last: {
          type: "history",
          history: "deep",
        },
      },
    },
    Hidden: {
      on: {
        TAB_VISIBLE: "#app.Sandbox.Last",
        TAB_HIDDEN: "Hidden",
        CONTEXT_LOST: "#app.ContextLost.Hidden",
      },
    },
    ContextLost: {
      initial: "Visible",
      states: {
        Visible: {
          on: {
            TAB_HIDDEN: "Hidden",
            CONTEXT_RESTORED: "#app.Sandbox.Last",
          },
        },
        Hidden: {
          on: {
            TAB_VISIBLE: "Visible",
            CONTEXT_RESTORED: "#app.Hidden",
          },
        },
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

export function appStateName(snapshot: AppSnapshot): string {
  if (isSimStepping(snapshot)) {
    return "running";
  }
  if (isPaused(snapshot)) {
    return "paused";
  }
  if (isReplaying(snapshot)) {
    return "replaying";
  }
  if (snapshot.matches("Hidden")) {
    return "hidden";
  }
  if (snapshot.matches({ ContextLost: "Visible" })) {
    return "contextLost";
  }
  if (snapshot.matches({ ContextLost: "Hidden" })) {
    return "contextLostHidden";
  }
  if (snapshot.matches("Booting")) {
    return "booting";
  }
  if (snapshot.matches("Loading")) {
    return "loading";
  }
  if (snapshot.matches("Failed")) {
    return "failed";
  }
  return "unknown";
}

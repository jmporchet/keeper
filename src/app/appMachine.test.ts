import { createActor } from "xstate";
import { describe, expect, it } from "vitest";
import type { Save } from "../sim/save";
import { appMachine, isPaused, isReplaying, isSimStepping } from "./appMachine";

const save: Save = { version: 1, seed: 1, tick: 0, commands: [] };

function startApp() {
  const actor = createActor(appMachine);
  actor.start();
  return actor;
}

describe("app chart", () => {
  it("starts in Booting and does not step the sim", () => {
    const actor = startApp();
    expect(actor.getSnapshot().value).toBe("Booting");
    expect(isSimStepping(actor.getSnapshot())).toBe(false);
  });

  it("loads into Sandbox Running", () => {
    const actor = startApp();
    actor.send({ type: "ASSETS_REQUESTED" });
    expect(actor.getSnapshot().value).toBe("Loading");
    expect(isSimStepping(actor.getSnapshot())).toBe(false);
    actor.send({ type: "ASSETS_READY" });
    expect(actor.getSnapshot().value).toEqual({ Sandbox: "Running" });
    expect(isSimStepping(actor.getSnapshot())).toBe(true);
  });

  it("retries after a load error", () => {
    const actor = startApp();
    actor.send({ type: "ASSETS_REQUESTED" });
    actor.send({ type: "LOAD_ERROR" });
    expect(actor.getSnapshot().value).toBe("Failed");
    expect(isSimStepping(actor.getSnapshot())).toBe(false);
    actor.send({ type: "RETRY" });
    expect(actor.getSnapshot().value).toBe("Loading");
    actor.send({ type: "ASSETS_READY" });
    expect(actor.getSnapshot().value).toEqual({ Sandbox: "Running" });
  });

  it("pauses and resumes the sandbox", () => {
    const actor = startApp();
    actor.send({ type: "ASSETS_REQUESTED" });
    actor.send({ type: "ASSETS_READY" });
    actor.send({ type: "PAUSE" });
    expect(actor.getSnapshot().value).toEqual({ Sandbox: "Paused" });
    expect(isPaused(actor.getSnapshot())).toBe(true);
    expect(isSimStepping(actor.getSnapshot())).toBe(false);
    actor.send({ type: "RESUME" });
    expect(actor.getSnapshot().value).toEqual({ Sandbox: "Running" });
    expect(isSimStepping(actor.getSnapshot())).toBe(true);
  });

  it("loses and restores the WebGL context from running and paused", () => {
    const actor = startApp();
    actor.send({ type: "ASSETS_REQUESTED" });
    actor.send({ type: "ASSETS_READY" });
    actor.send({ type: "CONTEXT_LOST" });
    expect(actor.getSnapshot().value).toBe("ContextLost");
    expect(isSimStepping(actor.getSnapshot())).toBe(false);
    actor.send({ type: "CONTEXT_RESTORED" });
    expect(actor.getSnapshot().value).toEqual({ Sandbox: "Running" });
    expect(isSimStepping(actor.getSnapshot())).toBe(true);
    actor.send({ type: "PAUSE" });
    actor.send({ type: "CONTEXT_LOST" });
    expect(actor.getSnapshot().value).toBe("ContextLost");
    actor.send({ type: "CONTEXT_RESTORED" });
    expect(actor.getSnapshot().value).toEqual({ Sandbox: "Running" });
  });

  it("replays a loaded save from running and returns to running", () => {
    const actor = startApp();
    actor.send({ type: "ASSETS_REQUESTED" });
    actor.send({ type: "ASSETS_READY" });
    actor.send({ type: "LOAD_SAVE", save });
    expect(actor.getSnapshot().value).toEqual({ Sandbox: "Replaying" });
    expect(isReplaying(actor.getSnapshot())).toBe(true);
    expect(isSimStepping(actor.getSnapshot())).toBe(false);
    actor.send({ type: "REPLAY_DONE" });
    expect(actor.getSnapshot().value).toEqual({ Sandbox: "Running" });
    expect(isReplaying(actor.getSnapshot())).toBe(false);
    expect(isSimStepping(actor.getSnapshot())).toBe(true);
  });

  it("replays a loaded save from paused and pauses after a replay error", () => {
    const actor = startApp();
    actor.send({ type: "ASSETS_REQUESTED" });
    actor.send({ type: "ASSETS_READY" });
    actor.send({ type: "PAUSE" });
    actor.send({ type: "LOAD_SAVE", save });
    expect(actor.getSnapshot().value).toEqual({ Sandbox: "Replaying" });
    expect(isSimStepping(actor.getSnapshot())).toBe(false);
    actor.send({ type: "REPLAY_ERROR" });
    expect(actor.getSnapshot().value).toEqual({ Sandbox: "Paused" });
    expect(isPaused(actor.getSnapshot())).toBe(true);
    expect(isSimStepping(actor.getSnapshot())).toBe(false);
  });

  it("ignores events that are not on the chart", () => {
    const actor = startApp();
    actor.send({ type: "PAUSE" });
    actor.send({ type: "ASSETS_READY" });
    actor.send({ type: "CONTEXT_LOST" });
    expect(actor.getSnapshot().value).toBe("Booting");
    actor.send({ type: "ASSETS_REQUESTED" });
    actor.send({ type: "PAUSE" });
    actor.send({ type: "RETRY" });
    expect(actor.getSnapshot().value).toBe("Loading");
  });
});

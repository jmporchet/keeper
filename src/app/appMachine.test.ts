import { createActor } from "xstate";
import { describe, expect, it } from "vitest";
import type { Save } from "../sim/save";
import { appMachine, isDefeated, isPaused, isReplaying, isSimStepping } from "./appMachine";

const save: Save = { version: 1, seed: 1, tick: 0, commands: [] };

function startApp() {
  const actor = createActor(appMachine);
  actor.start();
  return actor;
}

function startSandbox() {
  const actor = startApp();
  actor.send({ type: "ASSETS_REQUESTED" });
  actor.send({ type: "ASSETS_READY" });
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
    const actor = startSandbox();
    actor.send({ type: "PAUSE" });
    expect(actor.getSnapshot().value).toEqual({ Sandbox: "Paused" });
    expect(isPaused(actor.getSnapshot())).toBe(true);
    expect(isSimStepping(actor.getSnapshot())).toBe(false);
    actor.send({ type: "RESUME" });
    expect(actor.getSnapshot().value).toEqual({ Sandbox: "Running" });
    expect(isSimStepping(actor.getSnapshot())).toBe(true);
  });

  it("enters defeated from running and stops stepping", () => {
    const actor = startSandbox();
    actor.send({ type: "DEFEAT" });
    expect(actor.getSnapshot().value).toEqual({ Sandbox: "Defeated" });
    expect(isDefeated(actor.getSnapshot())).toBe(true);
    expect(isSimStepping(actor.getSnapshot())).toBe(false);
    expect(isPaused(actor.getSnapshot())).toBe(false);
  });

  it("keeps defeated across tab hide and show", () => {
    const actor = startSandbox();
    actor.send({ type: "DEFEAT" });
    actor.send({ type: "TAB_HIDDEN" });
    expect(actor.getSnapshot().value).toBe("Hidden");
    actor.send({ type: "TAB_VISIBLE" });
    expect(actor.getSnapshot().value).toEqual({ Sandbox: "Defeated" });
    expect(isDefeated(actor.getSnapshot())).toBe(true);
    expect(isSimStepping(actor.getSnapshot())).toBe(false);
  });

  it("keeps a manual pause across tab hide and show", () => {
    const actor = startSandbox();
    actor.send({ type: "PAUSE" });
    actor.send({ type: "TAB_HIDDEN" });
    expect(actor.getSnapshot().value).toBe("Hidden");
    expect(isPaused(actor.getSnapshot())).toBe(false);
    expect(isSimStepping(actor.getSnapshot())).toBe(false);
    actor.send({ type: "TAB_VISIBLE" });
    expect(actor.getSnapshot().value).toEqual({ Sandbox: "Paused" });
    expect(isPaused(actor.getSnapshot())).toBe(true);
    expect(isSimStepping(actor.getSnapshot())).toBe(false);
  });

  it("keeps running across tab hide and show", () => {
    const actor = startSandbox();
    actor.send({ type: "TAB_HIDDEN" });
    expect(actor.getSnapshot().value).toBe("Hidden");
    expect(isSimStepping(actor.getSnapshot())).toBe(false);
    actor.send({ type: "TAB_VISIBLE" });
    expect(actor.getSnapshot().value).toEqual({ Sandbox: "Running" });
    expect(isSimStepping(actor.getSnapshot())).toBe(true);
  });

  it("ignores pause and resume while hidden", () => {
    const actor = startSandbox();
    actor.send({ type: "TAB_HIDDEN" });
    actor.send({ type: "PAUSE" });
    expect(actor.getSnapshot().value).toBe("Hidden");
    actor.send({ type: "RESUME" });
    expect(actor.getSnapshot().value).toBe("Hidden");
    actor.send({ type: "TAB_VISIBLE" });
    expect(actor.getSnapshot().value).toEqual({ Sandbox: "Running" });
  });

  it("keeps a manual pause across context loss and restore", () => {
    const actor = startSandbox();
    actor.send({ type: "PAUSE" });
    actor.send({ type: "CONTEXT_LOST" });
    expect(actor.getSnapshot().value).toEqual({ ContextLost: "Visible" });
    expect(isPaused(actor.getSnapshot())).toBe(false);
    expect(isSimStepping(actor.getSnapshot())).toBe(false);
    actor.send({ type: "CONTEXT_RESTORED" });
    expect(actor.getSnapshot().value).toEqual({ Sandbox: "Paused" });
    expect(isPaused(actor.getSnapshot())).toBe(true);
    expect(isSimStepping(actor.getSnapshot())).toBe(false);
  });

  it("keeps running across context loss and restore", () => {
    const actor = startSandbox();
    actor.send({ type: "CONTEXT_LOST" });
    expect(actor.getSnapshot().value).toEqual({ ContextLost: "Visible" });
    expect(isSimStepping(actor.getSnapshot())).toBe(false);
    actor.send({ type: "CONTEXT_RESTORED" });
    expect(actor.getSnapshot().value).toEqual({ Sandbox: "Running" });
    expect(isSimStepping(actor.getSnapshot())).toBe(true);
  });

  it("remembers a manual pause through hidden then context loss", () => {
    const actor = startSandbox();
    actor.send({ type: "PAUSE" });
    actor.send({ type: "TAB_HIDDEN" });
    actor.send({ type: "CONTEXT_LOST" });
    expect(actor.getSnapshot().value).toEqual({ ContextLost: "Hidden" });
    expect(isSimStepping(actor.getSnapshot())).toBe(false);
    actor.send({ type: "TAB_VISIBLE" });
    expect(actor.getSnapshot().value).toEqual({ ContextLost: "Visible" });
    expect(isSimStepping(actor.getSnapshot())).toBe(false);
    actor.send({ type: "CONTEXT_RESTORED" });
    expect(actor.getSnapshot().value).toEqual({ Sandbox: "Paused" });
    expect(isPaused(actor.getSnapshot())).toBe(true);
    expect(isSimStepping(actor.getSnapshot())).toBe(false);
  });

  it("remembers a manual pause through context loss then hidden", () => {
    const actor = startSandbox();
    actor.send({ type: "PAUSE" });
    actor.send({ type: "CONTEXT_LOST" });
    actor.send({ type: "TAB_HIDDEN" });
    expect(actor.getSnapshot().value).toEqual({ ContextLost: "Hidden" });
    expect(isSimStepping(actor.getSnapshot())).toBe(false);
    actor.send({ type: "CONTEXT_RESTORED" });
    expect(actor.getSnapshot().value).toBe("Hidden");
    expect(isSimStepping(actor.getSnapshot())).toBe(false);
    actor.send({ type: "TAB_VISIBLE" });
    expect(actor.getSnapshot().value).toEqual({ Sandbox: "Paused" });
    expect(isPaused(actor.getSnapshot())).toBe(true);
    expect(isSimStepping(actor.getSnapshot())).toBe(false);
  });

  it("remembers running through hidden and context loss in both orders", () => {
    const hiddenFirst = startSandbox();
    hiddenFirst.send({ type: "TAB_HIDDEN" });
    hiddenFirst.send({ type: "CONTEXT_LOST" });
    expect(hiddenFirst.getSnapshot().value).toEqual({ ContextLost: "Hidden" });
    expect(isSimStepping(hiddenFirst.getSnapshot())).toBe(false);
    hiddenFirst.send({ type: "TAB_VISIBLE" });
    hiddenFirst.send({ type: "CONTEXT_RESTORED" });
    expect(hiddenFirst.getSnapshot().value).toEqual({ Sandbox: "Running" });
    expect(isSimStepping(hiddenFirst.getSnapshot())).toBe(true);

    const lostFirst = startSandbox();
    lostFirst.send({ type: "CONTEXT_LOST" });
    lostFirst.send({ type: "TAB_HIDDEN" });
    expect(lostFirst.getSnapshot().value).toEqual({ ContextLost: "Hidden" });
    expect(isSimStepping(lostFirst.getSnapshot())).toBe(false);
    lostFirst.send({ type: "CONTEXT_RESTORED" });
    expect(lostFirst.getSnapshot().value).toBe("Hidden");
    expect(isSimStepping(lostFirst.getSnapshot())).toBe(false);
    lostFirst.send({ type: "TAB_VISIBLE" });
    expect(lostFirst.getSnapshot().value).toEqual({ Sandbox: "Running" });
    expect(isSimStepping(lostFirst.getSnapshot())).toBe(true);
  });

  it("replays a loaded save from running and returns to running", () => {
    const actor = startSandbox();
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
    const actor = startSandbox();
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
    actor.send({ type: "TAB_HIDDEN" });
    expect(actor.getSnapshot().value).toBe("Booting");
    actor.send({ type: "ASSETS_REQUESTED" });
    actor.send({ type: "PAUSE" });
    actor.send({ type: "RETRY" });
    expect(actor.getSnapshot().value).toBe("Loading");
  });
});

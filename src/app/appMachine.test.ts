import { createActor } from "xstate";
import { describe, expect, it } from "vitest";
import { appMachine, isPaused, isSimStepping } from "./appMachine";

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

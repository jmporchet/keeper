import { createActor } from "xstate";
import { describe, expect, it } from "vitest";
import {
  inputCameraMachine,
  isHolding,
  isOrbiting,
  isPanning,
  isTagging,
} from "./inputCameraMachine";

function startInput() {
  const actor = createActor(inputCameraMachine);
  actor.start();
  return actor;
}

describe("input and camera chart", () => {
  it("starts Idle", () => {
    const actor = startInput();
    expect(actor.getSnapshot().value).toBe("Idle");
    expect(isOrbiting(actor.getSnapshot())).toBe(false);
    expect(isPanning(actor.getSnapshot())).toBe(false);
  });

  it("orbits on right drag and returns on release", () => {
    const actor = startInput();
    actor.send({ type: "RIGHT_DOWN" });
    expect(actor.getSnapshot().value).toBe("Orbiting");
    expect(isOrbiting(actor.getSnapshot())).toBe(true);
    actor.send({ type: "POINTER_UP" });
    expect(actor.getSnapshot().value).toBe("Idle");
  });

  it("pans on middle drag and returns on release", () => {
    const actor = startInput();
    actor.send({ type: "MIDDLE_DOWN" });
    expect(actor.getSnapshot().value).toBe("Panning");
    actor.send({ type: "POINTER_UP" });
    expect(actor.getSnapshot().value).toBe("Idle");
  });

  it("pans on WASD and returns when keys are released", () => {
    const actor = startInput();
    actor.send({ type: "PAN_KEY_DOWN" });
    actor.send({ type: "PAN_KEY_DOWN" });
    expect(actor.getSnapshot().value).toBe("Panning");
    actor.send({ type: "PAN_KEY_UP" });
    expect(actor.getSnapshot().value).toBe("Panning");
    actor.send({ type: "PAN_KEY_UP" });
    expect(actor.getSnapshot().value).toBe("Idle");
  });

  it("stays panning while WASD is held after middle release", () => {
    const actor = startInput();
    actor.send({ type: "PAN_KEY_DOWN" });
    actor.send({ type: "MIDDLE_DOWN" });
    actor.send({ type: "POINTER_UP" });
    expect(actor.getSnapshot().value).toBe("Panning");
    actor.send({ type: "PAN_KEY_UP" });
    expect(actor.getSnapshot().value).toBe("Idle");
  });

  it("tags on left press on a tile and returns on release", () => {
    const actor = startInput();
    actor.send({ type: "LEFT_DOWN_TILE" });
    expect(actor.getSnapshot().value).toBe("Tagging");
    expect(isTagging(actor.getSnapshot())).toBe(true);
    actor.send({ type: "TAG_RELEASE" });
    expect(actor.getSnapshot().value).toBe("Idle");
    expect(isTagging(actor.getSnapshot())).toBe(false);
  });

  it("paints until the tool is cleared", () => {
    const actor = startInput();
    actor.send({ type: "SELECT_ROOM_TOOL" });
    expect(actor.getSnapshot().value).toBe("Painting");
    actor.send({ type: "ESCAPE" });
    expect(actor.getSnapshot().value).toBe("Idle");
    actor.send({ type: "SELECT_ROOM_TOOL" });
    actor.send({ type: "CLEAR_TOOL" });
    expect(actor.getSnapshot().value).toBe("Idle");
  });

  it("paints alongside holding and only picks up imps when not painting", () => {
    const actor = startInput();
    actor.send({ type: "SELECT_ROOM_TOOL" });
    actor.send({ type: "LEFT_DOWN_IMP" });
    expect(actor.getSnapshot().value).toBe("Painting");
    expect(actor.getSnapshot().context.heldCount).toBe(0);
    actor.send({ type: "ESCAPE" });
    expect(actor.getSnapshot().value).toBe("Idle");
    actor.send({ type: "LEFT_DOWN_IMP" });
    expect(actor.getSnapshot().value).toBe("Holding");
    expect(actor.getSnapshot().context.heldCount).toBe(1);
  });

  it("holds an imp and stays holding when drop is refused", () => {
    const actor = startInput();
    actor.send({ type: "LEFT_DOWN_IMP" });
    expect(actor.getSnapshot().value).toBe("Holding");
    expect(isHolding(actor.getSnapshot())).toBe(true);
    expect(actor.getSnapshot().context.heldCount).toBe(1);
    actor.send({ type: "DROP_REFUSED" });
    expect(actor.getSnapshot().value).toBe("Holding");
    expect(actor.getSnapshot().context.heldCount).toBe(1);
    actor.send({ type: "DROP_WALKABLE" });
    expect(actor.getSnapshot().value).toBe("Idle");
    expect(actor.getSnapshot().context.heldCount).toBe(0);
  });

  it("picks up more imps while holding and only returns to idle when the hand is empty", () => {
    const actor = startInput();
    actor.send({ type: "LEFT_DOWN_IMP" });
    actor.send({ type: "LEFT_DOWN_IMP" });
    expect(actor.getSnapshot().value).toBe("Holding");
    expect(actor.getSnapshot().context.heldCount).toBe(2);
    actor.send({ type: "DROP_WALKABLE" });
    expect(actor.getSnapshot().value).toBe("Holding");
    expect(actor.getSnapshot().context.heldCount).toBe(1);
    actor.send({ type: "DROP_WALKABLE" });
    expect(actor.getSnapshot().value).toBe("Idle");
    expect(actor.getSnapshot().context.heldCount).toBe(0);
  });

  it("refuses to hold more than eight imps", () => {
    const actor = startInput();
    for (let i = 0; i < 8; i += 1) {
      actor.send({ type: "LEFT_DOWN_IMP" });
    }
    expect(actor.getSnapshot().context.heldCount).toBe(8);
    actor.send({ type: "LEFT_DOWN_IMP" });
    expect(actor.getSnapshot().context.heldCount).toBe(8);
    expect(actor.getSnapshot().value).toBe("Holding");
  });

  it("ignores camera gestures that are not on the current state", () => {
    const actor = startInput();
    actor.send({ type: "POINTER_UP" });
    actor.send({ type: "ESCAPE" });
    expect(actor.getSnapshot().value).toBe("Idle");
    actor.send({ type: "RIGHT_DOWN" });
    actor.send({ type: "PAN_KEY_DOWN" });
    actor.send({ type: "LEFT_DOWN_TILE" });
    expect(actor.getSnapshot().value).toBe("Orbiting");
  });
});

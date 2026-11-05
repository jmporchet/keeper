import { createActor } from "xstate";
import { describe, expect, it } from "vitest";
import { asCreatureId } from "../sim";
import {
  inputCameraMachine,
  isHolding,
  isOrbiting,
  isPanning,
  isPossessed,
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

  it("paints until the tool is cleared and carries the selected room", () => {
    const actor = startInput();
    actor.send({ type: "SELECT_ROOM_TOOL", room: "treasury" });
    expect(actor.getSnapshot().value).toBe("Painting");
    expect(actor.getSnapshot().context.room).toBe("treasury");
    actor.send({ type: "ESCAPE" });
    expect(actor.getSnapshot().value).toBe("Idle");
    actor.send({ type: "SELECT_ROOM_TOOL", room: "lair" });
    expect(actor.getSnapshot().value).toBe("Painting");
    expect(actor.getSnapshot().context.room).toBe("lair");
    actor.send({ type: "CLEAR_TOOL" });
    expect(actor.getSnapshot().value).toBe("Idle");
    actor.send({ type: "SELECT_ROOM_TOOL", room: "hatchery" });
    expect(actor.getSnapshot().value).toBe("Painting");
    expect(actor.getSnapshot().context.room).toBe("hatchery");
    actor.send({ type: "ESCAPE" });
    expect(actor.getSnapshot().value).toBe("Idle");
    actor.send({ type: "SELECT_ROOM_TOOL", room: "training" });
    expect(actor.getSnapshot().value).toBe("Painting");
    expect(actor.getSnapshot().context.room).toBe("training");
    actor.send({ type: "CLEAR_TOOL" });
    expect(actor.getSnapshot().value).toBe("Idle");
  });

  it("paints alongside holding and only picks up imps when not painting", () => {
    const actor = startInput();
    actor.send({ type: "SELECT_ROOM_TOOL", room: "lair" });
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

  it("slaps an imp while idle without leaving idle or picking it up", () => {
    const actor = startInput();
    actor.send({ type: "SLAP_IMP" });
    expect(actor.getSnapshot().value).toBe("Idle");
    expect(actor.getSnapshot().context.heldCount).toBe(0);
  });

  it("ignores a slap event while holding", () => {
    const actor = startInput();
    actor.send({ type: "LEFT_DOWN_IMP" });
    actor.send({ type: "SLAP_IMP" });
    expect(actor.getSnapshot().value).toBe("Holding");
    expect(actor.getSnapshot().context.heldCount).toBe(1);
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

describe("possession input", () => {
  it("enters Possessed from Idle and returns on EXIT_POSSESS", () => {
    const actor = startInput();
    actor.send({ type: "POSSESS_CREATURE", creatureId: asCreatureId(2) });
    expect(actor.getSnapshot().value).toBe("Possessed");
    expect(isPossessed(actor.getSnapshot())).toBe(true);
    expect(actor.getSnapshot().context.possession).toEqual({ kind: "creature", id: 2 });
    actor.send({ type: "EXIT_POSSESS" });
    expect(actor.getSnapshot().value).toBe("Idle");
    expect(actor.getSnapshot().context.possession).toEqual({ kind: "none" });
  });

  it("returns to Idle from Possessed on Escape", () => {
    const actor = startInput();
    actor.send({ type: "POSSESS_CREATURE", creatureId: asCreatureId(0) });
    actor.send({ type: "ESCAPE" });
    expect(actor.getSnapshot().value).toBe("Idle");
    expect(isPossessed(actor.getSnapshot())).toBe(false);
  });

  it("ignores possessMove while Idle", () => {
    const actor = startInput();
    actor.send({ type: "POSSESS_MOVE", dx: 1, dy: 0 });
    expect(actor.getSnapshot().value).toBe("Idle");
  });

  it("does not enter Tagging, Holding or Painting while Possessed", () => {
    const actor = startInput();
    actor.send({ type: "POSSESS_CREATURE", creatureId: asCreatureId(1) });
    actor.send({ type: "LEFT_DOWN_TILE" });
    expect(actor.getSnapshot().value).toBe("Possessed");
    actor.send({ type: "LEFT_DOWN_IMP" });
    expect(actor.getSnapshot().value).toBe("Possessed");
    actor.send({ type: "SELECT_ROOM_TOOL", room: "lair" });
    expect(actor.getSnapshot().value).toBe("Possessed");
    actor.send({ type: "POSSESS_MOVE", dx: 0, dy: 1 });
    expect(actor.getSnapshot().value).toBe("Possessed");
  });
});

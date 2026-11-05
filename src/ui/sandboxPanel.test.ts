import { describe, expect, it } from "vitest";
import { asTick, type PaintTool, type Save } from "../sim";
import { createHud, formatHud, hudGold, type HudElement } from "./hud";
import { createSandboxPanel, sandboxCommand } from "./sandboxPanel";

type FakeButton = {
  disabled: boolean;
  pressed: string;
  clicks: (() => void)[];
  addEventListener(type: string, listener: () => void): void;
  setAttribute(name: string, value: string): void;
};

function fakeButton(): FakeButton {
  const button: FakeButton = {
    disabled: false,
    pressed: "false",
    clicks: [],
    addEventListener(_type, listener) {
      button.clicks.push(listener);
    },
    setAttribute(name, value) {
      if (name === "aria-pressed") {
        button.pressed = value;
      }
    },
  };
  return button;
}

function fakePanelRoot(): { root: HTMLElement; buttons: Map<string, FakeButton> } {
  const buttons = new Map<string, FakeButton>();
  const root = {
    querySelector(selector: string): FakeButton | null {
      return buttons.get(selector) ?? null;
    },
  } as unknown as HTMLElement;
  return { root, buttons };
}

const emptySave: Save = { version: 1, seed: 1, tick: 0, commands: [] };

describe("sandbox panel commands", () => {
  it("queues spawnImp at the given tick", () => {
    expect(sandboxCommand("spawnImp", asTick(7))).toEqual({ kind: "spawnImp", tick: 7 });
  });

  it("queues addGold for 100 gold at the given tick", () => {
    expect(sandboxCommand("addGold", asTick(7))).toEqual({ kind: "addGold", tick: 7, amount: 100 });
  });
});

describe("sandbox panel paint buttons", () => {
  it("wires the paint library button to the library tool", () => {
    const { root, buttons } = fakePanelRoot();
    const libraryButton = fakeButton();
    buttons.set("#paint-library", libraryButton);
    const selected: PaintTool[] = [];
    const panel = createSandboxPanel(
      root,
      () => asTick(0),
      () => undefined,
      (room) => {
        selected.push(room);
      },
      () => emptySave,
      () => undefined,
      () => undefined,
    );
    const click = libraryButton.clicks[0];
    if (click === undefined) {
      throw new Error("paint library click handler was not registered");
    }
    click();
    expect(selected).toEqual(["library"]);
    panel.setPainting(true, "library");
    expect(libraryButton.pressed).toBe("true");
    panel.setPainting(false, "library");
    expect(libraryButton.pressed).toBe("false");
  });
});

describe("sandbox panel door and trap tools", () => {
  it("wires the door and trap buttons to their paint tools", () => {
    const { root, buttons } = fakePanelRoot();
    const doorButton = fakeButton();
    const trapButton = fakeButton();
    buttons.set("#paint-door", doorButton);
    buttons.set("#paint-trap", trapButton);
    const selected: PaintTool[] = [];
    const panel = createSandboxPanel(
      root,
      () => asTick(0),
      () => undefined,
      (tool) => {
        selected.push(tool);
      },
      () => emptySave,
      () => undefined,
      () => undefined,
    );
    const doorClick = doorButton.clicks[0];
    const trapClick = trapButton.clicks[0];
    if (doorClick === undefined || trapClick === undefined) {
      throw new Error("door and trap click handlers were not registered");
    }
    doorClick();
    trapClick();
    expect(selected).toEqual(["door", "trap"]);
    panel.setPainting(true, "door");
    expect(doorButton.pressed).toBe("true");
    expect(trapButton.pressed).toBe("false");
    panel.setPainting(true, "trap");
    expect(doorButton.pressed).toBe("false");
    expect(trapButton.pressed).toBe("true");
    panel.setPainting(false, "trap");
    expect(trapButton.pressed).toBe("false");
  });
});

describe("hud", () => {
  it("formats gold, imp count, tick, payday countdown, heart hp and wave index", () => {
    expect(formatHud(140, 6, 512, 38, 20, false, 0, false, false, 0, 0, 0, 0)).toBe(
      "gold 140 · imps 6 · tick 512 · pay 38 · heart 20 · lightning ready · heal ready · speed ready · wave 1",
    );
  });

  it("shows pay now when a payday is due and the breach countdown after heart damage", () => {
    expect(formatHud(140, 6, 450, 0, 0, true, 25, false, false, 0, 0, 0, 0)).toBe(
      "gold 140 · imps 6 · tick 450 · pay now · breach 75 · lightning ready · heal ready · speed ready · wave 1",
    );
  });

  it("shows defeated once the breach timer expires", () => {
    expect(formatHud(140, 6, 550, 0, 0, true, 100, true, false, 0, 0, 0, 0)).toBe(
      "gold 140 · imps 6 · tick 550 · pay now · defeated · lightning ready · heal ready · speed ready · wave 1",
    );
  });

  it("shows victory in the heart slot after the final cleared wave", () => {
    expect(formatHud(140, 6, 600, 300, 20, false, 0, false, true, 0, 0, 0, 0)).toBe(
      "gold 140 · imps 6 · tick 600 · pay 300 · victory · lightning ready · heal ready · speed ready · wave 1",
    );
  });

  it("shows the escalated wave index after a repair", () => {
    expect(formatHud(140, 6, 512, 38, 20, false, 0, false, false, 2, 0, 0, 0)).toBe(
      "gold 140 · imps 6 · tick 512 · pay 38 · heart 20 · lightning ready · heal ready · speed ready · wave 3",
    );
  });

  it("counts stored gold and treasury stock as owned gold", () => {
    expect(hudGold(140, 60)).toBe(200);
  });

  it("writes the DOM only when a value changes", () => {
    const element: HudElement = { textContent: "" };
    const hud = createHud(element);
    hud.update(0, 4, 0, 450, 20, false, 0, false, false, 0, 0, 0, 0);
    expect(element.textContent).toBe("gold 0 · imps 4 · tick 0 · pay 450 · heart 20 · lightning ready · heal ready · speed ready · wave 1");
    element.textContent = "unchanged";
    hud.update(0, 4, 0, 450, 20, false, 0, false, false, 0, 0, 0, 0);
    expect(element.textContent).toBe("unchanged");
    hud.update(100, 4, 0, 450, 20, false, 0, false, false, 0, 0, 0, 0);
    expect(element.textContent).toBe("gold 100 · imps 4 · tick 0 · pay 450 · heart 20 · lightning ready · heal ready · speed ready · wave 1");
    hud.update(100, 6, 0, 450, 20, false, 0, false, false, 0, 0, 0, 0);
    expect(element.textContent).toBe("gold 100 · imps 6 · tick 0 · pay 450 · heart 20 · lightning ready · heal ready · speed ready · wave 1");
    hud.update(100, 6, 1, 449, 19, false, 0, false, false, 1, 0, 0, 0);
    expect(element.textContent).toBe("gold 100 · imps 6 · tick 1 · pay 449 · heart 19 · lightning ready · heal ready · speed ready · wave 2");
    hud.update(100, 6, 1, 0, 0, true, 40, false, false, 1, 0, 0, 0);
    expect(element.textContent).toBe("gold 100 · imps 6 · tick 1 · pay now · breach 60 · lightning ready · heal ready · speed ready · wave 2");
    hud.update(100, 6, 1, 0, 0, true, 100, true, false, 1, 0, 0, 0);
    expect(element.textContent).toBe("gold 100 · imps 6 · tick 1 · pay now · defeated · lightning ready · heal ready · speed ready · wave 2");
    hud.update(100, 6, 1, 0, 20, false, 0, false, true, 1, 0, 0, 0);
    expect(element.textContent).toBe("gold 100 · imps 6 · tick 1 · pay now · victory · lightning ready · heal ready · speed ready · wave 2");
    hud.update(100, 6, 1, 0, 20, false, 0, false, true, 1, 40, 0, 0);
    expect(element.textContent).toBe("gold 100 · imps 6 · tick 1 · pay now · victory · lightning 40 · heal ready · speed ready · wave 2");
  });

  it("shows the lightning cooldown readout", () => {
    expect(formatHud(140, 6, 512, 38, 20, false, 0, false, false, 0, 40, 0, 0)).toBe(
      "gold 140 · imps 6 · tick 512 · pay 38 · heart 20 · lightning 40 · heal ready · speed ready · wave 1",
    );
  });

  it("shows the heal cooldown readout", () => {
    expect(formatHud(140, 6, 512, 38, 20, false, 0, false, false, 0, 0, 25, 0)).toBe(
      "gold 140 · imps 6 · tick 512 · pay 38 · heart 20 · lightning ready · heal 25 · speed ready · wave 1",
    );
  });

  it("shows the speed imps cooldown readout", () => {
    expect(formatHud(140, 6, 512, 38, 20, false, 0, false, false, 0, 0, 0, 0)).toBe(
      "gold 140 · imps 6 · tick 512 · pay 38 · heart 20 · lightning ready · heal ready · speed ready · wave 1",
    );
    expect(formatHud(140, 6, 512, 38, 20, false, 0, false, false, 0, 0, 0, 31)).toBe(
      "gold 140 · imps 6 · tick 512 · pay 38 · heart 20 · lightning ready · heal ready · speed 31 · wave 1",
    );
  });
});

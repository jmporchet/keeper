import { describe, expect, it } from "vitest";
import { asTick } from "../sim";
import { createHud, formatHud, hudGold, type HudElement } from "./hud";
import { sandboxCommand } from "./sandboxPanel";

describe("sandbox panel commands", () => {
  it("queues spawnImp at the given tick", () => {
    expect(sandboxCommand("spawnImp", asTick(7))).toEqual({ kind: "spawnImp", tick: 7 });
  });

  it("queues addGold for 100 gold at the given tick", () => {
    expect(sandboxCommand("addGold", asTick(7))).toEqual({ kind: "addGold", tick: 7, amount: 100 });
  });
});

describe("hud", () => {
  it("formats gold, imp count, tick, payday countdown and heart hp", () => {
    expect(formatHud(140, 6, 512, 38, 20, false)).toBe(
      "gold 140 · imps 6 · tick 512 · pay 38 · heart 20",
    );
  });

  it("shows pay now when a payday is due and breached after heart damage", () => {
    expect(formatHud(140, 6, 450, 0, 0, true)).toBe(
      "gold 140 · imps 6 · tick 450 · pay now · breached",
    );
  });

  it("counts stored gold and treasury stock as owned gold", () => {
    expect(hudGold(140, 60)).toBe(200);
  });

  it("writes the DOM only when a value changes", () => {
    const element: HudElement = { textContent: "" };
    const hud = createHud(element);
    hud.update(0, 4, 0, 450, 20, false);
    expect(element.textContent).toBe("gold 0 · imps 4 · tick 0 · pay 450 · heart 20");
    element.textContent = "unchanged";
    hud.update(0, 4, 0, 450, 20, false);
    expect(element.textContent).toBe("unchanged");
    hud.update(100, 4, 0, 450, 20, false);
    expect(element.textContent).toBe("gold 100 · imps 4 · tick 0 · pay 450 · heart 20");
    hud.update(100, 6, 0, 450, 20, false);
    expect(element.textContent).toBe("gold 100 · imps 6 · tick 0 · pay 450 · heart 20");
    hud.update(100, 6, 1, 449, 19, false);
    expect(element.textContent).toBe("gold 100 · imps 6 · tick 1 · pay 449 · heart 19");
    hud.update(100, 6, 1, 0, 0, true);
    expect(element.textContent).toBe("gold 100 · imps 6 · tick 1 · pay now · breached");
  });
});

import { describe, expect, it } from "vitest";
import { asTick, HEAL_COST, LIGHTNING_COST, SPEED_IMPS_COST } from "../sim";
import { createSpellPanel, type SpellWorldState } from "./spellPanel";

type FakeText = {
  textContent: string | null;
};

type FakeButton = {
  disabled: boolean;
  pressed: string;
  clicks: (() => void)[];
  cost: FakeText;
  status: FakeText;
  addEventListener(type: string, listener: () => void): void;
  setAttribute(name: string, value: string): void;
  querySelector(selector: string): FakeText | null;
};

function fakeButton(): FakeButton {
  const cost = { textContent: "" };
  const status = { textContent: "" };
  const button: FakeButton = {
    disabled: false,
    pressed: "false",
    clicks: [],
    cost,
    status,
    addEventListener(_type, listener) {
      button.clicks.push(listener);
    },
    setAttribute(name, value) {
      if (name === "aria-pressed") {
        button.pressed = value;
      }
    },
    querySelector(selector) {
      if (selector === ".spell-cost") {
        return cost;
      }
      if (selector === ".spell-status") {
        return status;
      }
      return null;
    },
  };
  return button;
}

type FakeOption = {
  value: string;
  textContent: string | null;
};

type FakeSelect = {
  hidden: boolean;
  value: string;
  options: FakeOption[];
  changes: (() => void)[];
  replaceChildren(): void;
  append(option: FakeOption): void;
  addEventListener(type: string, listener: () => void): void;
};

function fakeSelect(): FakeSelect {
  const select: FakeSelect = {
    hidden: false,
    value: "",
    options: [],
    changes: [],
    replaceChildren() {
      select.options.length = 0;
      select.value = "";
    },
    append(option) {
      select.options.push(option);
    },
    addEventListener(type, listener) {
      if (type === "change") {
        select.changes.push(listener);
      }
    },
  };
  return select;
}

type FakeKeyEvent = {
  key: string;
  stopPropagation(): void;
};

type FakeDocument = {
  createElement(tagName: string): FakeOption;
  addEventListener(type: string, listener: (event: FakeKeyEvent) => void): void;
  keydowns: ((event: FakeKeyEvent) => void)[];
  escape(): void;
};

function fakeDocument(): FakeDocument {
  const doc: FakeDocument = {
    createElement() {
      return { value: "", textContent: "" };
    },
    addEventListener(type, listener) {
      if (type === "keydown") {
        doc.keydowns.push(listener);
      }
    },
    keydowns: [],
    escape() {
      const event: FakeKeyEvent = {
        key: "Escape",
        stopPropagation() {
          return undefined;
        },
      };
      for (let i = 0; i < doc.keydowns.length; i += 1) {
        doc.keydowns[i]?.(event);
      }
    },
  };
  return doc;
}

function fakePanelRoot(): {
  root: HTMLElement;
  lightning: FakeButton;
  heal: FakeButton;
  speed: FakeButton;
  targetSelect: FakeSelect;
  hint: FakeText;
  doc: FakeDocument;
} {
  const lightning = fakeButton();
  const heal = fakeButton();
  const speed = fakeButton();
  const targetSelect = fakeSelect();
  const hint = { textContent: "" };
  const doc = fakeDocument();
  const buttons = new Map<string, FakeButton>([
    ["#cast-lightning", lightning],
    ["#cast-heal", heal],
    ["#cast-speed-imps", speed],
  ]);
  const root = {
    querySelector(selector: string): FakeButton | FakeSelect | FakeText | null {
      if (selector === "#spell-target") {
        return targetSelect;
      }
      if (selector === "#spell-target-hint") {
        return hint;
      }
      return buttons.get(selector) ?? null;
    },
    ownerDocument: doc,
  } as unknown as HTMLElement;
  return { root, lightning, heal, speed, targetSelect, hint, doc };
}

function createPanel(root: HTMLElement): {
  panel: ReturnType<typeof createSpellPanel>;
  commands: unknown[];
} {
  const commands: unknown[] = [];
  const panel = createSpellPanel(
    root,
    () => asTick(12),
    (heroId) => {
      commands.push({ kind: "castLightning", tick: 12, heroId });
    },
    (creatureId) => {
      commands.push({ kind: "castHeal", tick: 12, creatureId });
    },
    () => {
      commands.push({ kind: "castSpeedImps", tick: 12 });
    },
  );
  return { panel, commands };
}

function sync(panel: ReturnType<typeof createSpellPanel>, world: Partial<SpellWorldState>): void {
  panel.sync({
    gold: 1000,
    lightningCooldown: 0,
    healCooldown: 0,
    speedImpsCooldown: 0,
    defeated: false,
    victorious: false,
    heroes: [],
    creatures: [],
    eligibleImpCount: 0,
    ...world,
  });
}

function click(button: FakeButton): void {
  const handler = button.clicks[0];
  if (handler === undefined) {
    throw new Error("click handler was not registered");
  }
  handler();
}

describe("spell panel affordability and cooldowns", () => {
  it("disables lightning when gold is short and enables it when affordable with a hero", () => {
    const { root, lightning } = fakePanelRoot();
    const { panel } = createPanel(root);
    sync(panel, {
      gold: LIGHTNING_COST - 1,
      heroes: [{ id: 3, tileX: 40, tileY: 32, hp: 4 }],
    });
    expect(lightning.disabled).toBe(true);
    expect(lightning.cost.textContent).toBe(`${String(LIGHTNING_COST)}g`);
    expect(lightning.status.textContent).toBe("ready");
    sync(panel, {
      gold: LIGHTNING_COST,
      heroes: [{ id: 3, tileX: 40, tileY: 32, hp: 4 }],
    });
    expect(lightning.disabled).toBe(false);
  });

  it("disables spells while cooling, defeated, victorious, paused or replaying", () => {
    const { root, lightning, heal, speed } = fakePanelRoot();
    const { panel } = createPanel(root);
    const base: Partial<SpellWorldState> = {
      gold: 1000,
      heroes: [{ id: 3, tileX: 40, tileY: 32, hp: 4 }],
      creatures: [{ id: 2, tileX: 31, tileY: 31, hp: 3, kind: "fly" }],
      eligibleImpCount: 2,
    };
    sync(panel, { ...base, lightningCooldown: 5, healCooldown: 7, speedImpsCooldown: 9 });
    expect(lightning.disabled).toBe(true);
    expect(heal.disabled).toBe(true);
    expect(speed.disabled).toBe(true);
    expect(lightning.status.textContent).toBe("cd 5");
    expect(heal.status.textContent).toBe("cd 7");
    expect(speed.status.textContent).toBe("cd 9");
    sync(panel, { ...base, defeated: true });
    expect(lightning.disabled).toBe(true);
    sync(panel, { ...base, victorious: true });
    expect(lightning.disabled).toBe(true);
    sync(panel, base);
    panel.setPaused(true);
    expect(lightning.disabled).toBe(true);
    panel.setPaused(false);
    expect(lightning.disabled).toBe(false);
    panel.setReplaying(true);
    expect(lightning.disabled).toBe(true);
    panel.setReplaying(false);
    expect(lightning.disabled).toBe(false);
  });
});

describe("spell panel targeting", () => {
  it("arms lightning, fills the target select and casts at the selected hero", () => {
    const { root, lightning, targetSelect, hint } = fakePanelRoot();
    const { panel, commands } = createPanel(root);
    sync(panel, {
      gold: 1000,
      heroes: [
        { id: 3, tileX: 40, tileY: 32, hp: 4 },
        { id: 7, tileX: 38, tileY: 31, hp: 4 },
      ],
    });
    click(lightning);
    expect(panel.armed()).toBe("lightning");
    expect(lightning.pressed).toBe("true");
    expect(targetSelect.hidden).toBe(false);
    expect(targetSelect.options.map((option) => option.value)).toEqual(["3", "7"]);
    expect(targetSelect.options.map((option) => option.textContent)).toEqual([
      "hero #3 @ 40,32",
      "hero #7 @ 38,31",
    ]);
    expect(hint.textContent).toBe("Click a hero");
    targetSelect.value = "7";
    const change = targetSelect.changes[0];
    if (change === undefined) {
      throw new Error("target change handler was not registered");
    }
    change();
    click(lightning);
    expect(commands).toEqual([{ kind: "castLightning", tick: 12, heroId: 7 }]);
    expect(panel.armed()).toBe("none");
    expect(lightning.pressed).toBe("false");
    expect(targetSelect.hidden).toBe(true);
  });

  it("arms heal and casts at the selected creature", () => {
    const { root, heal, targetSelect, hint } = fakePanelRoot();
    const { panel, commands } = createPanel(root);
    sync(panel, {
      gold: 1000,
      creatures: [{ id: 2, tileX: 31, tileY: 31, hp: 3, kind: "fly" }],
    });
    click(heal);
    expect(panel.armed()).toBe("heal");
    expect(heal.pressed).toBe("true");
    expect(targetSelect.options.map((option) => option.textContent)).toEqual(["fly #2 @ 31,31"]);
    expect(hint.textContent).toBe("Click a creature");
    click(heal);
    expect(commands).toEqual([{ kind: "castHeal", tick: 12, creatureId: 2 }]);
    expect(panel.armed()).toBe("none");
  });

  it("does not arm when there is no live target", () => {
    const { root, lightning, heal } = fakePanelRoot();
    const { panel } = createPanel(root);
    sync(panel, { gold: 1000 });
    click(lightning);
    expect(panel.armed()).toBe("none");
    click(heal);
    expect(panel.armed()).toBe("none");
  });

  it("cancels an arm when its selected target disappears", () => {
    const { root, lightning } = fakePanelRoot();
    const { panel } = createPanel(root);
    sync(panel, {
      gold: 1000,
      heroes: [
        { id: 3, tileX: 40, tileY: 32, hp: 4 },
        { id: 7, tileX: 38, tileY: 31, hp: 4 },
      ],
    });
    click(lightning);
    sync(panel, {
      gold: 1000,
      heroes: [{ id: 3, tileX: 40, tileY: 32, hp: 4 }],
    });
    expect(panel.armed()).toBe("lightning");
    sync(panel, { gold: 1000 });
    expect(panel.armed()).toBe("none");
  });

  it("cancels an arm on escape", () => {
    const { root, lightning, doc } = fakePanelRoot();
    const { panel } = createPanel(root);
    sync(panel, {
      gold: 1000,
      heroes: [{ id: 3, tileX: 40, tileY: 32, hp: 4 }],
    });
    click(lightning);
    expect(panel.armed()).toBe("lightning");
    doc.escape();
    expect(panel.armed()).toBe("none");
  });
});

describe("spell panel command log", () => {
  it("enqueues speed imps with no target id", () => {
    const { root, speed } = fakePanelRoot();
    const { panel, commands } = createPanel(root);
    sync(panel, { gold: 1000, eligibleImpCount: 4 });
    click(speed);
    expect(commands).toEqual([{ kind: "castSpeedImps", tick: 12 }]);
    expect(panel.armed()).toBe("none");
  });

  it("does not enqueue when a spell is unaffordable or cooling", () => {
    const { root, lightning, heal, speed } = fakePanelRoot();
    const { panel, commands } = createPanel(root);
    const targets: Partial<SpellWorldState> = {
      heroes: [{ id: 3, tileX: 40, tileY: 32, hp: 4 }],
      creatures: [{ id: 2, tileX: 31, tileY: 31, hp: 3, kind: "fly" }],
      eligibleImpCount: 2,
    };
    sync(panel, { ...targets, gold: 0 });
    click(lightning);
    click(heal);
    click(speed);
    expect(commands).toEqual([]);
    sync(panel, {
      ...targets,
      gold: 1000,
      lightningCooldown: 5,
      healCooldown: 5,
      speedImpsCooldown: 5,
    });
    click(lightning);
    click(heal);
    click(speed);
    expect(commands).toEqual([]);
    expect(lightning.cost.textContent).toBe(`${String(LIGHTNING_COST)}g`);
    expect(heal.cost.textContent).toBe(`${String(HEAL_COST)}g`);
    expect(speed.cost.textContent).toBe(`${String(SPEED_IMPS_COST)}g`);
  });
});

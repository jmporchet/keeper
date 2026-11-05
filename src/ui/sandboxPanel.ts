import type { Command, RoomTool, Tick } from "../sim";
import {
  parseSave,
  SAVE_STORAGE_KEY,
  serializeSave,
  type Save,
} from "../sim/save";

export type SandboxAction = "spawnImp" | "addGold";

export function sandboxCommand(action: SandboxAction, tick: Tick): Command {
  switch (action) {
    case "spawnImp":
      return { kind: "spawnImp", tick };
    case "addGold":
      return { kind: "addGold", tick, amount: 100 };
    default: {
      const never: never = action;
      return never;
    }
  }
}

export type SandboxPanel = {
  setPaused(paused: boolean): void;
  setReplaying(replaying: boolean): void;
  setPainting(painting: boolean, room: RoomTool): void;
};

export function createSandboxPanel(
  root: HTMLElement | null,
  getTick: () => Tick,
  enqueue: (command: Command) => void,
  togglePaint: (room: RoomTool) => void,
  getSave: () => Save,
  onLoad: (save: Save) => void,
): SandboxPanel {
  const spawnButton = root === null ? null : root.querySelector<HTMLButtonElement>("#spawn-imp");
  const goldButton = root === null ? null : root.querySelector<HTMLButtonElement>("#add-gold");
  const paintTreasuryButton = root === null ? null : root.querySelector<HTMLButtonElement>("#paint-treasury");
  const paintLairButton = root === null ? null : root.querySelector<HTMLButtonElement>("#paint-lair");
  const paintHatcheryButton = root === null ? null : root.querySelector<HTMLButtonElement>("#paint-hatchery");
  const saveButton = root === null ? null : root.querySelector<HTMLButtonElement>("#save-game");
  const loadButton = root === null ? null : root.querySelector<HTMLButtonElement>("#load-game");
  const fileInput = root === null ? null : root.querySelector<HTMLInputElement>("#load-file");
  let paused = false;
  let replaying = false;

  function syncDisabled(): void {
    if (spawnButton !== null) {
      spawnButton.disabled = paused || replaying;
    }
    if (goldButton !== null) {
      goldButton.disabled = paused || replaying;
    }
    if (paintTreasuryButton !== null) {
      paintTreasuryButton.disabled = paused || replaying;
    }
    if (paintLairButton !== null) {
      paintLairButton.disabled = paused || replaying;
    }
    if (paintHatcheryButton !== null) {
      paintHatcheryButton.disabled = paused || replaying;
    }
    if (saveButton !== null) {
      saveButton.disabled = replaying;
    }
    if (loadButton !== null) {
      loadButton.disabled = replaying;
    }
  }

  if (spawnButton !== null) {
    spawnButton.addEventListener("click", () => {
      if (paused || replaying) {
        return;
      }
      enqueue(sandboxCommand("spawnImp", getTick()));
    });
  }
  if (goldButton !== null) {
    goldButton.addEventListener("click", () => {
      if (paused || replaying) {
        return;
      }
      enqueue(sandboxCommand("addGold", getTick()));
    });
  }
  if (paintTreasuryButton !== null) {
    paintTreasuryButton.addEventListener("click", () => {
      if (paused || replaying) {
        return;
      }
      togglePaint("treasury");
    });
  }
  if (paintLairButton !== null) {
    paintLairButton.addEventListener("click", () => {
      if (paused || replaying) {
        return;
      }
      togglePaint("lair");
    });
  }
  if (paintHatcheryButton !== null) {
    paintHatcheryButton.addEventListener("click", () => {
      if (paused || replaying) {
        return;
      }
      togglePaint("hatchery");
    });
  }
  if (saveButton !== null) {
    saveButton.addEventListener("click", () => {
      if (replaying) {
        return;
      }
      const save = getSave();
      const text = serializeSave(save);
      localStorage.setItem(SAVE_STORAGE_KEY, text);
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "keeper-save.json";
      link.click();
      URL.revokeObjectURL(url);
    });
  }
  if (loadButton !== null) {
    loadButton.addEventListener("click", () => {
      if (replaying) {
        return;
      }
      const stored = localStorage.getItem(SAVE_STORAGE_KEY);
      if (stored !== null) {
        const parsed = parseSave(stored);
        if (parsed.ok) {
          onLoad(parsed.save);
          return;
        }
      }
      if (fileInput !== null) {
        fileInput.value = "";
        fileInput.click();
      }
    });
  }
  if (fileInput !== null) {
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file === undefined) {
        return;
      }
      file.text().then((text) => {
        const parsed = parseSave(text);
        if (parsed.ok) {
          onLoad(parsed.save);
        }
      });
    });
  }

  function setPaused(next: boolean): void {
    if (paused === next) {
      return;
    }
    paused = next;
    syncDisabled();
  }

  function setReplaying(next: boolean): void {
    if (replaying === next) {
      return;
    }
    replaying = next;
    syncDisabled();
  }

  function setPainting(painting: boolean, room: RoomTool): void {
    if (paintTreasuryButton !== null) {
      paintTreasuryButton.setAttribute("aria-pressed", painting && room === "treasury" ? "true" : "false");
    }
    if (paintLairButton !== null) {
      paintLairButton.setAttribute("aria-pressed", painting && room === "lair" ? "true" : "false");
    }
    if (paintHatcheryButton !== null) {
      paintHatcheryButton.setAttribute("aria-pressed", painting && room === "hatchery" ? "true" : "false");
    }
  }

  return { setPaused, setReplaying, setPainting };
}

import type { Command, PaintTool, Tick } from "../sim";
import {
  parseSave,
  SAVE_STORAGE_KEY,
  serializeSave,
  type Save,
} from "../sim/save";

export type SandboxAction = "spawnImp" | "addGold" | "repairHeart";

export function sandboxCommand(action: SandboxAction, tick: Tick): Command {
  switch (action) {
    case "spawnImp":
      return { kind: "spawnImp", tick };
    case "addGold":
      return { kind: "addGold", tick, amount: 100 };
    case "repairHeart":
      return { kind: "repairHeart", tick };
    default: {
      const never: never = action;
      return never;
    }
  }
}

export type SandboxPanel = {
  setPaused(paused: boolean): void;
  setReplaying(replaying: boolean): void;
  setPainting(painting: boolean, tool: PaintTool): void;
  setPossessed(possessed: boolean): void;
};

export function createSandboxPanel(
  root: HTMLElement | null,
  getTick: () => Tick,
  enqueue: (command: Command) => void,
  togglePaint: (tool: PaintTool) => void,
  getSave: () => Save,
  onLoad: (save: Save) => void,
  onPossess: () => void,
  onLightning: () => void,
  onHeal: () => void,
): SandboxPanel {
  const spawnButton = root === null ? null : root.querySelector<HTMLButtonElement>("#spawn-imp");
  const goldButton = root === null ? null : root.querySelector<HTMLButtonElement>("#add-gold");
  const repairHeartButton = root === null ? null : root.querySelector<HTMLButtonElement>("#repair-heart");
  const lightningButton = root === null ? null : root.querySelector<HTMLButtonElement>("#cast-lightning");
  const healButton = root === null ? null : root.querySelector<HTMLButtonElement>("#cast-heal");
  const paintTreasuryButton = root === null ? null : root.querySelector<HTMLButtonElement>("#paint-treasury");
  const paintLairButton = root === null ? null : root.querySelector<HTMLButtonElement>("#paint-lair");
  const paintHatcheryButton = root === null ? null : root.querySelector<HTMLButtonElement>("#paint-hatchery");
  const paintTrainingButton = root === null ? null : root.querySelector<HTMLButtonElement>("#paint-training");
  const paintWorkshopButton = root === null ? null : root.querySelector<HTMLButtonElement>("#paint-workshop");
  const paintLibraryButton = root === null ? null : root.querySelector<HTMLButtonElement>("#paint-library");
  const paintDoorButton = root === null ? null : root.querySelector<HTMLButtonElement>("#paint-door");
  const paintTrapButton = root === null ? null : root.querySelector<HTMLButtonElement>("#paint-trap");
  const possessButton = root === null ? null : root.querySelector<HTMLButtonElement>("#possess");
  const saveButton = root === null ? null : root.querySelector<HTMLButtonElement>("#save-game");
  const loadButton = root === null ? null : root.querySelector<HTMLButtonElement>("#load-game");
  const fileInput = root === null ? null : root.querySelector<HTMLInputElement>("#load-file");
  let paused = false;
  let replaying = false;
  let possessed = false;

  function syncDisabled(): void {
    if (spawnButton !== null) {
      spawnButton.disabled = paused || replaying;
    }
    if (goldButton !== null) {
      goldButton.disabled = paused || replaying;
    }
    if (repairHeartButton !== null) {
      repairHeartButton.disabled = paused || replaying;
    }
    if (lightningButton !== null) {
      lightningButton.disabled = paused || replaying;
    }
    if (healButton !== null) {
      healButton.disabled = paused || replaying;
    }
    if (paintTreasuryButton !== null) {
      paintTreasuryButton.disabled = paused || replaying || possessed;
    }
    if (paintLairButton !== null) {
      paintLairButton.disabled = paused || replaying || possessed;
    }
    if (paintHatcheryButton !== null) {
      paintHatcheryButton.disabled = paused || replaying || possessed;
    }
    if (paintTrainingButton !== null) {
      paintTrainingButton.disabled = paused || replaying || possessed;
    }
    if (paintWorkshopButton !== null) {
      paintWorkshopButton.disabled = paused || replaying || possessed;
    }
    if (paintLibraryButton !== null) {
      paintLibraryButton.disabled = paused || replaying || possessed;
    }
    if (paintDoorButton !== null) {
      paintDoorButton.disabled = paused || replaying || possessed;
    }
    if (paintTrapButton !== null) {
      paintTrapButton.disabled = paused || replaying || possessed;
    }
    if (possessButton !== null) {
      possessButton.disabled = paused || replaying || possessed;
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
  if (repairHeartButton !== null) {
    repairHeartButton.addEventListener("click", () => {
      if (paused || replaying) {
        return;
      }
      enqueue(sandboxCommand("repairHeart", getTick()));
    });
  }
  if (lightningButton !== null) {
    lightningButton.addEventListener("click", () => {
      if (paused || replaying) {
        return;
      }
      onLightning();
    });
  }
  if (healButton !== null) {
    healButton.addEventListener("click", () => {
      if (paused || replaying) {
        return;
      }
      onHeal();
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
  if (paintTrainingButton !== null) {
    paintTrainingButton.addEventListener("click", () => {
      if (paused || replaying) {
        return;
      }
      togglePaint("training");
    });
  }
  if (paintWorkshopButton !== null) {
    paintWorkshopButton.addEventListener("click", () => {
      if (paused || replaying) {
        return;
      }
      togglePaint("workshop");
    });
  }
  if (paintLibraryButton !== null) {
    paintLibraryButton.addEventListener("click", () => {
      if (paused || replaying) {
        return;
      }
      togglePaint("library");
    });
  }
  if (paintDoorButton !== null) {
    paintDoorButton.addEventListener("click", () => {
      if (paused || replaying) {
        return;
      }
      togglePaint("door");
    });
  }
  if (paintTrapButton !== null) {
    paintTrapButton.addEventListener("click", () => {
      if (paused || replaying) {
        return;
      }
      togglePaint("trap");
    });
  }
  if (possessButton !== null) {
    possessButton.addEventListener("click", () => {
      if (paused || replaying || possessed) {
        return;
      }
      onPossess();
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

  function setPainting(painting: boolean, tool: PaintTool): void {
    if (paintTreasuryButton !== null) {
      paintTreasuryButton.setAttribute("aria-pressed", painting && tool === "treasury" ? "true" : "false");
    }
    if (paintLairButton !== null) {
      paintLairButton.setAttribute("aria-pressed", painting && tool === "lair" ? "true" : "false");
    }
    if (paintHatcheryButton !== null) {
      paintHatcheryButton.setAttribute("aria-pressed", painting && tool === "hatchery" ? "true" : "false");
    }
    if (paintTrainingButton !== null) {
      paintTrainingButton.setAttribute("aria-pressed", painting && tool === "training" ? "true" : "false");
    }
    if (paintWorkshopButton !== null) {
      paintWorkshopButton.setAttribute("aria-pressed", painting && tool === "workshop" ? "true" : "false");
    }
    if (paintLibraryButton !== null) {
      paintLibraryButton.setAttribute("aria-pressed", painting && tool === "library" ? "true" : "false");
    }
    if (paintDoorButton !== null) {
      paintDoorButton.setAttribute("aria-pressed", painting && tool === "door" ? "true" : "false");
    }
    if (paintTrapButton !== null) {
      paintTrapButton.setAttribute("aria-pressed", painting && tool === "trap" ? "true" : "false");
    }
  }

  function setPossessed(next: boolean): void {
    if (possessed === next) {
      return;
    }
    possessed = next;
    syncDisabled();
  }

  return { setPaused, setReplaying, setPainting, setPossessed };
}

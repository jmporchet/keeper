import type { Command, RoomTool, Tick } from "../sim";

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
  setPainting(painting: boolean, room: RoomTool): void;
};

export function createSandboxPanel(
  root: HTMLElement | null,
  getTick: () => Tick,
  enqueue: (command: Command) => void,
  togglePaint: (room: RoomTool) => void,
): SandboxPanel {
  const spawnButton = root === null ? null : root.querySelector<HTMLButtonElement>("#spawn-imp");
  const goldButton = root === null ? null : root.querySelector<HTMLButtonElement>("#add-gold");
  const paintTreasuryButton = root === null ? null : root.querySelector<HTMLButtonElement>("#paint-treasury");
  const paintLairButton = root === null ? null : root.querySelector<HTMLButtonElement>("#paint-lair");
  let paused = false;

  if (spawnButton !== null) {
    spawnButton.addEventListener("click", () => {
      if (paused) {
        return;
      }
      enqueue(sandboxCommand("spawnImp", getTick()));
    });
  }
  if (goldButton !== null) {
    goldButton.addEventListener("click", () => {
      if (paused) {
        return;
      }
      enqueue(sandboxCommand("addGold", getTick()));
    });
  }
  if (paintTreasuryButton !== null) {
    paintTreasuryButton.addEventListener("click", () => {
      if (paused) {
        return;
      }
      togglePaint("treasury");
    });
  }
  if (paintLairButton !== null) {
    paintLairButton.addEventListener("click", () => {
      if (paused) {
        return;
      }
      togglePaint("lair");
    });
  }

  function setPaused(next: boolean): void {
    if (paused === next) {
      return;
    }
    paused = next;
    if (spawnButton !== null) {
      spawnButton.disabled = next;
    }
    if (goldButton !== null) {
      goldButton.disabled = next;
    }
    if (paintTreasuryButton !== null) {
      paintTreasuryButton.disabled = next;
    }
    if (paintLairButton !== null) {
      paintLairButton.disabled = next;
    }
  }

  function setPainting(painting: boolean, room: RoomTool): void {
    if (paintTreasuryButton !== null) {
      paintTreasuryButton.setAttribute("aria-pressed", painting && room === "treasury" ? "true" : "false");
    }
    if (paintLairButton !== null) {
      paintLairButton.setAttribute("aria-pressed", painting && room === "lair" ? "true" : "false");
    }
  }

  return { setPaused, setPainting };
}

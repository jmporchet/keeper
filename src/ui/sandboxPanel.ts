import type { Command, Tick } from "../sim";

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
};

export function createSandboxPanel(
  root: HTMLElement | null,
  getTick: () => Tick,
  enqueue: (command: Command) => void,
): SandboxPanel {
  const spawnButton = root === null ? null : root.querySelector<HTMLButtonElement>("#spawn-imp");
  const goldButton = root === null ? null : root.querySelector<HTMLButtonElement>("#add-gold");
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
  }

  return { setPaused };
}

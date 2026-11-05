import {
  asCreatureId,
  asHeroId,
  HEAL_COST,
  LIGHTNING_COST,
  SPEED_IMPS_COST,
  type CreatureId,
  type HeroId,
  type Tick,
} from "../sim";

export type SpellArm = "none" | "lightning" | "heal";

export type SpellHero = {
  id: number;
  tileX: number;
  tileY: number;
  hp: number;
};

export type SpellCreature = {
  id: number;
  tileX: number;
  tileY: number;
  hp: number;
  kind: string;
};

export type SpellWorldState = {
  gold: number;
  lightningCooldown: number;
  healCooldown: number;
  speedImpsCooldown: number;
  defeated: boolean;
  victorious: boolean;
  heroes: ReadonlyArray<SpellHero>;
  creatures: ReadonlyArray<SpellCreature>;
  eligibleImpCount: number;
};

export type SpellPanel = {
  setPaused(paused: boolean): void;
  setReplaying(replaying: boolean): void;
  sync(world: SpellWorldState): void;
  armed(): SpellArm;
  cancelArm(): void;
  tryCastLightningAt(heroId: number): void;
  tryCastHealAt(creatureId: number): void;
};

type SpellTargetOption = {
  id: number;
  label: string;
};

function setText(element: HTMLElement | null, text: string): void {
  if (element !== null && element.textContent !== text) {
    element.textContent = text;
  }
}

function setButtonState(button: HTMLButtonElement | null, disabled: boolean, pressed: boolean): void {
  if (button === null) {
    return;
  }
  if (button.disabled !== disabled) {
    button.disabled = disabled;
  }
  button.setAttribute("aria-pressed", pressed ? "true" : "false");
}

export function createSpellPanel(
  root: HTMLElement | null,
  getTick: () => Tick,
  enqueueCastLightning: (heroId: HeroId) => void,
  enqueueCastHeal: (creatureId: CreatureId) => void,
  enqueueCastSpeedImps: () => void,
): SpellPanel {
  const lightningButton = root === null ? null : root.querySelector<HTMLButtonElement>("#cast-lightning");
  const healButton = root === null ? null : root.querySelector<HTMLButtonElement>("#cast-heal");
  const speedButton = root === null ? null : root.querySelector<HTMLButtonElement>("#cast-speed-imps");
  const lightningCost = lightningButton === null ? null : lightningButton.querySelector<HTMLElement>(".spell-cost");
  const lightningStatus = lightningButton === null ? null : lightningButton.querySelector<HTMLElement>(".spell-status");
  const healCost = healButton === null ? null : healButton.querySelector<HTMLElement>(".spell-cost");
  const healStatus = healButton === null ? null : healButton.querySelector<HTMLElement>(".spell-status");
  const speedCost = speedButton === null ? null : speedButton.querySelector<HTMLElement>(".spell-cost");
  const speedStatus = speedButton === null ? null : speedButton.querySelector<HTMLElement>(".spell-status");
  const targetSelect = root === null ? null : root.querySelector<HTMLSelectElement>("#spell-target");
  const targetHint = root === null ? null : root.querySelector<HTMLElement>("#spell-target-hint");
  const doc = root === null ? undefined : root.ownerDocument;
  let paused = false;
  let replaying = false;
  let defeated = false;
  let victorious = false;
  let arm: SpellArm = "none";
  let selectedId: number | undefined;
  let heroes: ReadonlyArray<SpellHero> = [];
  let creatures: ReadonlyArray<SpellCreature> = [];
  let gold = 0;
  let lightningCooldown = 0;
  let healCooldown = 0;
  let speedImpsCooldown = 0;
  let eligibleImpCount = 0;
  let lightningDisabled = true;
  let healDisabled = true;
  let speedDisabled = true;

  function armTargets(): SpellTargetOption[] {
    const targets: SpellTargetOption[] = [];
    if (arm === "lightning") {
      for (let i = 0; i < heroes.length; i += 1) {
        const hero = heroes[i];
        if (hero === undefined) {
          continue;
        }
        targets.push({
          id: hero.id,
          label: `hero #${String(hero.id)} @ ${String(hero.tileX)},${String(hero.tileY)}`,
        });
      }
    } else if (arm === "heal") {
      for (let i = 0; i < creatures.length; i += 1) {
        const creature = creatures[i];
        if (creature === undefined) {
          continue;
        }
        targets.push({
          id: creature.id,
          label: `${creature.kind} #${String(creature.id)} @ ${String(creature.tileX)},${String(creature.tileY)}`,
        });
      }
    }
    return targets;
  }

  function hasTarget(id: number): boolean {
    if (arm === "lightning") {
      for (let i = 0; i < heroes.length; i += 1) {
        const hero = heroes[i];
        if (hero !== undefined && hero.id === id) {
          return true;
        }
      }
      return false;
    }
    if (arm === "heal") {
      for (let i = 0; i < creatures.length; i += 1) {
        const creature = creatures[i];
        if (creature !== undefined && creature.id === id) {
          return true;
        }
      }
    }
    return false;
  }

  function renderTargets(): void {
    const targets = armTargets();
    if (targetSelect !== null) {
      if (doc !== undefined) {
        targetSelect.replaceChildren();
        for (let i = 0; i < targets.length; i += 1) {
          const target = targets[i];
          if (target === undefined) {
            continue;
          }
          const option = doc.createElement("option");
          option.value = String(target.id);
          option.textContent = target.label;
          targetSelect.append(option);
        }
      }
      targetSelect.hidden = arm === "none";
      if (selectedId === undefined || !hasTarget(selectedId)) {
        selectedId = targets.length === 0 ? undefined : targets[0]?.id;
      }
      if (selectedId !== undefined) {
        targetSelect.value = String(selectedId);
      }
    }
    if (targetHint !== null) {
      targetHint.textContent = arm === "lightning" ? "Click a hero" : arm === "heal" ? "Click a creature" : "";
    }
  }

  function updatePressed(): void {
    if (lightningButton !== null) {
      lightningButton.setAttribute("aria-pressed", arm === "lightning" ? "true" : "false");
    }
    if (healButton !== null) {
      healButton.setAttribute("aria-pressed", arm === "heal" ? "true" : "false");
    }
    if (speedButton !== null) {
      speedButton.setAttribute("aria-pressed", "false");
    }
  }

  function cancelArm(): void {
    arm = "none";
    selectedId = undefined;
    renderTargets();
    updatePressed();
  }

  function armSpell(next: "lightning" | "heal"): void {
    const targetCount = next === "lightning" ? heroes.length : creatures.length;
    if (targetCount === 0) {
      return;
    }
    arm = next;
    selectedId = undefined;
    renderTargets();
    updatePressed();
  }

  function castLightning(heroId: number): void {
    if (lightningDisabled || !hasTarget(heroId)) {
      return;
    }
    enqueueCastLightning(asHeroId(heroId));
    cancelArm();
  }

  function castHeal(creatureId: number): void {
    if (healDisabled || !hasTarget(creatureId)) {
      return;
    }
    enqueueCastHeal(asCreatureId(creatureId));
    cancelArm();
  }

  function refreshDisabled(): void {
    const endgame = paused || replaying || defeated || victorious;
    lightningDisabled = endgame || lightningCooldown > 0 || gold < LIGHTNING_COST || heroes.length === 0;
    healDisabled = endgame || healCooldown > 0 || gold < HEAL_COST || creatures.length === 0;
    speedDisabled = endgame || speedImpsCooldown > 0 || gold < SPEED_IMPS_COST || eligibleImpCount === 0;
    setText(lightningCost, `${String(LIGHTNING_COST)}g`);
    setText(lightningStatus, lightningCooldown === 0 ? "ready" : `cd ${String(lightningCooldown)}`);
    setText(healCost, `${String(HEAL_COST)}g`);
    setText(healStatus, healCooldown === 0 ? "ready" : `cd ${String(healCooldown)}`);
    setText(speedCost, `${String(SPEED_IMPS_COST)}g`);
    setText(speedStatus, speedImpsCooldown === 0 ? "ready" : `cd ${String(speedImpsCooldown)}`);
    setButtonState(lightningButton, lightningDisabled, arm === "lightning");
    setButtonState(healButton, healDisabled, arm === "heal");
    setButtonState(speedButton, speedDisabled, false);
  }

  if (lightningButton !== null) {
    lightningButton.addEventListener("click", () => {
      if (lightningDisabled) {
        return;
      }
      if (arm === "lightning" && selectedId !== undefined) {
        castLightning(selectedId);
        return;
      }
      armSpell("lightning");
    });
  }
  if (healButton !== null) {
    healButton.addEventListener("click", () => {
      if (healDisabled) {
        return;
      }
      if (arm === "heal" && selectedId !== undefined) {
        castHeal(selectedId);
        return;
      }
      armSpell("heal");
    });
  }
  if (speedButton !== null) {
    speedButton.addEventListener("click", () => {
      if (speedDisabled) {
        return;
      }
      enqueueCastSpeedImps();
    });
  }
  if (targetSelect !== null) {
    targetSelect.addEventListener("change", () => {
      if (targetSelect.value === "") {
        selectedId = undefined;
        return;
      }
      const parsed = Number.parseInt(targetSelect.value, 10);
      selectedId = Number.isNaN(parsed) ? undefined : parsed;
    });
  }
  if (doc !== undefined) {
    doc.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || arm === "none") {
        return;
      }
      cancelArm();
      event.stopPropagation();
    });
  }

  function setPaused(next: boolean): void {
    paused = next;
    if (next) {
      cancelArm();
    }
    refreshDisabled();
  }

  function setReplaying(next: boolean): void {
    replaying = next;
    if (next) {
      cancelArm();
    }
    refreshDisabled();
  }

  function sync(world: SpellWorldState): void {
    gold = world.gold;
    lightningCooldown = world.lightningCooldown;
    healCooldown = world.healCooldown;
    speedImpsCooldown = world.speedImpsCooldown;
    defeated = world.defeated;
    victorious = world.victorious;
    heroes = world.heroes;
    creatures = world.creatures;
    eligibleImpCount = world.eligibleImpCount;
    if (arm !== "none") {
      if (paused || replaying || defeated || victorious) {
        cancelArm();
      } else if (armTargets().length === 0) {
        cancelArm();
      } else {
        renderTargets();
        updatePressed();
      }
    } else {
      renderTargets();
    }
    refreshDisabled();
  }

  function armed(): SpellArm {
    return arm;
  }

  function tryCastLightningAt(heroId: number): void {
    if (lightningDisabled) {
      return;
    }
    if (heroId < 0) {
      return;
    }
    for (let i = 0; i < heroes.length; i += 1) {
      const hero = heroes[i];
      if (hero !== undefined && hero.id === heroId) {
        enqueueCastLightning(asHeroId(heroId));
        cancelArm();
        return;
      }
    }
  }

  function tryCastHealAt(creatureId: number): void {
    if (healDisabled) {
      return;
    }
    if (creatureId < 0) {
      return;
    }
    for (let i = 0; i < creatures.length; i += 1) {
      const creature = creatures[i];
      if (creature !== undefined && creature.id === creatureId) {
        enqueueCastHeal(asCreatureId(creatureId));
        cancelArm();
        return;
      }
    }
  }

  return {
    setPaused,
    setReplaying,
    sync,
    armed,
    cancelArm,
    tryCastLightningAt,
    tryCastHealAt,
  };
}

import { DEFEAT_TICKS } from "../sim";

export type HudElement = {
  textContent: string | null;
};

export function hudGold(goldStored: number, treasuryStock: number): number {
  return goldStored + treasuryStock;
}

function formatPay(ticksUntilPayday: number): string {
  return ticksUntilPayday === 0 ? "pay now" : `pay ${String(ticksUntilPayday)}`;
}

function formatLightning(lightningCooldown: number): string {
  return lightningCooldown === 0 ? "ready" : String(lightningCooldown);
}

function formatHeal(healCooldown: number): string {
  return healCooldown === 0 ? "ready" : String(healCooldown);
}

function formatHeart(
  heartHp: number,
  heartBreached: boolean,
  breachTicks: number,
  defeated: boolean,
  victorious: boolean,
): string {
  if (victorious) {
    return "victory";
  }
  if (defeated) {
    return "defeated";
  }
  if (heartBreached) {
    return `breach ${String(DEFEAT_TICKS - breachTicks)}`;
  }
  return `heart ${String(heartHp)}`;
}

export function formatHud(
  gold: number,
  imps: number,
  tick: number,
  ticksUntilPayday: number,
  heartHp: number,
  heartBreached: boolean,
  breachTicks: number,
  defeated: boolean,
  victorious: boolean,
  repairsDone: number,
  lightningCooldown: number,
  healCooldown: number,
): string {
  return `gold ${String(gold)} · imps ${String(imps)} · tick ${String(tick)} · ${formatPay(ticksUntilPayday)} · ${formatHeart(heartHp, heartBreached, breachTicks, defeated, victorious)} · lightning ${formatLightning(lightningCooldown)} · heal ${formatHeal(healCooldown)} · wave ${String(repairsDone + 1)}`;
}

export function createHud(element: HudElement | null): {
  update(
    gold: number,
    imps: number,
    tick: number,
    ticksUntilPayday: number,
    heartHp: number,
    heartBreached: boolean,
    breachTicks: number,
    defeated: boolean,
    victorious: boolean,
    repairsDone: number,
    lightningCooldown: number,
    healCooldown: number,
  ): void;
} {
  let prevGold: number | undefined;
  let prevImps: number | undefined;
  let prevTick: number | undefined;
  let prevPay: number | undefined;
  let prevHeartHp: number | undefined;
  let prevHeartBreached: boolean | undefined;
  let prevBreachTicks: number | undefined;
  let prevDefeated: boolean | undefined;
  let prevVictorious: boolean | undefined;
  let prevRepairsDone: number | undefined;
  let prevLightningCooldown: number | undefined;
  let prevHealCooldown: number | undefined;
  return {
    update(
      gold: number,
      imps: number,
      tick: number,
      ticksUntilPayday: number,
      heartHp: number,
      heartBreached: boolean,
      breachTicks: number,
      defeated: boolean,
      victorious: boolean,
      repairsDone: number,
      lightningCooldown: number,
      healCooldown: number,
    ): void {
      if (
        prevGold === gold &&
        prevImps === imps &&
        prevTick === tick &&
        prevPay === ticksUntilPayday &&
        prevHeartHp === heartHp &&
        prevHeartBreached === heartBreached &&
        prevBreachTicks === breachTicks &&
        prevDefeated === defeated &&
        prevVictorious === victorious &&
        prevRepairsDone === repairsDone &&
        prevLightningCooldown === lightningCooldown &&
        prevHealCooldown === healCooldown
      ) {
        return;
      }
      prevGold = gold;
      prevImps = imps;
      prevTick = tick;
      prevPay = ticksUntilPayday;
      prevHeartHp = heartHp;
      prevHeartBreached = heartBreached;
      prevBreachTicks = breachTicks;
      prevDefeated = defeated;
      prevVictorious = victorious;
      prevRepairsDone = repairsDone;
      prevLightningCooldown = lightningCooldown;
      prevHealCooldown = healCooldown;
      if (element !== null) {
        element.textContent = formatHud(
          gold,
          imps,
          tick,
          ticksUntilPayday,
          heartHp,
          heartBreached,
          breachTicks,
          defeated,
          victorious,
          repairsDone,
          lightningCooldown,
          healCooldown,
        );
      }
    },
  };
}

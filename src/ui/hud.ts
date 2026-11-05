export type HudElement = {
  textContent: string | null;
};

export function hudGold(goldStored: number, treasuryStock: number): number {
  return goldStored + treasuryStock;
}

function formatPay(ticksUntilPayday: number): string {
  return ticksUntilPayday === 0 ? "pay now" : `pay ${String(ticksUntilPayday)}`;
}

export function formatHud(gold: number, imps: number, tick: number, ticksUntilPayday: number): string {
  return `gold ${String(gold)} · imps ${String(imps)} · tick ${String(tick)} · ${formatPay(ticksUntilPayday)}`;
}

export function createHud(element: HudElement | null): {
  update(gold: number, imps: number, tick: number, ticksUntilPayday: number): void;
} {
  let prevGold: number | undefined;
  let prevImps: number | undefined;
  let prevTick: number | undefined;
  let prevPay: number | undefined;
  return {
    update(gold: number, imps: number, tick: number, ticksUntilPayday: number): void {
      if (prevGold === gold && prevImps === imps && prevTick === tick && prevPay === ticksUntilPayday) {
        return;
      }
      prevGold = gold;
      prevImps = imps;
      prevTick = tick;
      prevPay = ticksUntilPayday;
      if (element !== null) {
        element.textContent = formatHud(gold, imps, tick, ticksUntilPayday);
      }
    },
  };
}

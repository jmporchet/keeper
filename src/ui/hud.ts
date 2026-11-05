export type HudElement = {
  textContent: string | null;
};

export function hudGold(goldStored: number, treasuryStock: number): number {
  return goldStored + treasuryStock;
}

export function formatHud(gold: number, imps: number, tick: number): string {
  return `gold ${String(gold)} · imps ${String(imps)} · tick ${String(tick)}`;
}

export function createHud(element: HudElement | null): {
  update(gold: number, imps: number, tick: number): void;
} {
  let prevGold: number | undefined;
  let prevImps: number | undefined;
  let prevTick: number | undefined;
  return {
    update(gold: number, imps: number, tick: number): void {
      if (prevGold === gold && prevImps === imps && prevTick === tick) {
        return;
      }
      prevGold = gold;
      prevImps = imps;
      prevTick = tick;
      if (element !== null) {
        element.textContent = formatHud(gold, imps, tick);
      }
    },
  };
}

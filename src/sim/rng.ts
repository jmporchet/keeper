export type RngState = {
  rng: number;
};

export function advanceRng(state: RngState): void {
  let t = (state.rng + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  state.rng = (t ^ (t >>> 14)) >>> 0;
}

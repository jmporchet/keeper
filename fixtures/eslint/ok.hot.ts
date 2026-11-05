export function tick(out: Float32Array, dt: number): void {
  for (let i = 0; i < out.length; i += 1) {
    const cur = out[i];
    if (cur === undefined) {
      continue;
    }
    out[i] = cur + dt;
  }
}

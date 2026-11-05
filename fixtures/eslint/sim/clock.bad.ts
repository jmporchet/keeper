export function noise(): number {
  return Math.random() + Date.now() + performance.now();
}

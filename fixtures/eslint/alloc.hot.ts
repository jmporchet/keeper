export function tick(xs: number[]): number[] {
  const obj = { a: 1 };
  const arr = [1];
  const made = new Error("n");
  const arrow = () => 1;
  const inner = function inner() {
    return 2;
  };
  const spread = [...arr];
  const mapped = xs.map((x) => x + 1);
  const filtered = xs.filter((x) => x > 0);
  const sliced = xs.slice(0);
  const concatted = xs.concat(arr);
  return concatted.concat(mapped, filtered, sliced, spread, [arrow(), inner(), obj.a, made.message.length]);
}

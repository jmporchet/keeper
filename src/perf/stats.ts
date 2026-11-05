function sortedCopy(values: readonly number[]): number[] {
  return values.slice().sort((a, b) => a - b);
}

export function median(values: readonly number[]): number {
  const sorted = sortedCopy(values);
  const count = sorted.length;
  if (count === 0) {
    throw new Error("median requires at least one value");
  }
  const middle = Math.floor(count / 2);
  if (count % 2 === 1) {
    const value = sorted[middle];
    if (value === undefined) {
      throw new Error("missing value");
    }
    return value;
  }
  const lower = sorted[middle - 1];
  const upper = sorted[middle];
  if (lower === undefined || upper === undefined) {
    throw new Error("missing value");
  }
  return (lower + upper) / 2;
}

export function percentile(values: readonly number[], p: number): number {
  if (p < 0 || p > 100) {
    throw new Error("percentile must be between 0 and 100");
  }
  const sorted = sortedCopy(values);
  const count = sorted.length;
  if (count === 0) {
    throw new Error("percentile requires at least one value");
  }
  if (p === 0) {
    const first = sorted[0];
    if (first === undefined) {
      throw new Error("missing value");
    }
    return first;
  }
  const rank = Math.ceil((p / 100) * count);
  const index = Math.min(rank, count) - 1;
  const value = sorted[index];
  if (value === undefined) {
    throw new Error("missing value");
  }
  return value;
}

export function max(values: readonly number[]): number {
  const first = values[0];
  if (first === undefined) {
    throw new Error("max requires at least one value");
  }
  let result = first;
  for (let i = 1; i < values.length; i += 1) {
    const value = values[i];
    if (value !== undefined && value > result) {
      result = value;
    }
  }
  return result;
}

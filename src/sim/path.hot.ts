import { isWalkableCode } from "./path";
import type { TileRead } from "./world";

export function bfsToGoal(
  tiles: TileRead,
  width: number,
  height: number,
  start: number,
  goal: number,
  queue: Int32Array,
  generation: Uint32Array,
  gen: number,
  cameFrom: Int32Array,
): boolean {
  const startCode = tiles[start];
  const goalCode = tiles[goal];
  if (startCode === undefined || goalCode === undefined) {
    return false;
  }
  if (!isWalkableCode(startCode) || !isWalkableCode(goalCode)) {
    return false;
  }
  generation[start] = gen;
  cameFrom[start] = start;
  if (start === goal) {
    return true;
  }
  queue[0] = start;
  let head = 0;
  let tail = 1;
  while (head < tail) {
    const i = queue[head];
    head += 1;
    if (i === undefined) {
      continue;
    }
    if (i === goal) {
      return true;
    }
    const y = (i / width) | 0;
    const x = i - y * width;
    tail = enqueue(tiles, width, height, x, y - 1, i, queue, generation, gen, cameFrom, tail);
    tail = enqueue(tiles, width, height, x + 1, y, i, queue, generation, gen, cameFrom, tail);
    tail = enqueue(tiles, width, height, x, y + 1, i, queue, generation, gen, cameFrom, tail);
    tail = enqueue(tiles, width, height, x - 1, y, i, queue, generation, gen, cameFrom, tail);
  }
  const goalGen = generation[goal];
  return goalGen === gen;
}

export function floodWalkable(
  tiles: TileRead,
  width: number,
  height: number,
  start: number,
  queue: Int32Array,
  generation: Uint32Array,
  gen: number,
  cameFrom: Int32Array,
  reachable: Int32Array,
): number {
  const startCode = tiles[start];
  if (startCode === undefined || !isWalkableCode(startCode)) {
    return 0;
  }
  generation[start] = gen;
  cameFrom[start] = start;
  queue[0] = start;
  reachable[0] = start;
  let head = 0;
  let tail = 1;
  let count = 1;
  while (head < tail) {
    const i = queue[head];
    head += 1;
    if (i === undefined) {
      continue;
    }
    const y = (i / width) | 0;
    const x = i - y * width;
    const beforeN = tail;
    tail = enqueue(tiles, width, height, x, y - 1, i, queue, generation, gen, cameFrom, tail);
    count = noteReachable(queue, reachable, count, beforeN, tail);
    const beforeE = tail;
    tail = enqueue(tiles, width, height, x + 1, y, i, queue, generation, gen, cameFrom, tail);
    count = noteReachable(queue, reachable, count, beforeE, tail);
    const beforeS = tail;
    tail = enqueue(tiles, width, height, x, y + 1, i, queue, generation, gen, cameFrom, tail);
    count = noteReachable(queue, reachable, count, beforeS, tail);
    const beforeW = tail;
    tail = enqueue(tiles, width, height, x - 1, y, i, queue, generation, gen, cameFrom, tail);
    count = noteReachable(queue, reachable, count, beforeW, tail);
  }
  return count;
}

export function reconstructPath(
  start: number,
  goal: number,
  cameFrom: Int32Array,
  reverseBuf: Int32Array,
  outPath: Int16Array,
): number {
  let len = 0;
  let cur = goal;
  while (true) {
    if (len >= reverseBuf.length) {
      return 0;
    }
    reverseBuf[len] = cur;
    len += 1;
    if (cur === start) {
      break;
    }
    const prev = cameFrom[cur];
    if (prev === undefined) {
      return 0;
    }
    if (prev === cur && cur !== start) {
      return 0;
    }
    cur = prev;
  }
  let o = 0;
  for (let i = len - 1; i >= 0; i -= 1) {
    const tile = reverseBuf[i];
    if (tile === undefined) {
      return 0;
    }
    outPath[o] = tile;
    o += 1;
  }
  return len;
}

function noteReachable(queue: Int32Array, reachable: Int32Array, count: number, before: number, after: number): number {
  if (after <= before) {
    return count;
  }
  const added = queue[before];
  if (added === undefined) {
    return count;
  }
  reachable[count] = added;
  return count + 1;
}

function enqueue(
  tiles: TileRead,
  width: number,
  height: number,
  x: number,
  y: number,
  from: number,
  queue: Int32Array,
  generation: Uint32Array,
  gen: number,
  cameFrom: Int32Array,
  tail: number,
): number {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return tail;
  }
  if (tail >= queue.length) {
    return tail;
  }
  const n = y * width + x;
  const seen = generation[n];
  if (seen === gen) {
    return tail;
  }
  const code = tiles[n];
  if (code === undefined) {
    return tail;
  }
  if (!isWalkableCode(code)) {
    return tail;
  }
  generation[n] = gen;
  cameFrom[n] = from;
  queue[tail] = n;
  return tail + 1;
}

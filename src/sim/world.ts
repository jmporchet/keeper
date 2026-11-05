import { asTick, type Tick } from "./ids";

export const TICK_HZ = 20;
export const TICK_DT = 1 / TICK_HZ;
export const MAX_FRAME_DELTA = 0.1;
export const MAX_STEPS_PER_FRAME = 4;

export const MAP_WIDTH = 9;
export const MAP_HEIGHT = 9;
export const MAP_HALF = 4;

export type TileKind = "earth" | "goldSeam" | "claimed";

export type Command =
  | { kind: "noop"; tick: Tick }
  | { kind: "addGold"; tick: Tick; amount: number };

export type World = {
  seed: number;
  tick: Tick;
  rng: number;
  width: number;
  height: number;
  tiles: TileKind[];
  goldStored: number;
};

function kindCode(kind: TileKind): number {
  switch (kind) {
    case "earth":
      return 0;
    case "goldSeam":
      return 1;
    case "claimed":
      return 2;
    default: {
      const never: never = kind;
      return never;
    }
  }
}

export function createWorld(seed: number): World {
  const width = MAP_WIDTH;
  const height = MAP_HEIGHT;
  const tiles: TileKind[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const lx = x - MAP_HALF;
      const lz = y - MAP_HALF;
      const isGold = lx === 1 && lz === 0;
      const isClaimed = Math.abs(lx) <= 1 && Math.abs(lz) <= 1;
      if (isGold) {
        tiles.push("goldSeam");
      } else if (isClaimed) {
        tiles.push("claimed");
      } else {
        tiles.push("earth");
      }
    }
  }
  return {
    seed: seed >>> 0,
    tick: asTick(0),
    rng: seed >>> 0,
    width,
    height,
    tiles,
    goldStored: 0,
  };
}

function nextRng(world: World): void {
  let t = (world.rng + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  world.rng = (t ^ (t >>> 14)) >>> 0;
}

function mix(h: number, v: number): number {
  return Math.imul(h ^ (v >>> 0), 16777619) >>> 0;
}

export function hashWorld(world: World): number {
  let h = 2166136261;
  h = mix(h, world.seed);
  h = mix(h, world.tick);
  h = mix(h, world.rng);
  h = mix(h, world.width);
  h = mix(h, world.height);
  h = mix(h, world.goldStored);
  const tiles = world.tiles;
  for (let i = 0; i < tiles.length; i += 1) {
    const cell = tiles[i];
    if (cell === undefined) {
      continue;
    }
    h = mix(h, kindCode(cell));
  }
  return h >>> 0;
}

function applyCommand(world: World, command: Command): void {
  switch (command.kind) {
    case "noop":
      return;
    case "addGold":
      world.goldStored += command.amount;
      return;
    default: {
      const never: never = command;
      return never;
    }
  }
}

function compareCommands(a: Command, b: Command): number {
  if (a.kind !== b.kind) {
    if (a.kind === "noop") {
      return -1;
    }
    return 1;
  }
  switch (a.kind) {
    case "noop":
      return 0;
    case "addGold": {
      switch (b.kind) {
        case "addGold":
          return a.amount - b.amount;
        case "noop":
          return 0;
        default: {
          const never: never = b;
          return never;
        }
      }
    }
    default: {
      const never: never = a;
      return never;
    }
  }
}

export function step(world: World, commands: readonly Command[]): void {
  const tick = world.tick;
  const pending: Command[] = [];
  for (let i = 0; i < commands.length; i += 1) {
    const command = commands[i];
    if (command === undefined) {
      continue;
    }
    if (command.tick === tick) {
      pending.push(command);
    }
  }
  pending.sort(compareCommands);
  for (let i = 0; i < pending.length; i += 1) {
    const command = pending[i];
    if (command === undefined) {
      continue;
    }
    applyCommand(world, command);
  }
  nextRng(world);
  world.tick = asTick(world.tick + 1);
}

export function run(seed: number, commands: readonly Command[], ticks: number): World {
  const world = createWorld(seed);
  for (let i = 0; i < ticks; i += 1) {
    step(world, commands);
  }
  return world;
}

import { asJobId, type JobId, type TileIndex, type WorkerId } from "./ids";

export const JOB_KINDS = ["dig", "mineGold", "carryGold", "claim", "reinforce"] as const;

export type JobKind = (typeof JOB_KINDS)[number];

export type JobLifecycle = { kind: "open" } | { kind: "reserved"; worker: WorkerId };

export type Job = {
  id: JobId;
  jobKind: JobKind;
  tile: TileIndex;
  lifecycle: JobLifecycle;
};

type JobSlot = { kind: "empty" } | { kind: "filled"; job: Job };

type JobLink = { kind: "empty" } | { kind: "filled"; id: JobId };

export type JobBoard = {
  slots: JobSlot[];
  byTile: JobLink[];
  byWorker: JobLink[];
  filled: Int32Array;
  filledCount: number;
};

const EMPTY_JOB_SLOT: JobSlot = { kind: "empty" };
const EMPTY_JOB_LINK: JobLink = { kind: "empty" };
const OPEN_LIFECYCLE: JobLifecycle = { kind: "open" };

export function createJobBoard(capacity: number): JobBoard {
  const slots: JobSlot[] = [];
  for (let i = 0; i < capacity; i += 1) {
    slots.push(EMPTY_JOB_SLOT);
  }
  const byTile: JobLink[] = [];
  for (let i = 0; i < capacity; i += 1) {
    byTile.push(EMPTY_JOB_LINK);
  }
  const byWorker: JobLink[] = [];
  for (let i = 0; i < capacity; i += 1) {
    byWorker.push(EMPTY_JOB_LINK);
  }
  return { slots, byTile, byWorker, filled: new Int32Array(capacity), filledCount: 0 };
}

export function jobPriority(kind: JobKind): number {
  switch (kind) {
    case "dig":
      return 0;
    case "mineGold":
      return 1;
    case "carryGold":
      return 2;
    case "claim":
      return 3;
    case "reinforce":
      return 4;
    default: {
      const never: never = kind;
      return never;
    }
  }
}

export function listJobs(board: JobBoard): readonly Job[] {
  const jobs: Job[] = [];
  for (let i = 0; i < board.slots.length; i += 1) {
    const slot = board.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "filled":
        jobs.push(slot.job);
        break;
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  return jobs;
}

function mix(h: number, v: number): number {
  return Math.imul(h ^ (v >>> 0), 16777619) >>> 0;
}

function mixKind(h: number, kind: JobKind): number {
  return mix(h, jobPriority(kind) + 1);
}

function mixLifecycle(h: number, lifecycle: JobLifecycle): number {
  switch (lifecycle.kind) {
    case "open":
      return mix(h, 1);
    case "reserved":
      return mix(mix(h, 2), lifecycle.worker);
    default: {
      const never: never = lifecycle;
      return never;
    }
  }
}

export function hashJobs(board: JobBoard): number {
  let h = 2166136261;
  let count = 0;
  for (let i = 0; i < board.slots.length; i += 1) {
    const slot = board.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "filled":
        count += 1;
        break;
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  h = mix(h, count);
  for (let i = 0; i < board.slots.length; i += 1) {
    const slot = board.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "filled": {
        const job = slot.job;
        h = mix(h, job.id);
        h = mixKind(h, job.jobKind);
        h = mix(h, job.tile);
        h = mixLifecycle(h, job.lifecycle);
        break;
      }
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  return h >>> 0;
}

export function printJobs(board: JobBoard): string {
  const jobs = listJobs(board);
  if (jobs.length === 0) {
    return "(empty)";
  }
  const lines: string[] = [];
  for (let i = 0; i < jobs.length; i += 1) {
    const job = jobs[i];
    if (job === undefined) {
      continue;
    }
    lines.push(printJob(job));
  }
  return lines.join("\n");
}

function printJob(job: Job): string {
  const head = `${job.id} ${job.jobKind} tile=${job.tile}`;
  switch (job.lifecycle.kind) {
    case "open":
      return `${head} open`;
    case "reserved":
      return `${head} reserved worker=${job.lifecycle.worker}`;
    default: {
      const never: never = job.lifecycle;
      return never;
    }
  }
}

function findOpenSlot(board: JobBoard): number | undefined {
  for (let i = 0; i < board.slots.length; i += 1) {
    const slot = board.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        return i;
      case "filled":
        break;
      default: {
        const never: never = slot;
        return never;
      }
    }
  }
  return undefined;
}

function slotJobAt(board: JobBoard, index: number): Job | undefined {
  const slot = board.slots[index];
  if (slot === undefined) {
    return undefined;
  }
  switch (slot.kind) {
    case "empty":
      return undefined;
    case "filled":
      return slot.job;
    default: {
      const never: never = slot;
      return never;
    }
  }
}

export function jobAtTile(board: JobBoard, tile: TileIndex): Job | undefined {
  const mapped = board.byTile[tile];
  if (mapped === undefined) {
    return undefined;
  }
  switch (mapped.kind) {
    case "empty":
      return undefined;
    case "filled": {
      const job = slotJobAt(board, mapped.id);
      if (job === undefined) {
        return undefined;
      }
      return job.tile === tile ? job : undefined;
    }
    default: {
      const never: never = mapped;
      return never;
    }
  }
}

export function jobHeldBy(board: JobBoard, worker: WorkerId): Job | undefined {
  const mapped = board.byWorker[worker];
  if (mapped === undefined) {
    return undefined;
  }
  switch (mapped.kind) {
    case "empty":
      return undefined;
    case "filled": {
      const job = slotJobAt(board, mapped.id);
      if (job === undefined) {
        return undefined;
      }
      switch (job.lifecycle.kind) {
        case "reserved":
          return job.lifecycle.worker === worker ? job : undefined;
        case "open":
          return undefined;
        default: {
          const never: never = job.lifecycle;
          return never;
        }
      }
    }
    default: {
      const never: never = mapped;
      return never;
    }
  }
}

function writeSlot(board: JobBoard, index: number, slot: JobSlot): void {
  board.slots[index] = slot;
}

function writeTileSlot(board: JobBoard, tile: TileIndex, slot: JobLink): void {
  board.byTile[tile] = slot;
}

function writeWorkerSlot(board: JobBoard, worker: WorkerId, slot: JobLink): void {
  board.byWorker[worker] = slot;
}

function addFilled(board: JobBoard, id: JobId): void {
  if (board.filledCount >= board.filled.length) {
    throw new Error("filled list overflow");
  }
  board.filled[board.filledCount] = id;
  board.filledCount += 1;
}

function removeFilled(board: JobBoard, id: JobId): void {
  for (let i = 0; i < board.filledCount; i += 1) {
    if (board.filled[i] === id) {
      const last = board.filled[board.filledCount - 1];
      if (last !== undefined) {
        board.filled[i] = last;
      }
      board.filledCount -= 1;
      return;
    }
  }
}

function setLifecycle(job: Job, lifecycle: JobLifecycle): void {
  job.lifecycle = lifecycle;
}

function removeJob(board: JobBoard, job: Job): void {
  switch (job.lifecycle.kind) {
    case "reserved":
      writeWorkerSlot(board, job.lifecycle.worker, EMPTY_JOB_LINK);
      break;
    case "open":
      break;
    default: {
      const never: never = job.lifecycle;
      throw never;
    }
  }
  writeSlot(board, job.id, EMPTY_JOB_SLOT);
  writeTileSlot(board, job.tile, EMPTY_JOB_LINK);
  removeFilled(board, job.id);
}

export function openJob(board: JobBoard, tile: TileIndex, jobKind: JobKind): Job | undefined {
  if (jobAtTile(board, tile) !== undefined) {
    return undefined;
  }
  const index = findOpenSlot(board);
  if (index === undefined) {
    return undefined;
  }
  const job: Job = {
    id: asJobId(index),
    jobKind,
    tile,
    lifecycle: OPEN_LIFECYCLE,
  };
  writeSlot(board, index, { kind: "filled", job });
  writeTileSlot(board, tile, { kind: "filled", id: job.id });
  addFilled(board, job.id);
  return job;
}

export function cancelJobAtTile(board: JobBoard, tile: TileIndex): boolean {
  const job = jobAtTile(board, tile);
  if (job === undefined) {
    return false;
  }
  switch (job.lifecycle.kind) {
    case "open":
    case "reserved":
      removeJob(board, job);
      return true;
    default: {
      const never: never = job.lifecycle;
      return never;
    }
  }
}

function betterJob(best: Job, candidate: Job): boolean {
  const pb = jobPriority(best.jobKind);
  const pc = jobPriority(candidate.jobKind);
  if (pc !== pb) {
    return pc < pb;
  }
  return candidate.id < best.id;
}

function pickOpenJob(board: JobBoard, jobKind: JobKind | undefined): Job | undefined {
  let best: Job | undefined;
  for (let i = 0; i < board.filledCount; i += 1) {
    const id = board.filled[i];
    if (id === undefined) {
      continue;
    }
    const job = slotJobAt(board, id);
    if (job === undefined) {
      continue;
    }
    switch (job.lifecycle.kind) {
      case "open":
        if (jobKind === undefined || job.jobKind === jobKind) {
          if (best === undefined || betterJob(best, job)) {
            best = job;
          }
        }
        break;
      case "reserved":
        break;
      default: {
        const never: never = job.lifecycle;
        return never;
      }
    }
  }
  return best;
}

export function reserveOpenJob(board: JobBoard, worker: WorkerId, jobKind?: JobKind): Job | undefined {
  if (jobHeldBy(board, worker) !== undefined) {
    return undefined;
  }
  const job = pickOpenJob(board, jobKind);
  if (job === undefined) {
    return undefined;
  }
  setLifecycle(job, { kind: "reserved", worker });
  writeWorkerSlot(board, worker, { kind: "filled", id: job.id });
  return job;
}

export function releaseWorker(board: JobBoard, worker: WorkerId): boolean {
  const job = jobHeldBy(board, worker);
  if (job === undefined) {
    return false;
  }
  setLifecycle(job, OPEN_LIFECYCLE);
  writeWorkerSlot(board, worker, EMPTY_JOB_LINK);
  return true;
}

export function completeJob(board: JobBoard, worker: WorkerId): boolean {
  const job = jobHeldBy(board, worker);
  if (job === undefined) {
    return false;
  }
  removeJob(board, job);
  return true;
}

function assertTileIndex(board: JobBoard, job: Job): void {
  const mapped = board.byTile[job.tile];
  if (mapped === undefined) {
    throw new Error("job tile index missing");
  }
  switch (mapped.kind) {
    case "empty":
      throw new Error("job missing from tile index");
    case "filled":
      if (mapped.id !== job.id) {
        throw new Error("job tile index points at another job");
      }
      break;
    default: {
      const never: never = mapped;
      throw never;
    }
  }
}

function assertWorkerIndex(board: JobBoard, job: Job): void {
  switch (job.lifecycle.kind) {
    case "reserved": {
      const mapped = board.byWorker[job.lifecycle.worker];
      if (mapped === undefined) {
        throw new Error("worker index missing");
      }
      switch (mapped.kind) {
        case "empty":
          throw new Error("reserved job missing from worker index");
        case "filled":
          if (mapped.id !== job.id) {
            throw new Error("worker index points at another job");
          }
          break;
        default: {
          const never: never = mapped;
          throw never;
        }
      }
      break;
    }
    case "open":
      break;
    default: {
      const never: never = job.lifecycle;
      throw never;
    }
  }
}

export function assertJobInvariants(board: JobBoard): void {
  const seenWorkers = new Set<number>();
  for (let i = 0; i < board.slots.length; i += 1) {
    const slot = board.slots[i];
    if (slot === undefined) {
      continue;
    }
    switch (slot.kind) {
      case "empty":
        break;
      case "filled": {
        const job = slot.job;
        assertTileIndex(board, job);
        assertWorkerIndex(board, job);
        switch (job.lifecycle.kind) {
          case "reserved": {
            if (seenWorkers.has(job.lifecycle.worker)) {
              throw new Error("worker holds two jobs");
            }
            seenWorkers.add(job.lifecycle.worker);
            break;
          }
          case "open":
            break;
          default: {
            const never: never = job.lifecycle;
            throw never;
          }
        }
        break;
      }
      default: {
        const never: never = slot;
        throw never;
      }
    }
  }
  for (let tile = 0; tile < board.byTile.length; tile += 1) {
    const mapped = board.byTile[tile];
    if (mapped === undefined) {
      continue;
    }
    switch (mapped.kind) {
      case "empty":
        break;
      case "filled": {
        const job = slotJobAt(board, mapped.id);
        if (job === undefined || job.tile !== tile) {
          throw new Error("tile index points at a missing or misplaced job");
        }
        break;
      }
      default: {
        const never: never = mapped;
        throw never;
      }
    }
  }
  for (let worker = 0; worker < board.byWorker.length; worker += 1) {
    const mapped = board.byWorker[worker];
    if (mapped === undefined) {
      continue;
    }
    switch (mapped.kind) {
      case "empty":
        break;
      case "filled": {
        const job = slotJobAt(board, mapped.id);
        if (job === undefined) {
          throw new Error("worker index points at a missing job");
        }
        if (job.lifecycle.kind !== "reserved" || job.lifecycle.worker !== worker) {
          throw new Error("worker index points at a job held by another worker");
        }
        break;
      }
      default: {
        const never: never = mapped;
        throw never;
      }
    }
  }
}

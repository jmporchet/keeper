import { asJobId, type JobId, type TileIndex, type WorkerId } from "./ids";

export const JOB_KINDS = ["dig", "mineGold", "carryGold", "claim", "reinforce"] as const;

export type JobKind = (typeof JOB_KINDS)[number];

export type JobLifecycle =
  | { kind: "open" }
  | { kind: "reserved"; worker: WorkerId }
  | { kind: "done" }
  | { kind: "cancelled" };

export type Job = {
  id: JobId;
  jobKind: JobKind;
  tile: TileIndex;
  lifecycle: JobLifecycle;
};

type JobSlot = { kind: "empty" } | { kind: "filled"; job: Job };

export type JobBoard = {
  slots: JobSlot[];
};

export function createJobBoard(capacity: number): JobBoard {
  const slots: JobSlot[] = [];
  for (let i = 0; i < capacity; i += 1) {
    slots.push({ kind: "empty" });
  }
  return { slots };
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
    case "done":
      return mix(h, 3);
    case "cancelled":
      return mix(h, 4);
    default: {
      const never: never = lifecycle;
      return never;
    }
  }
}

export function hashJobs(board: JobBoard): number {
  let h = 2166136261;
  const jobs = listJobs(board);
  h = mix(h, jobs.length);
  for (let i = 0; i < jobs.length; i += 1) {
    const job = jobs[i];
    if (job === undefined) {
      continue;
    }
    h = mix(h, job.id);
    h = mixKind(h, job.jobKind);
    h = mix(h, job.tile);
    h = mixLifecycle(h, job.lifecycle);
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
    case "done":
      return `${head} done`;
    case "cancelled":
      return `${head} cancelled`;
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

export function jobAtTile(board: JobBoard, tile: TileIndex): Job | undefined {
  const jobs = listJobs(board);
  for (let i = 0; i < jobs.length; i += 1) {
    const job = jobs[i];
    if (job === undefined) {
      continue;
    }
    if (job.tile === tile) {
      return job;
    }
  }
  return undefined;
}

export function jobHeldBy(board: JobBoard, worker: WorkerId): Job | undefined {
  const jobs = listJobs(board);
  for (let i = 0; i < jobs.length; i += 1) {
    const job = jobs[i];
    if (job === undefined) {
      continue;
    }
    switch (job.lifecycle.kind) {
      case "reserved":
        if (job.lifecycle.worker === worker) {
          return job;
        }
        break;
      case "open":
      case "done":
      case "cancelled":
        break;
      default: {
        const never: never = job.lifecycle;
        return never;
      }
    }
  }
  return undefined;
}

function writeSlot(board: JobBoard, index: number, slot: JobSlot): void {
  board.slots[index] = slot;
}

function setLifecycle(board: JobBoard, job: Job, lifecycle: JobLifecycle): void {
  writeSlot(board, job.id, { kind: "filled", job: { id: job.id, jobKind: job.jobKind, tile: job.tile, lifecycle } });
}

function freeSlot(board: JobBoard, id: JobId): void {
  writeSlot(board, id, { kind: "empty" });
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
    lifecycle: { kind: "open" },
  };
  writeSlot(board, index, { kind: "filled", job });
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
      setLifecycle(board, job, { kind: "cancelled" });
      freeSlot(board, job.id);
      return true;
    case "done":
    case "cancelled":
      return false;
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

function pickOpenJob(board: JobBoard): Job | undefined {
  const jobs = listJobs(board);
  let best: Job | undefined;
  for (let i = 0; i < jobs.length; i += 1) {
    const job = jobs[i];
    if (job === undefined) {
      continue;
    }
    switch (job.lifecycle.kind) {
      case "open":
        if (best === undefined || betterJob(best, job)) {
          best = job;
        }
        break;
      case "reserved":
      case "done":
      case "cancelled":
        break;
      default: {
        const never: never = job.lifecycle;
        return never;
      }
    }
  }
  return best;
}

export function reserveOpenJob(board: JobBoard, worker: WorkerId): Job | undefined {
  if (jobHeldBy(board, worker) !== undefined) {
    return undefined;
  }
  const job = pickOpenJob(board);
  if (job === undefined) {
    return undefined;
  }
  setLifecycle(board, job, { kind: "reserved", worker });
  return jobAtTile(board, job.tile);
}

export function releaseWorker(board: JobBoard, worker: WorkerId): boolean {
  const job = jobHeldBy(board, worker);
  if (job === undefined) {
    return false;
  }
  setLifecycle(board, job, { kind: "open" });
  return true;
}

export function completeJob(board: JobBoard, worker: WorkerId): boolean {
  const job = jobHeldBy(board, worker);
  if (job === undefined) {
    return false;
  }
  setLifecycle(board, job, { kind: "done" });
  freeSlot(board, job.id);
  return true;
}

export function assertJobInvariants(board: JobBoard): void {
  const seenWorkers = new Set<number>();
  const jobs = listJobs(board);
  for (let i = 0; i < jobs.length; i += 1) {
    const job = jobs[i];
    if (job === undefined) {
      continue;
    }
    switch (job.lifecycle.kind) {
      case "reserved": {
        if (seenWorkers.has(job.lifecycle.worker)) {
          throw new Error("worker holds two jobs");
        }
        seenWorkers.add(job.lifecycle.worker);
        break;
      }
      case "cancelled":
        throw new Error("cancelled job still on board");
      case "open":
      case "done":
        break;
      default: {
        const never: never = job.lifecycle;
        throw never;
      }
    }
  }
}

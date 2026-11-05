export type Tick = number & { readonly __brand: "Tick" };
export type TileIndex = number & { readonly __brand: "TileIndex" };
export type ImpId = number & { readonly __brand: "ImpId" };
export type JobId = number & { readonly __brand: "JobId" };
export type WorkerId = number & { readonly __brand: "WorkerId" };
export type CreatureId = number & { readonly __brand: "CreatureId" };

export function asTick(n: number): Tick {
  return n as Tick;
}

export function asTileIndex(n: number): TileIndex {
  return n as TileIndex;
}

export function asImpId(n: number): ImpId {
  return n as ImpId;
}

export function asJobId(n: number): JobId {
  return n as JobId;
}

export function asWorkerId(n: number): WorkerId {
  return n as WorkerId;
}

export function asCreatureId(n: number): CreatureId {
  return n as CreatureId;
}

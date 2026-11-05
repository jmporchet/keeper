import { createWorld, requireSorted, type Command, type CommandLog } from "./world";
import type { World } from "./worldCore";

export type RestartState = {
  world: World;
  commands: Command[];
  commandLog: CommandLog;
};

export function restartWorld(seed: number): RestartState {
  const world = createWorld(seed);
  const commands: Command[] = [];
  return { world, commands, commandLog: requireSorted(commands) };
}

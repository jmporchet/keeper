import * as fc from "fast-check";
import { asImpId, asTick, asTileIndex } from "./ids";
import { MAP_WIDTH } from "./map";
import type { Command } from "./world";

export function commandList(maxTick: number): fc.Arbitrary<Command[]> {
  return fc.array(
    fc
      .tuple(
        fc.integer({ min: 0, max: maxTick - 1 }),
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 0, max: MAP_WIDTH * MAP_WIDTH - 1 }),
        fc.integer({ min: 0, max: 9 }),
      )
      .map(([tick, amount, tile, kind]) => {
        switch (kind) {
          case 0:
            return { kind: "noop", tick: asTick(tick) };
          case 1:
            return { kind: "addGold", tick: asTick(tick), amount };
          case 2:
            return { kind: "tag", tick: asTick(tick), tile: asTileIndex(tile) };
          case 3:
            return { kind: "untag", tick: asTick(tick), tile: asTileIndex(tile) };
          case 4:
            return { kind: "pickUp", tick: asTick(tick), impId: asImpId(tile % 4) };
          case 5: {
            const tileX = tile % MAP_WIDTH;
            const tileY = (tile / MAP_WIDTH) | 0;
            return { kind: "drop", tick: asTick(tick), impId: asImpId(tile % 4), tileX, tileY };
          }
          case 6: {
            const tileX = 30 + (tile % 5);
            const tileY = 30 + ((tile >> 3) % 5);
            return {
              kind: "paintRoom",
              tick: asTick(tick),
              tile: asTileIndex(tileY * MAP_WIDTH + tileX),
              room: "treasury",
            };
          }
          case 7: {
            const tileX = 30 + (tile % 5);
            const tileY = 30 + ((tile >> 3) % 5);
            return {
              kind: "paintRoom",
              tick: asTick(tick),
              tile: asTileIndex(tileY * MAP_WIDTH + tileX),
              room: "lair",
            };
          }
          case 8:
            return { kind: "spawnImp", tick: asTick(tick) };
          default:
            return { kind: "slap", tick: asTick(tick), impId: asImpId(tile % 4) };
        }
      }),
    { maxLength: 16 },
  );
}

export function extraGold(maxTick: number): fc.Arbitrary<Command> {
  return fc.tuple(fc.integer({ min: 0, max: maxTick - 1 }), fc.integer({ min: 1, max: 50 })).map(([tick, amount]) => {
    return { kind: "addGold", tick: asTick(tick), amount: amount + 1000 };
  });
}

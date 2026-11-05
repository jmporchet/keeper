async function paintRow(ctx, tool, xs, y) {
  const { page } = ctx;
  await page.click(tool, { force: true });
  const paintingOn = await page.evaluate(() => globalThis.__keeper.painting);
  if (!paintingOn) {
    throw new Error(`${tool} did not select Painting`);
  }
  const points = [];
  for (const tx of xs) {
    const point = await ctx.pagePointForTile(tx, y);
    if (point === null) {
      throw new Error(`room tile ${String(tx)},${String(y)} is off screen`);
    }
    points.push(point);
  }
  const first = points[0];
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (let i = 1; i < points.length; i += 1) {
    const point = points[i];
    await page.mouse.move(point.x, point.y);
  }
  await page.mouse.up();
  await ctx.stepOnce();
  await page.click(tool, { force: true });
  const paintingOff = await page.evaluate(() => globalThis.__keeper.painting);
  if (paintingOff) {
    throw new Error(`${tool} stayed selected after toggle`);
  }
}

export const name = "hatchery";

export async function run(ctx) {
  const { page, cx, cy } = ctx;
  await page.click("#add-gold", { force: true });
  await ctx.stepOnce();
  await ctx.panToTileCenter(31, 30);
  await paintRow(ctx, "#paint-treasury", [30, 31, 32], 30);
  await page.click("#add-gold", { force: true });
  await ctx.stepOnce();
  await ctx.panToTileCenter(31, 31);
  await paintRow(ctx, "#paint-lair", [30, 31, 32], 31);
  await page.click("#add-gold", { force: true });
  await ctx.stepOnce();

  let creatureTicks = 0;
  for (;;) {
    const snapshot = await page.evaluate(() => globalThis.__keeper.creatureSnapshot());
    if (snapshot.some((creature) => creature.state === "sleeping")) {
      break;
    }
    if (creatureTicks >= 600) {
      throw new Error(`creature did not reach a bed after ${String(creatureTicks)} ticks`);
    }
    await ctx.stepOnce(12, 10);
    creatureTicks += 12;
  }

  ctx.clipStart();
  await ctx.panToTileCenter(31, 32);
  await paintRow(ctx, "#paint-hatchery", [30, 31], 32);
  const hatcheryTiles = await page.evaluate(() => globalThis.__keeper.hatcheryTileCount);
  if (hatcheryTiles !== 2) {
    throw new Error(`expected 2 hatchery tiles after drag, got ${String(hatcheryTiles)}`);
  }
  const spentAfterHatchery = await page.evaluate(() => globalThis.__keeper.goldSpent);
  if (spentAfterHatchery !== 265) {
    throw new Error(`expected 265 gold spent after treasury, lair and hatchery, got ${String(spentAfterHatchery)}`);
  }
  await ctx.checkpoint("hatchery-paint");
  await ctx.panToTileCenter(35, 32);
  await ctx.stepOnce(1, 150);
  await ctx.panToTileCenter(31, 32);
  await ctx.stepOnce(1, 150);

  let extraTicks = 0;
  let chickenPeak = 0;
  let chickenDropped = false;
  let foodSeen = false;
  for (;;) {
    const counts = await page.evaluate(() => ({
      chickenCount: globalThis.__keeper.chickenCount,
      hatcheryTileCount: globalThis.__keeper.hatcheryTileCount,
    }));
    if (counts.chickenCount > chickenPeak) {
      chickenPeak = counts.chickenCount;
    }
    if (chickenPeak > 0 && counts.chickenCount < chickenPeak) {
      chickenDropped = true;
      foodSeen = true;
    }
    const creatures = await page.evaluate(() => globalThis.__keeper.creatureSnapshot());
    if (
      creatures.some(
        (creature) => creature.state === "hungry" || creature.state === "toFood" || creature.state === "eating",
      )
    ) {
      foodSeen = true;
    }
    if (chickenPeak > 0 && chickenDropped && foodSeen) {
      break;
    }
    if (extraTicks >= 4000) {
      throw new Error(
        `hatchery proof not complete after ${String(extraTicks)} extra ticks: chickenPeak ${String(chickenPeak)}, chickenDropped ${String(chickenDropped)}, foodSeen ${String(foodSeen)}`,
      );
    }
    if (extraTicks % 64 === 0) {
      await ctx.panToTileCenter(extraTicks % 128 === 0 ? 35 : 30, 32);
      await ctx.stepOnce(1, 100);
    }
    await ctx.stepOnce(16, 1);
    extraTicks += 16;
  }
  if (chickenPeak < 1) {
    throw new Error("no chicken appeared on the hatchery tiles");
  }
  await ctx.panToTileCenter(31, 32);
  await ctx.stepOnce(1, 150);
  await ctx.screenshot("proof/hatchery.png", "hatchery");
  await ctx.checkpoint("hatchery");
  const result = await page.evaluate(() => ({
    tick: globalThis.__keeper.tick,
    hash: globalThis.__keeper.worldHash,
    creatureCount: globalThis.__keeper.creatureCount,
    hatcheryTileCount: globalThis.__keeper.hatcheryTileCount,
    chickenCount: globalThis.__keeper.chickenCount,
    goldSpent: globalThis.__keeper.goldSpent,
  }));
  if (result.creatureCount < 1) {
    throw new Error(`creatureCount ended at ${String(result.creatureCount)}`);
  }
  if (result.hatcheryTileCount !== 2) {
    throw new Error(`hatcheryTileCount ended at ${String(result.hatcheryTileCount)}`);
  }
  console.log(
    `hatchery tick=${String(result.tick)} chickens peak=${String(chickenPeak)} dropped=${String(chickenDropped)} foodSeen=${String(foodSeen)} final=${String(result.chickenCount)} hatcheryTiles=${String(result.hatcheryTileCount)} goldSpent=${String(result.goldSpent)}`,
  );
  for (let i = 0; i < 2; i += 1) {
    await ctx.panToTileCenter(i % 2 === 0 ? 35 : 30, 32);
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, i % 2 === 0 ? -240 : 240);
    await ctx.stepOnce(1, 150);
  }
  await ctx.panToTileCenter(31, 32);
  await ctx.stepOnce(1, 150);
  ctx.clipEnd();
}

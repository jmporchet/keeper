const LIBRARY_TRAIN_TICKS = 40;
const TRAIN_SLACK = 4;

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

export const name = "warlock";

export async function run(ctx) {
  const { page } = ctx;
  for (let i = 0; i < 5; i += 1) {
    await page.click("#add-gold", { force: true });
    await ctx.stepOnce();
  }
  await ctx.panToTileCenter(31, 32);

  ctx.clipStart();
  await paintRow(ctx, "#paint-lair", [30, 31, 32, 33, 34], 30);
  await paintRow(ctx, "#paint-lair", [30, 31, 32], 31);
  await paintRow(ctx, "#paint-training", [30, 31], 33);
  await paintRow(ctx, "#paint-library", [30, 31], 32);
  const lairTiles = await page.evaluate(() => globalThis.__keeper.lairTileCount);
  const libraryTiles = await page.evaluate(() => globalThis.__keeper.libraryTileCount);
  const trainingTiles = await page.evaluate(() => globalThis.__keeper.trainingTileCount);
  if (lairTiles !== 8 || libraryTiles !== 2 || trainingTiles !== 2) {
    throw new Error(
      `expected 8 lairs, 2 libraries and 2 training tiles, got ${String(lairTiles)}, ${String(libraryTiles)}, ${String(trainingTiles)}`,
    );
  }
  const spentAfterPaint = await page.evaluate(() => globalThis.__keeper.goldSpent);
  const expectedSpent = 8 * 30 + 2 * 40 + 2 * 55;
  if (spentAfterPaint !== expectedSpent) {
    throw new Error(`expected ${String(expectedSpent)} gold spent after room drags, got ${String(spentAfterPaint)}`);
  }
  await ctx.checkpoint("warlock-paint");

  let trainingStart = -1;
  let finished = -1;
  for (let i = 0; i < 300; i += 1) {
    const snapshot = await page.evaluate(() => ({
      tick: globalThis.__keeper.tick,
      researchDone: globalThis.__keeper.researchDone,
      creatures: globalThis.__keeper.creatureSnapshot(),
    }));
    const training = snapshot.creatures.find((creature) => creature.state === "training");
    if (training !== undefined && trainingStart < 0) {
      trainingStart = snapshot.tick;
      await ctx.panToTileCenter(training.tileX, training.tileY);
      await ctx.checkpoint("warlock-research-training");
    }
    const leveled = snapshot.creatures.find((creature) => creature.level >= 1);
    if (snapshot.researchDone && leveled !== undefined) {
      finished = snapshot.tick;
      break;
    }
    await ctx.stepOnce(4, 15);
  }
  if (trainingStart < 0) {
    throw new Error("no creature started library-boosted training");
  }
  if (finished < 0) {
    throw new Error("library-boosted training did not finish research");
  }
  const trainTicks = finished - trainingStart;
  if (trainTicks > LIBRARY_TRAIN_TICKS + TRAIN_SLACK) {
    throw new Error(
      `library training took ${String(trainTicks)} ticks, expected at most ${String(LIBRARY_TRAIN_TICKS + TRAIN_SLACK)}`,
    );
  }
  await ctx.checkpoint("warlock-research");

  let warlock;
  for (let i = 0; i < 320; i += 1) {
    const snapshot = await page.evaluate(() => globalThis.__keeper.creatureSnapshot());
    warlock = snapshot.find((creature) => creature.kind === "warlock");
    if (warlock !== undefined) {
      break;
    }
    await ctx.stepOnce(8, 15);
  }
  if (warlock === undefined) {
    throw new Error("no warlock arrived after research");
  }
  await ctx.panToTileCenter(warlock.tileX, warlock.tileY);
  await ctx.stepOnce(1, 150);
  await ctx.checkpoint("warlock-arrived");
  await ctx.screenshot("proof/warlock.png", "warlock");
  ctx.clipEnd();

  const result = await page.evaluate(() => ({
    tick: globalThis.__keeper.tick,
    hash: globalThis.__keeper.worldHash,
    researchDone: globalThis.__keeper.researchDone,
    drawCalls: globalThis.__keeper.drawCalls,
    creature: globalThis.__keeper.creatureSnapshot(),
  }));
  if (!result.researchDone) {
    throw new Error("researchDone ended false");
  }
  const finalWarlock = result.creature.find((creature) => creature.kind === "warlock");
  if (finalWarlock === undefined) {
    throw new Error("no warlock ended in the creature snapshot");
  }
  console.log(
    `warlock tick=${String(result.tick)} researchDone=${String(result.researchDone)} trainTicks=${String(trainTicks)} warlock=${String(finalWarlock.kind)}@${String(finalWarlock.tileX)},${String(finalWarlock.tileY)} hp=${String(finalWarlock.hp)} drawCalls=${String(result.drawCalls)}`,
  );
}

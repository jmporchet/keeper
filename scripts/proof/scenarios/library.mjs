export const name = "library";

const LIBRARY_TRAIN_TICKS = 40;
const LIBRARY_SLACK = 2;

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

export async function run(ctx) {
  const { page } = ctx;
  for (let i = 0; i < 3; i += 1) {
    await page.click("#add-gold", { force: true });
    await ctx.stepOnce();
  }
  await ctx.panToTileCenter(31, 32);

  ctx.clipStart();
  await paintRow(ctx, "#paint-lair", [30, 31], 31);
  await paintRow(ctx, "#paint-training", [30, 31], 33);
  await paintRow(ctx, "#paint-library", [30, 31], 32);
  const libraryTiles = await page.evaluate(() => globalThis.__keeper.libraryTileCount);
  if (libraryTiles < 1) {
    throw new Error(`expected at least 1 library tile after drag, got ${String(libraryTiles)}`);
  }
  const spentAfterPaint = await page.evaluate(() => globalThis.__keeper.goldSpent);
  const expectedSpent = 2 * 30 + 2 * 40 + 2 * 55;
  if (spentAfterPaint !== expectedSpent) {
    throw new Error(
      `expected ${String(expectedSpent)} gold spent after room drags, got ${String(spentAfterPaint)}`,
    );
  }
  await ctx.checkpoint("library-paint");

  let trainingStart = -1;
  for (let i = 0; i < 400; i += 1) {
    const snapshot = await page.evaluate(() => globalThis.__keeper.creatureSnapshot());
    const training = snapshot.find((creature) => creature.state === "training");
    if (training !== undefined) {
      trainingStart = await page.evaluate(() => globalThis.__keeper.tick);
      await ctx.panToTileCenter(training.tileX, training.tileY);
      await ctx.checkpoint("library-training");
      await ctx.screenshot("proof/library.png", "library");
      break;
    }
    await ctx.stepOnce(1, 25);
  }
  if (trainingStart < 0) {
    throw new Error("no creature started training next to the library");
  }

  let finished = -1;
  for (let i = 0; i < 120; i += 1) {
    const snapshot = await page.evaluate(() => globalThis.__keeper.creatureSnapshot());
    const leveled = snapshot.find((creature) => creature.level >= 1);
    if (leveled !== undefined) {
      finished = await page.evaluate(() => globalThis.__keeper.tick);
      break;
    }
    await ctx.stepOnce(1, 25);
  }
  if (finished < 0) {
    throw new Error("creature did not reach level one");
  }
  const trainTicks = finished - trainingStart;
  if (trainTicks > LIBRARY_TRAIN_TICKS + LIBRARY_SLACK) {
    throw new Error(
      `library training took ${String(trainTicks)} ticks, expected at most ${String(LIBRARY_TRAIN_TICKS + LIBRARY_SLACK)}`,
    );
  }
  await ctx.checkpoint("library-trained");
  ctx.clipEnd();

  const result = await page.evaluate(() => ({
    tick: globalThis.__keeper.tick,
    hash: globalThis.__keeper.worldHash,
    libraryTileCount: globalThis.__keeper.libraryTileCount,
    goldSpent: globalThis.__keeper.goldSpent,
    drawCalls: globalThis.__keeper.drawCalls,
    creature: globalThis.__keeper.creatureSnapshot(),
  }));
  if (result.libraryTileCount < 1) {
    throw new Error(`library count ended at ${String(result.libraryTileCount)}`);
  }
  if (!result.creature.some((creature) => creature.level >= 1)) {
    throw new Error("no creature ended at level one");
  }
  console.log(
    `library tick=${String(result.tick)} tiles=${String(result.libraryTileCount)} goldSpent=${String(result.goldSpent)} trainTicks=${String(trainTicks)} drawCalls=${String(result.drawCalls)}`,
  );
}

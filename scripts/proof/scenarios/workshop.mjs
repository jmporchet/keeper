export const name = "workshop";

const WORKSHOP_DIG_TICKS = 20;
const WORKSHOP_SLACK = 2;

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
  await page.click("#add-gold", { force: true });
  await ctx.stepOnce();
  await ctx.panToTileCenter(30, 31);

  ctx.clipStart();
  await paintRow(ctx, "#paint-workshop", [30, 31], 31);
  const workshopCount = await page.evaluate(() => globalThis.__keeper.workshopTileCount);
  if (workshopCount < 1) {
    throw new Error(`expected at least 1 workshop tile after drag, got ${String(workshopCount)}`);
  }
  const spentAfterPaint = await page.evaluate(() => globalThis.__keeper.goldSpent);
  if (spentAfterPaint !== workshopCount * 45) {
    throw new Error(`expected ${String(workshopCount * 45)} gold spent after workshop drag, got ${String(spentAfterPaint)}`);
  }
  await ctx.checkpoint("workshop-paint");

  const adjacent = await ctx.pagePointForTile(29, 31);
  if (adjacent === null) {
    throw new Error("adjacent dig tile 29,31 is off screen");
  }
  await page.mouse.move(adjacent.x, adjacent.y);
  await page.mouse.down();
  await page.mouse.up();
  await ctx.stepOnce();
  const tagged = await page.evaluate(() => globalThis.__keeper.tileKind(29, 31));
  if (tagged !== "taggedEarth") {
    throw new Error(`adjacent tile 29,31 was ${String(tagged)} after tagging`);
  }
  await ctx.checkpoint("workshop-tag");

  let workingStart = -1;
  for (let i = 0; i < 400; i += 1) {
    const imps = await page.evaluate(() => globalThis.__keeper.impSnapshot());
    const working = imps.find(
      (imp) =>
        imp.state === "working" &&
        imp.job !== null &&
        imp.job.tileX === 29 &&
        imp.job.tileY === 31,
    );
    if (working !== undefined) {
      workingStart = await page.evaluate(() => globalThis.__keeper.tick);
      break;
    }
    await ctx.stepOnce(1, 8);
  }
  if (workingStart < 0) {
    throw new Error("no imp started the adjacent dig job");
  }

  let finished = -1;
  for (let i = 0; i < 120; i += 1) {
    const kind = await page.evaluate(() => globalThis.__keeper.tileKind(29, 31));
    if (kind !== "taggedEarth") {
      finished = await page.evaluate(() => globalThis.__keeper.tick);
      break;
    }
    await ctx.stepOnce(1, 8);
  }
  if (finished < 0) {
    throw new Error("adjacent dig did not finish");
  }
  const digTicks = finished - workingStart;
  if (digTicks > WORKSHOP_DIG_TICKS + WORKSHOP_SLACK) {
    throw new Error(
      `adjacent dig took ${String(digTicks)} ticks, expected at most ${String(WORKSHOP_DIG_TICKS + WORKSHOP_SLACK)}`,
    );
  }
  await ctx.checkpoint("workshop-dig");
  await ctx.screenshot("proof/workshop.png", "workshop");

  await ctx.panToTileCenter(30, 31);
  await ctx.stepOnce(1, 120);
  await ctx.panToTileCenter(29, 31);
  await ctx.stepOnce(1, 120);
  ctx.clipEnd();

  const result = await page.evaluate(() => ({
    tick: globalThis.__keeper.tick,
    hash: globalThis.__keeper.worldHash,
    workshopTileCount: globalThis.__keeper.workshopTileCount,
    goldSpent: globalThis.__keeper.goldSpent,
    drawCalls: globalThis.__keeper.drawCalls,
    tile: globalThis.__keeper.tileKind(29, 31),
  }));
  if (result.workshopTileCount < 1) {
    throw new Error(`workshop count ended at ${String(result.workshopTileCount)}`);
  }
  if (result.tile !== "dirt" && result.tile !== "claimed") {
    throw new Error(`adjacent tile ended as ${String(result.tile)}`);
  }
  console.log(
    `workshop tick=${String(result.tick)} tiles=${String(result.workshopTileCount)} goldSpent=${String(result.goldSpent)} digTicks=${String(digTicks)} tile=${String(result.tile)} drawCalls=${String(result.drawCalls)}`,
  );
}

const LAIR_COST = 30;
const WORKSHOP_COST = 45;

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

export const name = "troll";

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
  await paintRow(ctx, "#paint-workshop", [33, 34], 31);
  const lairTiles = await page.evaluate(() => globalThis.__keeper.lairTileCount);
  const workshopTiles = await page.evaluate(() => globalThis.__keeper.workshopTileCount);
  if (lairTiles !== 8 || workshopTiles < 1) {
    throw new Error(`expected 8 lairs and a workshop, got ${String(lairTiles)} lairs and ${String(workshopTiles)} workshop tiles`);
  }
  const spentAfterPaint = await page.evaluate(() => globalThis.__keeper.goldSpent);
  const expectedSpent = 8 * LAIR_COST + workshopTiles * WORKSHOP_COST;
  if (spentAfterPaint !== expectedSpent) {
    throw new Error(`expected ${String(expectedSpent)} gold spent after room drags, got ${String(spentAfterPaint)}`);
  }
  await ctx.checkpoint("troll-paint");

  let troll;
  for (let i = 0; i < 300; i += 1) {
    const snapshot = await page.evaluate(() => globalThis.__keeper.creatureSnapshot());
    troll = snapshot.find((creature) => creature.kind === "troll");
    if (troll !== undefined) {
      break;
    }
    await ctx.stepOnce(20, 8);
  }
  if (troll === undefined) {
    throw new Error("no troll arrived after the workshop was built");
  }
  await ctx.checkpoint("troll-arrived");
  for (let i = 0; i < 5; i += 1) {
    await page.click("#add-gold", { force: true });
    await ctx.stepOnce();
  }
  await ctx.panToTileCenter(troll.tileX, troll.tileY);
  await page.mouse.move(ctx.cx, ctx.cy);
  for (let i = 0; i < 4; i += 1) {
    await page.mouse.wheel(0, -240);
    await ctx.stepOnce(1, 10);
  }
  await ctx.stepOnce(1, 150);
  await ctx.screenshot("proof/troll.png", "troll");
  for (let i = 0; i < 40; i += 1) {
    await ctx.stepOnce(0, 100);
  }
  ctx.clipEnd();

  const result = await page.evaluate(() => ({
    tick: globalThis.__keeper.tick,
    hash: globalThis.__keeper.worldHash,
    workshopTileCount: globalThis.__keeper.workshopTileCount,
    drawCalls: globalThis.__keeper.drawCalls,
    creature: globalThis.__keeper.creatureSnapshot(),
  }));
  if (result.workshopTileCount < 1) {
    throw new Error("workshop ended missing");
  }
  const finalTroll = result.creature.find((creature) => creature.kind === "troll");
  if (finalTroll === undefined) {
    throw new Error("no troll ended in the creature snapshot");
  }
  console.log(
    `troll tick=${String(result.tick)} workshopTiles=${String(result.workshopTileCount)} troll=${String(finalTroll.kind)}@${String(finalTroll.tileX)},${String(finalTroll.tileY)} hp=${String(finalTroll.hp)} drawCalls=${String(result.drawCalls)}`,
  );
}

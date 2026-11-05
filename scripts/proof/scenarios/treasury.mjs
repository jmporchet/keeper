export const name = "treasury";

export async function run(ctx) {
  const { page, cx, cy } = ctx;
  await page.click("#add-gold", { force: true });
  await ctx.stepOnce();
  await ctx.panToTileCenter(35, 32);
  const corridorXs = [35, 36, 37, 38, 39];
  const corridorPoints = [];
  for (const tx of corridorXs) {
    const point = await ctx.pagePointForTile(tx, 32);
    if (point === null) {
      throw new Error(`corridor tile ${String(tx)},32 is off screen`);
    }
    corridorPoints.push(point);
  }
  const corridorFirst = corridorPoints[0];
  await page.mouse.move(corridorFirst.x, corridorFirst.y);
  await page.mouse.down();
  for (let i = 1; i < corridorPoints.length; i += 1) {
    const point = corridorPoints[i];
    await page.mouse.move(point.x, point.y);
  }
  await page.mouse.up();
  await ctx.stepOnce();
  let setupTicks = 0;
  for (;;) {
    const imps = await page.evaluate(() => globalThis.__keeper.impSnapshot());
    const busy = imps.some((imp) => imp.state === "walking" || imp.state === "working");
    if (busy) {
      break;
    }
    if (setupTicks >= 200) {
      throw new Error(`no imp took a corridor job after ${String(setupTicks)} ticks`);
    }
    await ctx.stepOnce(2, 5);
    setupTicks += 2;
  }

  ctx.clipStart();
  await ctx.panToTileCenter(31, 30);
  await page.click("#paint-treasury", { force: true });
  const paintingOn = await page.evaluate(() => globalThis.__keeper.painting);
  if (!paintingOn) {
    throw new Error("paint treasury tool did not select Painting");
  }
  const treasuryXs = [30, 31, 32];
  const treasuryY = 30;
  const treasuryPoints = [];
  for (const tx of treasuryXs) {
    const point = await ctx.pagePointForTile(tx, treasuryY);
    if (point === null) {
      throw new Error(`treasury tile ${String(tx)},${String(treasuryY)} is off screen`);
    }
    treasuryPoints.push(point);
  }
  const treasuryFirst = treasuryPoints[0];
  await page.mouse.move(treasuryFirst.x, treasuryFirst.y);
  await page.mouse.down();
  for (let i = 1; i < treasuryPoints.length; i += 1) {
    const point = treasuryPoints[i];
    await page.mouse.move(point.x, point.y);
  }
  await page.mouse.up();
  await ctx.stepOnce();
  const treasuryTiles = await page.evaluate(() => globalThis.__keeper.treasuryTiles());
  if (treasuryTiles.length !== 3) {
    throw new Error(`expected 3 treasury tiles after drag, got ${String(treasuryTiles.length)}`);
  }
  for (const tile of treasuryTiles) {
    if (!treasuryXs.includes(tile.x) || tile.y !== treasuryY) {
      throw new Error(`unexpected treasury tile ${String(tile.x)},${String(tile.y)}`);
    }
    if (tile.stock !== 0) {
      throw new Error(`treasury tile ${String(tile.x)},${String(tile.y)} started with stock ${String(tile.stock)}`);
    }
  }
  const spentAfterPaint = await page.evaluate(() => globalThis.__keeper.goldSpent);
  if (spentAfterPaint !== 75) {
    throw new Error(`expected 75 gold spent after painting 3 tiles, got ${String(spentAfterPaint)}`);
  }
  await page.click("#paint-treasury", { force: true });
  const paintingOff = await page.evaluate(() => globalThis.__keeper.painting);
  if (paintingOff) {
    throw new Error("paint treasury tool stayed selected after toggle");
  }
  await ctx.checkpoint("paint");

  await ctx.panToTileCenter(38, 31);
  let extraTicks = 0;
  let maxCarrying = 0;
  let carryingSeen = false;
  for (;;) {
    const counts = await page.evaluate(() => ({
      stock: globalThis.__keeper.treasuryStockTotal,
      tiles: globalThis.__keeper.treasuryTiles(),
      carrying: globalThis.__keeper.carryingCount,
      goldStored: globalThis.__keeper.goldStored,
    }));
    if (counts.carrying > maxCarrying) {
      maxCarrying = counts.carrying;
    }
    if (counts.carrying > 0) {
      carryingSeen = true;
    }
    if (counts.stock >= 20 && counts.tiles.some((tile) => tile.stock > 0)) {
      break;
    }
    if (extraTicks >= 4000) {
      throw new Error(
        `treasury delivery not complete after ${String(extraTicks)} extra ticks: stock ${String(counts.stock)}, carrying ${String(counts.carrying)}, goldStored ${String(counts.goldStored)}`,
      );
    }
    await ctx.stepOnce(16, 1);
    extraTicks += 16;
  }
  if (!carryingSeen) {
    throw new Error("no imp carried gold into the treasury");
  }
  const delivered = await page.evaluate(() => ({
    tiles: globalThis.__keeper.treasuryTiles(),
    stock: globalThis.__keeper.treasuryStockTotal,
    goldStored: globalThis.__keeper.goldStored,
    hudText: globalThis.__keeper.hudText,
    tick: globalThis.__keeper.tick,
    hash: globalThis.__keeper.worldHash,
  }));
  if (delivered.stock < 20) {
    throw new Error(`treasury stock ended at ${String(delivered.stock)}`);
  }
  if (!delivered.tiles.some((tile) => tile.stock > 0)) {
    throw new Error("no treasury tile had a gold pile");
  }
  const ownedGold = delivered.goldStored + delivered.stock;
  if (!delivered.hudText.includes(`gold ${String(ownedGold)}`)) {
    throw new Error(`hud did not show stored plus treasury gold: ${delivered.hudText}`);
  }
  console.log(
    `treasury tick=${String(delivered.tick)} stock=${String(delivered.stock)} goldStored=${String(delivered.goldStored)} ownedGold=${String(ownedGold)} maxCarrying=${String(maxCarrying)}`,
  );
  await ctx.checkpoint("treasury");
  await ctx.panToTileCenter(31, 30);
  for (let i = 0; i < 2; i += 1) {
    await ctx.panToTileCenter(i % 2 === 0 ? 35 : 30, 32);
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, i % 2 === 0 ? -240 : 240);
    await ctx.stepOnce(1, 120);
  }
  await ctx.panToTileCenter(31, 30);
  await ctx.stepOnce(1, 120);
  ctx.clipEnd();
  await ctx.screenshot("proof/treasury.png", "treasury");
}

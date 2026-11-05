import { setTimeout as delay } from "node:timers/promises";

export const name = "paintClick";

async function pointFor(ctx, tx, ty) {
  const point = await ctx.pagePointForTile(tx, ty);
  if (point === null) {
    throw new Error(`tile ${String(tx)},${String(ty)} is off screen`);
  }
  return point;
}

export async function run(ctx) {
  const { page } = ctx;
  for (let i = 0; i < 3; i += 1) {
    await page.click("#add-gold", { force: true });
    await ctx.stepOnce();
  }
  await ctx.panToTileCenter(31, 32);

  ctx.clipStart();
  await page.click("#paint-library", { force: true });
  const paintingOn = await page.evaluate(() => globalThis.__keeper.painting);
  if (!paintingOn) {
    throw new Error("paint library tool did not select Painting");
  }
  await delay(800);

  const hoverTiles = [
    [30, 31],
    [31, 31],
    [32, 31],
    [30, 32],
    [31, 32],
    [32, 32],
  ];
  const spentBeforeHover = await page.evaluate(() => globalThis.__keeper.goldSpent);
  const libraryBeforeHover = await page.evaluate(() => globalThis.__keeper.libraryTileCount);
  for (const [tx, ty] of hoverTiles) {
    const point = await pointFor(ctx, tx, ty);
    await page.mouse.move(point.x, point.y);
    await delay(350);
    await ctx.stepOnce();
  }
  const spentAfterHover = await page.evaluate(() => globalThis.__keeper.goldSpent);
  const libraryAfterHover = await page.evaluate(() => globalThis.__keeper.libraryTileCount);
  if (spentAfterHover !== spentBeforeHover || libraryAfterHover !== libraryBeforeHover) {
    throw new Error(
      `hover painted while tool selected: spent ${String(spentBeforeHover)}→${String(spentAfterHover)} library ${String(libraryBeforeHover)}→${String(libraryAfterHover)}`,
    );
  }
  await ctx.checkpoint("hover-no-paint");

  const clickPoint = await pointFor(ctx, 30, 32);
  await page.mouse.move(clickPoint.x, clickPoint.y);
  await page.mouse.down();
  await page.mouse.up();
  await ctx.stepOnce();
  const afterClick = await page.evaluate(() => ({
    library: globalThis.__keeper.libraryTileCount,
    spent: globalThis.__keeper.goldSpent,
  }));
  if (afterClick.library < 1) {
    throw new Error(`expected a library tile after click, got ${String(afterClick.library)}`);
  }
  await ctx.checkpoint("click-paint");
  await delay(900);

  const dragXs = [31, 32];
  await page.mouse.move(clickPoint.x, clickPoint.y);
  await page.mouse.down();
  for (const tx of dragXs) {
    const point = await pointFor(ctx, tx, 32);
    await page.mouse.move(point.x, point.y);
    await delay(450);
  }
  await page.mouse.up();
  await ctx.stepOnce();
  const afterDrag = await page.evaluate(() => ({
    library: globalThis.__keeper.libraryTileCount,
    spent: globalThis.__keeper.goldSpent,
  }));
  if (afterDrag.library < 3) {
    throw new Error(`expected at least 3 library tiles after drag, got ${String(afterDrag.library)}`);
  }
  await ctx.checkpoint("drag-paint");
  await ctx.screenshot("proof/shot.png", "paint-click");

  const spentAfterDrag = afterDrag.spent;
  const libraryAfterDrag = afterDrag.library;
  for (const [tx, ty] of [
    [30, 31],
    [31, 31],
    [32, 31],
    [30, 33],
    [31, 33],
  ]) {
    const point = await pointFor(ctx, tx, ty);
    await page.mouse.move(point.x, point.y);
    await delay(350);
    await ctx.stepOnce();
  }
  const afterReleaseHover = await page.evaluate(() => ({
    library: globalThis.__keeper.libraryTileCount,
    spent: globalThis.__keeper.goldSpent,
  }));
  if (afterReleaseHover.library !== libraryAfterDrag || afterReleaseHover.spent !== spentAfterDrag) {
    throw new Error(
      `hover after release painted: library ${String(libraryAfterDrag)}→${String(afterReleaseHover.library)} spent ${String(spentAfterDrag)}→${String(afterReleaseHover.spent)}`,
    );
  }
  await ctx.checkpoint("release-no-paint");
  await delay(3500);

  await page.click("#paint-library", { force: true });
  const paintingOff = await page.evaluate(() => globalThis.__keeper.painting);
  if (paintingOff) {
    throw new Error("paint library stayed selected after toggle");
  }
  await ctx.clipEnd();
}

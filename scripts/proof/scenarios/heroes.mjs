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

export const name = "heroes";

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

  let setupTicks = 0;
  for (;;) {
    const creatures = await page.evaluate(() => globalThis.__keeper.creatureSnapshot());
    if (creatures.some((creature) => creature.state === "sleeping")) {
      break;
    }
    if (setupTicks >= 600) {
      throw new Error(`creature did not reach a bed after ${String(setupTicks)} ticks`);
    }
    await ctx.stepOnce(12, 10);
    setupTicks += 12;
  }

  let arrivalTicks = 0;
  for (;;) {
    const heroCount = await page.evaluate(() => globalThis.__keeper.heroCount);
    if (heroCount >= 1) {
      break;
    }
    if (arrivalTicks >= 1500) {
      throw new Error(`no hero arrived after ${String(arrivalTicks)} ticks`);
    }
    await ctx.stepOnce(12, 10);
    arrivalTicks += 12;
  }

  ctx.clipStart();
  const initial = await page.evaluate(() => ({
    heartHp: globalThis.__keeper.heartHp,
    heartBreached: globalThis.__keeper.heartBreached,
    heroCount: globalThis.__keeper.heroCount,
  }));
  if (initial.heroCount < 1) {
    throw new Error("heart proof started without a live hero");
  }
  let heartTicks = 0;
  let current = await page.evaluate(() => ({
    heartHp: globalThis.__keeper.heartHp,
    heartBreached: globalThis.__keeper.heartBreached,
    heroCount: globalThis.__keeper.heroCount,
  }));
  while (!(current.heartBreached || current.heartHp < initial.heartHp)) {
    if (heartTicks >= 1000) {
      throw new Error(`heart did not take damage after ${String(heartTicks)} ticks with heroes present`);
    }
    await ctx.stepOnce(1, 1);
    heartTicks += 1;
    current = await page.evaluate(() => ({
      heartHp: globalThis.__keeper.heartHp,
      heartBreached: globalThis.__keeper.heartBreached,
      heroCount: globalThis.__keeper.heroCount,
    }));
  }

  await ctx.panToTileCenter(32, 32);
  await ctx.stepOnce(1, 150);
  await ctx.screenshot("proof/heroes.png", "heroes");
  await ctx.checkpoint("heroes-heart");

  let breachTicks = 0;
  while (!current.heartBreached) {
    if (breachTicks >= 1000) {
      throw new Error(`heart was not breached after ${String(breachTicks)} ticks`);
    }
    await ctx.stepOnce(1, 1);
    breachTicks += 1;
    current = await page.evaluate(() => ({
      heartHp: globalThis.__keeper.heartHp,
      heartBreached: globalThis.__keeper.heartBreached,
      heroCount: globalThis.__keeper.heroCount,
    }));
  }
  await ctx.checkpoint("heroes-breach");

  const drawCalls = await page.evaluate(() => globalThis.__keeper.drawCalls);
  if (drawCalls > 7) {
    throw new Error(`draw calls ${String(drawCalls)} exceed 7`);
  }
  console.log(
    `heroes heroes=${String(initial.heroCount)} heartHp=${String(current.heartHp)} breached=${String(current.heartBreached)} heartTicks=${String(heartTicks)} breachTicks=${String(breachTicks)} drawCalls=${String(drawCalls)}`,
  );

  for (let i = 0; i < 4; i += 1) {
    await ctx.panToTileCenter(i % 2 === 0 ? 35 : 30, 32);
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, i % 2 === 0 ? -240 : 240);
    await ctx.stepOnce(1, 150);
  }
  await ctx.panToTileCenter(32, 32);
  await ctx.stepOnce(1, 250);
  ctx.clipEnd();
}

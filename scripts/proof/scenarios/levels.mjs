const LIBRARY_COST = 55;
const TRAINING_COST = 40;
const LAIR_COST = 30;

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

async function waitForLevel(page, ctx, id, level) {
  let creature;
  for (let i = 0; i < 600; i += 1) {
    const snapshot = await page.evaluate(() => globalThis.__keeper.creatureSnapshot());
    creature = snapshot.find((entry) => entry.id === id);
    if (creature !== undefined && creature.level >= level) {
      return creature;
    }
    await ctx.stepOnce(10, 8);
  }
  throw new Error(`creature ${String(id)} never reached level ${String(level)}`);
}

export const name = "levels";

export async function run(ctx) {
  const { page } = ctx;
  for (let i = 0; i < 20; i += 1) {
    await page.click("#add-gold", { force: true });
    await ctx.stepOnce();
  }
  await ctx.panToTileCenter(32, 32);

  ctx.clipStart();
  await paintRow(ctx, "#paint-library", [30, 31, 32, 33, 34], 30);
  await paintRow(ctx, "#paint-training", [30, 31, 32, 33, 34], 31);
  await paintRow(ctx, "#paint-lair", [30, 31, 32, 33, 34], 33);
  const counts = await page.evaluate(() => ({
    libraryTileCount: globalThis.__keeper.libraryTileCount,
    trainingTileCount: globalThis.__keeper.trainingTileCount,
    lairTileCount: globalThis.__keeper.lairTileCount,
    goldSpent: globalThis.__keeper.goldSpent,
  }));
  const expectedSpent = 5 * LIBRARY_COST + 5 * TRAINING_COST + 5 * LAIR_COST;
  if (counts.libraryTileCount !== 5 || counts.trainingTileCount !== 5 || counts.lairTileCount !== 5) {
    throw new Error(
      `expected 5 library, training and lair tiles, got ${String(counts.libraryTileCount)}, ${String(counts.trainingTileCount)}, ${String(counts.lairTileCount)}`,
    );
  }
  if (counts.goldSpent !== expectedSpent) {
    throw new Error(`expected ${String(expectedSpent)} gold spent, got ${String(counts.goldSpent)}`);
  }
  await ctx.checkpoint("levels-paint");

  let target;
  for (let i = 0; i < 400; i += 1) {
    const snapshot = await page.evaluate(() => globalThis.__keeper.creatureSnapshot());
    target = snapshot.find((creature) => creature.level === 0);
    if (target !== undefined) {
      break;
    }
    await ctx.stepOnce(20, 8);
  }
  if (target === undefined) {
    throw new Error("no creature arrived to train");
  }
  await ctx.checkpoint("levels-arrived");

  for (const level of [1, 2, 3]) {
    const creature = await waitForLevel(page, ctx, target.id, level);
    await ctx.panToTileCenter(creature.tileX, creature.tileY);
    await ctx.checkpoint(`levels-${String(level)}`);
    if (level === 3) {
      await page.mouse.move(ctx.cx, ctx.cy);
      for (let i = 0; i < 4; i += 1) {
        await page.mouse.wheel(0, -240);
        await ctx.stepOnce(1, 10);
      }
      await ctx.stepOnce(1, 150);
      await ctx.screenshot("proof/levels.png", "levels");
    }
  }
  for (let i = 0; i < 40; i += 1) {
    await ctx.stepOnce(0, 100);
  }
  ctx.clipEnd();

  const result = await page.evaluate(() => ({
    tick: globalThis.__keeper.tick,
    hash: globalThis.__keeper.worldHash,
    drawCalls: globalThis.__keeper.drawCalls,
    creature: globalThis.__keeper.creatureSnapshot(),
  }));
  if (result.drawCalls > 7) {
    throw new Error(`draw calls ${String(result.drawCalls)} exceed 7`);
  }
  const finalCreature = result.creature.find((creature) => creature.id === target.id);
  if (finalCreature === undefined || finalCreature.level !== 3) {
    throw new Error("target creature did not end at level three");
  }
  console.log(
    `levels tick=${String(result.tick)} hash=${String(result.hash)} creature=${String(finalCreature.kind)} level=${String(finalCreature.level)} hp=${String(finalCreature.hp)}/${String(finalCreature.maxHp)} drawCalls=${String(result.drawCalls)}`,
  );
}

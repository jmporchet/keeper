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
  let previous = await page.evaluate(() => ({
    heroes: globalThis.__keeper.heroSnapshot(),
    creatures: globalThis.__keeper.creatureSnapshot(),
    heroCount: globalThis.__keeper.heroCount,
    creatureCount: globalThis.__keeper.creatureCount,
  }));
  let fightTicks = 0;
  for (;;) {
    const current = await page.evaluate(() => ({
      heroes: globalThis.__keeper.heroSnapshot(),
      creatures: globalThis.__keeper.creatureSnapshot(),
      heroCount: globalThis.__keeper.heroCount,
      creatureCount: globalThis.__keeper.creatureCount,
    }));
    const heroHpDropped = current.heroes.some((hero) => {
      const before = previous.heroes.find((entry) => entry.id === hero.id);
      return before !== undefined && hero.hp < before.hp;
    });
    const creatureHpDropped = current.creatures.some((creature) => {
      const before = previous.creatures.find((entry) => entry.id === creature.id);
      return before !== undefined && creature.hp < before.hp;
    });
    const heroDied = current.heroCount < previous.heroCount;
    const creatureDied = current.creatureCount < previous.creatureCount;
    previous = current;
    if (heroHpDropped || creatureHpDropped || heroDied || creatureDied) {
      break;
    }
    if (fightTicks >= 2000) {
      throw new Error(`no fight started after ${String(fightTicks)} ticks with heroes present`);
    }
    await ctx.stepOnce(1, 1);
    fightTicks += 1;
  }

  const focusCreature = previous.creatures[0];
  const focusHero = previous.heroes[0];
  const focus = focusCreature === undefined ? focusHero : focusCreature;
  if (focus === undefined) {
    throw new Error("fight tick had no hero or creature to focus");
  }
  await ctx.panToTileCenter(focus.tileX, focus.tileY);
  await ctx.stepOnce(1, 150);
  await ctx.screenshot("proof/heroes.png", "heroes");
  await ctx.checkpoint("heroes-fight");
  const drawCalls = await page.evaluate(() => globalThis.__keeper.drawCalls);
  if (drawCalls > 7) {
    throw new Error(`draw calls ${String(drawCalls)} exceed 7`);
  }
  console.log(
    `heroes heroes=${String(previous.heroCount)} creatures=${String(previous.creatureCount)} fightTicks=${String(fightTicks)} focus=${String(focus.tileX)},${String(focus.tileY)} drawCalls=${String(drawCalls)}`,
  );

  for (let i = 0; i < 4; i += 1) {
    await ctx.panToTileCenter(i % 2 === 0 ? 35 : 30, 32);
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, i % 2 === 0 ? -240 : 240);
    await ctx.stepOnce(1, 150);
  }
  await ctx.panToTileCenter(focus.tileX, focus.tileY);
  await ctx.stepOnce(1, 250);
  ctx.clipEnd();
}

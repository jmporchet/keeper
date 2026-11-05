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

function heroById(heroes, id) {
  return heroes.find((hero) => hero.id === id);
}

export const name = "lightning";

export async function run(ctx) {
  const { page } = ctx;
  await page.click("#add-gold", { force: true });
  await page.click("#add-gold", { force: true });
  await ctx.stepOnce();
  await ctx.panToTileCenter(31, 31);
  await paintRow(ctx, "#paint-lair", [30, 31, 32], 31);

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
    await ctx.stepOnce(4, 10);
    arrivalTicks += 4;
  }

  const heroesBefore = await page.evaluate(() => globalThis.__keeper.heroSnapshot());
  const target = heroesBefore[0];
  if (target === undefined) {
    throw new Error("hero proof started without a live hero");
  }
  await ctx.panToTileCenter(target.tileX, target.tileY);
  const before = await page.evaluate(() => ({
    tick: globalThis.__keeper.tick,
    goldSpent: globalThis.__keeper.goldSpent,
    cooldown: globalThis.__keeper.lightningCooldown,
    cost: globalThis.__keeper.lightningCost,
    damage: globalThis.__keeper.lightningDamage,
    cooldownTicks: globalThis.__keeper.lightningCooldownTicks,
    hudText: globalThis.__keeper.hudText,
    heroes: globalThis.__keeper.heroSnapshot(),
  }));
  const targetBefore = heroById(before.heroes, target.id);
  if (targetBefore === undefined) {
    throw new Error(`target hero ${String(target.id)} disappeared before the cast`);
  }
  if (!before.hudText.includes("lightning ready")) {
    throw new Error(`HUD did not show a ready lightning spell: ${before.hudText}`);
  }

  ctx.clipStart();
  await page.click("#cast-lightning", { force: true });
  await ctx.stepOnce(1, 250);
  const after = await page.evaluate(() => ({
    tick: globalThis.__keeper.tick,
    hash: globalThis.__keeper.worldHash,
    goldSpent: globalThis.__keeper.goldSpent,
    cooldown: globalThis.__keeper.lightningCooldown,
    hudText: globalThis.__keeper.hudText,
    heroes: globalThis.__keeper.heroSnapshot(),
    drawCalls: globalThis.__keeper.drawCalls,
  }));
  const targetAfter = heroById(after.heroes, target.id);
  if (after.goldSpent !== before.goldSpent + before.cost) {
    throw new Error(`lightning did not spend ${String(before.cost)} gold: ${String(before.goldSpent)} -> ${String(after.goldSpent)}`);
  }
  if (after.cooldown !== before.cooldownTicks - 1) {
    throw new Error(`lightning cooldown was ${String(after.cooldown)}, expected ${String(before.cooldownTicks - 1)}`);
  }
  if (!after.hudText.includes(`lightning ${String(after.cooldown)}`)) {
    throw new Error(`HUD did not show the lightning cooldown: ${after.hudText}`);
  }
  if (targetAfter === undefined) {
    if (targetBefore.hp > before.damage) {
      throw new Error(`lightning killed hero ${String(target.id)} with ${String(targetBefore.hp)} hp`);
    }
  } else if (targetAfter.hp !== targetBefore.hp - before.damage) {
    throw new Error(`lightning did not deal ${String(before.damage)} damage: ${String(targetBefore.hp)} -> ${String(targetAfter.hp)}`);
  }
  if (after.drawCalls > 7) {
    throw new Error(`draw calls ${String(after.drawCalls)} exceed 7`);
  }
  await ctx.screenshot("proof/lightning.png", "lightning");
  await ctx.checkpoint("lightning-cast");

  const beforeRecast = await page.evaluate(() => ({
    goldSpent: globalThis.__keeper.goldSpent,
    cooldown: globalThis.__keeper.lightningCooldown,
    heroes: globalThis.__keeper.heroSnapshot(),
  }));
  await page.click("#cast-lightning", { force: true });
  await ctx.stepOnce(1, 250);
  const afterRecast = await page.evaluate(() => ({
    tick: globalThis.__keeper.tick,
    hash: globalThis.__keeper.worldHash,
    goldSpent: globalThis.__keeper.goldSpent,
    cooldown: globalThis.__keeper.lightningCooldown,
    hudText: globalThis.__keeper.hudText,
    heroes: globalThis.__keeper.heroSnapshot(),
    drawCalls: globalThis.__keeper.drawCalls,
  }));
  const targetRecast = heroById(afterRecast.heroes, target.id);
  const targetBeforeRecast = heroById(beforeRecast.heroes, target.id);
  if (afterRecast.goldSpent !== beforeRecast.goldSpent) {
    throw new Error(`recast during cooldown spent gold: ${String(beforeRecast.goldSpent)} -> ${String(afterRecast.goldSpent)}`);
  }
  if (afterRecast.cooldown !== beforeRecast.cooldown - 1) {
    throw new Error(`recast cooldown was ${String(afterRecast.cooldown)}, expected ${String(beforeRecast.cooldown - 1)}`);
  }
  if (targetBeforeRecast !== undefined && targetRecast !== undefined && targetRecast.hp !== targetBeforeRecast.hp) {
    throw new Error(`recast during cooldown damaged hero: ${String(targetBeforeRecast.hp)} -> ${String(targetRecast.hp)}`);
  }
  if (!afterRecast.hudText.includes(`lightning ${String(afterRecast.cooldown)}`)) {
    throw new Error(`HUD did not show the cooldown after the recast attempt: ${afterRecast.hudText}`);
  }
  if (afterRecast.drawCalls > 7) {
    throw new Error(`draw calls ${String(afterRecast.drawCalls)} exceed 7`);
  }
  console.log(
    `lightning setupTicks=${String(setupTicks)} arrivalTicks=${String(arrivalTicks)} target=${String(target.id)} hpBefore=${String(targetBefore.hp)} hpAfter=${String(targetAfter === undefined ? 0 : targetAfter.hp)} cost=${String(before.cost)} damage=${String(before.damage)} cooldownTicks=${String(before.cooldownTicks)} cooldown=${String(after.cooldown)} recastCooldown=${String(afterRecast.cooldown)} goldSpent=${String(afterRecast.goldSpent)} hud="${afterRecast.hudText}" drawCalls=${String(afterRecast.drawCalls)}`,
  );

  await ctx.stepOnce(1, 500);
  await ctx.panToTileCenter(target.tileX, target.tileY);
  await ctx.stepOnce(1, 250);
  ctx.clipEnd();
}

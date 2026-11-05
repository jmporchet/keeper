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

function creatureById(creatures, id) {
  return creatures.find((creature) => creature.id === id);
}

export const name = "heal";

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

  const heroCount = await page.evaluate(() => globalThis.__keeper.heroCount);
  if (heroCount > 0) {
    await page.evaluate(() => globalThis.__keeper.clearWave());
    await ctx.stepOnce(1, 10);
  }

  const creaturesBefore = await page.evaluate(() => globalThis.__keeper.creatureSnapshot());
  const target = creaturesBefore.find((creature) => creature.state === "sleeping");
  if (target === undefined) {
    throw new Error("heal proof started without a sleeping creature");
  }
  await ctx.panToTileCenter(target.tileX, target.tileY);
  await page.evaluate(({ id }) => globalThis.__keeper.woundCreature(id, 2), { id: target.id });
  const before = await page.evaluate(() => ({
    tick: globalThis.__keeper.tick,
    goldSpent: globalThis.__keeper.goldSpent,
    cooldown: globalThis.__keeper.healCooldown,
    cost: globalThis.__keeper.healCost,
    amount: globalThis.__keeper.healAmount,
    cooldownTicks: globalThis.__keeper.healCooldownTicks,
    hudText: globalThis.__keeper.hudText,
    creatures: globalThis.__keeper.creatureSnapshot(),
  }));
  const targetBefore = creatureById(before.creatures, target.id);
  if (targetBefore === undefined) {
    throw new Error(`target creature ${String(target.id)} disappeared before the cast`);
  }
  if (targetBefore.hp >= targetBefore.maxHp) {
    throw new Error(`target creature ${String(target.id)} was not wounded`);
  }
  if (!before.hudText.includes("heal ready")) {
    throw new Error(`HUD did not show a ready heal spell: ${before.hudText}`);
  }

  ctx.clipStart();
  await page.click("#cast-heal", { force: true });
  await ctx.stepOnce(1, 250);
  const after = await page.evaluate(() => ({
    tick: globalThis.__keeper.tick,
    hash: globalThis.__keeper.worldHash,
    goldSpent: globalThis.__keeper.goldSpent,
    cooldown: globalThis.__keeper.healCooldown,
    hudText: globalThis.__keeper.hudText,
    creatures: globalThis.__keeper.creatureSnapshot(),
    drawCalls: globalThis.__keeper.drawCalls,
  }));
  const targetAfter = creatureById(after.creatures, target.id);
  if (after.goldSpent !== before.goldSpent + before.cost) {
    throw new Error(`heal did not spend ${String(before.cost)} gold: ${String(before.goldSpent)} -> ${String(after.goldSpent)}`);
  }
  if (after.cooldown !== before.cooldownTicks - 1) {
    throw new Error(`heal cooldown was ${String(after.cooldown)}, expected ${String(before.cooldownTicks - 1)}`);
  }
  if (!after.hudText.includes(`heal ${String(after.cooldown)}`)) {
    throw new Error(`HUD did not show the heal cooldown: ${after.hudText}`);
  }
  if (targetAfter === undefined) {
    throw new Error(`heal removed creature ${String(target.id)}`);
  }
  const expectedHp = Math.min(targetBefore.hp + before.amount, targetBefore.maxHp);
  if (targetAfter.hp !== expectedHp) {
    throw new Error(`heal did not restore ${String(before.amount)} hp capped at ${String(targetBefore.maxHp)}: ${String(targetBefore.hp)} -> ${String(targetAfter.hp)}`);
  }
  if (after.drawCalls > 7) {
    throw new Error(`draw calls ${String(after.drawCalls)} exceed 7`);
  }
  await ctx.screenshot("proof/heal.png", "heal");
  await ctx.checkpoint("heal-cast");

  const beforeRecast = await page.evaluate(() => ({
    goldSpent: globalThis.__keeper.goldSpent,
    cooldown: globalThis.__keeper.healCooldown,
    creatures: globalThis.__keeper.creatureSnapshot(),
  }));
  await page.click("#cast-heal", { force: true });
  await ctx.stepOnce(1, 250);
  const afterRecast = await page.evaluate(() => ({
    tick: globalThis.__keeper.tick,
    hash: globalThis.__keeper.worldHash,
    goldSpent: globalThis.__keeper.goldSpent,
    cooldown: globalThis.__keeper.healCooldown,
    hudText: globalThis.__keeper.hudText,
    creatures: globalThis.__keeper.creatureSnapshot(),
    drawCalls: globalThis.__keeper.drawCalls,
  }));
  const targetRecast = creatureById(afterRecast.creatures, target.id);
  const targetBeforeRecast = creatureById(beforeRecast.creatures, target.id);
  if (afterRecast.goldSpent !== beforeRecast.goldSpent) {
    throw new Error(`recast during cooldown spent gold: ${String(beforeRecast.goldSpent)} -> ${String(afterRecast.goldSpent)}`);
  }
  if (afterRecast.cooldown !== beforeRecast.cooldown - 1) {
    throw new Error(`recast cooldown was ${String(afterRecast.cooldown)}, expected ${String(beforeRecast.cooldown - 1)}`);
  }
  if (targetBeforeRecast !== undefined && targetRecast !== undefined && targetRecast.hp !== targetBeforeRecast.hp) {
    throw new Error(`recast during cooldown healed creature: ${String(targetBeforeRecast.hp)} -> ${String(targetRecast.hp)}`);
  }
  if (!afterRecast.hudText.includes(`heal ${String(afterRecast.cooldown)}`)) {
    throw new Error(`HUD did not show the cooldown after the recast attempt: ${afterRecast.hudText}`);
  }
  if (afterRecast.drawCalls > 7) {
    throw new Error(`draw calls ${String(afterRecast.drawCalls)} exceed 7`);
  }
  console.log(
    `heal setupTicks=${String(setupTicks)} target=${String(target.id)} hpBefore=${String(targetBefore.hp)} hpAfter=${String(targetAfter.hp)} maxHp=${String(targetBefore.maxHp)} cost=${String(before.cost)} amount=${String(before.amount)} cooldownTicks=${String(before.cooldownTicks)} cooldown=${String(after.cooldown)} recastCooldown=${String(afterRecast.cooldown)} goldSpent=${String(afterRecast.goldSpent)} hud="${afterRecast.hudText}" drawCalls=${String(afterRecast.drawCalls)}`,
  );

  await ctx.stepOnce(1, 500);
  await ctx.panToTileCenter(target.tileX, target.tileY);
  await ctx.stepOnce(1, 250);
  ctx.clipEnd();
}

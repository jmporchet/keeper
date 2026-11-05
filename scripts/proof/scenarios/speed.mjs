export const name = "speed";

export async function run(ctx) {
  const { page } = ctx;
  await page.click("#add-gold", { force: true });
  await ctx.stepOnce();
  await ctx.panToTileCenter(32, 32);

  const digPoint = await ctx.pagePointForTile(35, 32);
  if (digPoint === null) {
    throw new Error("dig tile 35,32 is off screen");
  }
  await page.mouse.move(digPoint.x, digPoint.y);
  await page.mouse.down();
  await page.mouse.up();
  await ctx.stepOnce();

  let setupTicks = 0;
  for (;;) {
    const imps = await page.evaluate(() => globalThis.__keeper.impSnapshot());
    if (imps.some((imp) => imp.state === "working" || imp.state === "walking")) {
      break;
    }
    if (setupTicks >= 400) {
      throw new Error(`no imp started the tagged job after ${String(setupTicks)} ticks`);
    }
    await ctx.stepOnce(4, 5);
    setupTicks += 4;
  }

  const before = await page.evaluate(() => ({
    tick: globalThis.__keeper.tick,
    goldSpent: globalThis.__keeper.goldSpent,
    cooldown: globalThis.__keeper.speedImpsCooldown,
    cost: globalThis.__keeper.speedImpsCost,
    duration: globalThis.__keeper.speedImpsDurationTicks,
    cooldownTicks: globalThis.__keeper.speedImpsCooldownTicks,
    hudText: globalThis.__keeper.hudText,
    imps: globalThis.__keeper.impSnapshot(),
  }));
  if (!before.hudText.includes("speed ready")) {
    throw new Error(`HUD did not show a ready speed spell: ${before.hudText}`);
  }

  ctx.clipStart();
  await page.click("#cast-speed-imps", { force: true });
  await ctx.stepOnce(1, 250);
  const after = await page.evaluate(() => ({
    tick: globalThis.__keeper.tick,
    hash: globalThis.__keeper.worldHash,
    goldSpent: globalThis.__keeper.goldSpent,
    cooldown: globalThis.__keeper.speedImpsCooldown,
    hudText: globalThis.__keeper.hudText,
    imps: globalThis.__keeper.impSnapshot(),
    drawCalls: globalThis.__keeper.drawCalls,
  }));
  if (after.goldSpent !== before.goldSpent + before.cost) {
    throw new Error(`speed imps did not spend ${String(before.cost)} gold: ${String(before.goldSpent)} -> ${String(after.goldSpent)}`);
  }
  if (after.cooldown !== before.cooldownTicks - 1) {
    throw new Error(`speed imps cooldown was ${String(after.cooldown)}, expected ${String(before.cooldownTicks - 1)}`);
  }
  if (!after.hudText.includes(`speed ${String(after.cooldown)}`)) {
    throw new Error(`HUD did not show the speed imps cooldown: ${after.hudText}`);
  }
  const boosted = after.imps.filter((imp) => imp.boost > 0);
  if (boosted.length === 0) {
    throw new Error("speed imps cast did not boost any live imp");
  }
  if (boosted.some((imp) => imp.boost > before.duration - 1)) {
    throw new Error(`a boosted imp exceeded the duration: ${JSON.stringify(boosted)}`);
  }
  if (after.drawCalls > 7) {
    throw new Error(`draw calls ${String(after.drawCalls)} exceed 7`);
  }

  const target = boosted.find((imp) => imp.state === "working" || imp.state === "walking") ?? boosted[0];
  await ctx.panToTileCenter(target.tileX, target.tileY);
  await ctx.screenshot("proof/speed.png", "speed");
  await ctx.checkpoint("speed-cast");

  const beforeRecast = await page.evaluate(() => ({
    goldSpent: globalThis.__keeper.goldSpent,
    cooldown: globalThis.__keeper.speedImpsCooldown,
    imps: globalThis.__keeper.impSnapshot(),
  }));
  await page.click("#cast-speed-imps", { force: true });
  await ctx.stepOnce(1, 250);
  const afterRecast = await page.evaluate(() => ({
    tick: globalThis.__keeper.tick,
    hash: globalThis.__keeper.worldHash,
    goldSpent: globalThis.__keeper.goldSpent,
    cooldown: globalThis.__keeper.speedImpsCooldown,
    hudText: globalThis.__keeper.hudText,
    imps: globalThis.__keeper.impSnapshot(),
    drawCalls: globalThis.__keeper.drawCalls,
  }));
  if (afterRecast.goldSpent !== beforeRecast.goldSpent) {
    throw new Error(`recast during cooldown spent gold: ${String(beforeRecast.goldSpent)} -> ${String(afterRecast.goldSpent)}`);
  }
  if (afterRecast.cooldown !== beforeRecast.cooldown - 1) {
    throw new Error(`recast cooldown was ${String(afterRecast.cooldown)}, expected ${String(beforeRecast.cooldown - 1)}`);
  }
  if (!afterRecast.hudText.includes(`speed ${String(afterRecast.cooldown)}`)) {
    throw new Error(`HUD did not show the cooldown after the recast attempt: ${afterRecast.hudText}`);
  }
  if (afterRecast.imps.filter((imp) => imp.boost > 0).length === 0) {
    throw new Error("recast during cooldown cleared the active boost");
  }
  if (afterRecast.drawCalls > 7) {
    throw new Error(`draw calls ${String(afterRecast.drawCalls)} exceed 7`);
  }

  for (let i = 0; i < 8; i += 1) {
    await ctx.stepOnce(3, 120);
  }
  await ctx.panToTileCenter(target.tileX, target.tileY);
  await ctx.stepOnce(1, 250);
  ctx.clipEnd();

  console.log(
    `speed setupTicks=${String(setupTicks)} target=${String(target.id)} state=${String(target.state)} boosted=${String(boosted.length)} cost=${String(before.cost)} duration=${String(before.duration)} cooldownTicks=${String(before.cooldownTicks)} cooldown=${String(after.cooldown)} recastCooldown=${String(afterRecast.cooldown)} goldSpent=${String(afterRecast.goldSpent)} hud="${afterRecast.hudText}" drawCalls=${String(afterRecast.drawCalls)}`,
  );
}

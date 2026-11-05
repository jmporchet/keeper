export const name = "saveReplay";

export async function run(ctx) {
  const { page, cx, cy } = ctx;
  await ctx.stepOnce(5, 10);
  ctx.clipStart();
  await ctx.stepOnce(5, 100);
  await page.click("#save-game");
  const saved = await page.evaluate(() => ({
    hash: globalThis.__keeper.worldHash,
    tick: globalThis.__keeper.tick,
  }));
  await page.click("#add-gold");
  for (let i = 0; i < 8; i += 1) {
    await ctx.stepOnce(5, 80);
  }
  const diverged = await page.evaluate(() => globalThis.__keeper.worldHash);
  if (diverged === saved.hash) {
    throw new Error(`world hash did not change after playing past the save: ${String(diverged)}`);
  }
  await page.click("#load-game");
  await page.waitForFunction(
    ({ hash, tick }) => globalThis.__keeper.worldHash === hash && globalThis.__keeper.tick === tick,
    saved,
    { timeout: 5000 },
  );
  const loaded = await page.evaluate(() => ({
    hash: globalThis.__keeper.worldHash,
    tick: globalThis.__keeper.tick,
    hudText: globalThis.__keeper.hudText,
  }));
  if (loaded.hash !== saved.hash) {
    throw new Error(`loaded hash ${String(loaded.hash)} does not match saved hash ${String(saved.hash)}`);
  }
  if (loaded.tick !== saved.tick) {
    throw new Error(`loaded tick ${String(loaded.tick)} does not match saved tick ${String(saved.tick)}`);
  }
  if (!loaded.hudText.includes(`tick ${String(saved.tick)}`)) {
    throw new Error(`hud did not show the loaded tick: ${loaded.hudText}`);
  }
  await ctx.screenshot("proof/replay.png", "replay");
  await ctx.checkpoint("replay");
  for (let i = 0; i < 2; i += 1) {
    await ctx.panToTileCenter(i % 2 === 0 ? 35 : 30, 32);
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, i % 2 === 0 ? -240 : 240);
    await ctx.stepOnce(1, 150);
  }
  await ctx.panToTileCenter(31, 32);
  await ctx.stepOnce(1, 150);
  console.log(`saveReplay savedTick=${String(saved.tick)} savedHash=${String(saved.hash)} diverged=${String(diverged)} loadedTick=${String(loaded.tick)}`);
  ctx.clipEnd();
}

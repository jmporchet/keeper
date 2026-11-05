export const name = "pause";

export async function run(ctx) {
  const { page } = ctx;
  ctx.clipStart();
  await ctx.stepOnce(1, 250);
  const beforePause = await page.evaluate(() => globalThis.__keeper.tick);
  await page.keyboard.press("Escape");
  await page.waitForSelector("#pause-overlay.visible");
  const spawnDisabled = await page.locator("#spawn-imp").isDisabled();
  const goldDisabled = await page.locator("#add-gold").isDisabled();
  if (!spawnDisabled || !goldDisabled) {
    throw new Error(`panel buttons not disabled while paused: spawn ${String(spawnDisabled)}, gold ${String(goldDisabled)}`);
  }
  for (let i = 0; i < 2; i += 1) {
    await ctx.stepOnce(1, 15);
  }
  const duringPause = await page.evaluate(() => globalThis.__keeper.tick);
  if (duringPause !== beforePause) {
    throw new Error(`tick advanced while paused: ${String(beforePause)} -> ${String(duringPause)}`);
  }
  await ctx.setVisibility(true);
  await ctx.stepOnce();
  const hiddenWhilePaused = await page.evaluate(() => ({
    tick: globalThis.__keeper.tick,
    appState: globalThis.__keeper.appState,
  }));
  if (hiddenWhilePaused.tick !== duringPause) {
    throw new Error(`tick advanced while hidden and paused: ${String(duringPause)} -> ${String(hiddenWhilePaused.tick)}`);
  }
  if (hiddenWhilePaused.appState !== "hidden") {
    throw new Error(`app state while hidden and paused was ${hiddenWhilePaused.appState}`);
  }
  await ctx.setVisibility(false);
  await page.waitForSelector("#pause-overlay.visible");
  const spawnDisabledAfterHidden = await page.locator("#spawn-imp").isDisabled();
  const goldDisabledAfterHidden = await page.locator("#add-gold").isDisabled();
  const afterVisiblePaused = await page.evaluate(() => ({
    tick: globalThis.__keeper.tick,
    appState: globalThis.__keeper.appState,
  }));
  if (!spawnDisabledAfterHidden || !goldDisabledAfterHidden) {
    throw new Error(
      `panel buttons not disabled after tab return while paused: spawn ${String(spawnDisabledAfterHidden)}, gold ${String(goldDisabledAfterHidden)}`,
    );
  }
  if (afterVisiblePaused.tick !== duringPause) {
    throw new Error(`tick advanced across tab hide and show while paused: ${String(duringPause)} -> ${String(afterVisiblePaused.tick)}`);
  }
  if (afterVisiblePaused.appState !== "paused") {
    throw new Error(`app state after tab return was ${afterVisiblePaused.appState}, expected paused`);
  }
  await ctx.stepOnce();
  await ctx.stepOnce(1, 250);
  const stillPausedAfterVisible = await page.evaluate(() => globalThis.__keeper.tick);
  if (stillPausedAfterVisible !== duringPause) {
    throw new Error(`tick advanced after tab return while paused: ${String(duringPause)} -> ${String(stillPausedAfterVisible)}`);
  }
  console.log(
    `visibility paused hidden=${hiddenWhilePaused.appState} visible=${afterVisiblePaused.appState} tick=${String(afterVisiblePaused.tick)}`,
  );
  await page.keyboard.press("Escape");
  await page.waitForSelector("#pause-overlay.visible", { state: "hidden" });
  const spawnEnabled = await page.locator("#spawn-imp").isEnabled();
  const goldEnabled = await page.locator("#add-gold").isEnabled();
  if (!spawnEnabled || !goldEnabled) {
    throw new Error(`panel buttons not re-enabled after resume: spawn ${String(spawnEnabled)}, gold ${String(goldEnabled)}`);
  }
  for (let i = 0; i < 3; i += 1) {
    await ctx.stepOnce(1, 150);
  }
  const runningBeforeHidden = await page.evaluate(() => globalThis.__keeper.tick);
  await ctx.setVisibility(true);
  await ctx.stepOnce();
  const hiddenWhileRunning = await page.evaluate(() => ({
    tick: globalThis.__keeper.tick,
    appState: globalThis.__keeper.appState,
  }));
  if (hiddenWhileRunning.tick !== runningBeforeHidden) {
    throw new Error(`tick advanced while hidden and running: ${String(runningBeforeHidden)} -> ${String(hiddenWhileRunning.tick)}`);
  }
  if (hiddenWhileRunning.appState !== "hidden") {
    throw new Error(`app state while hidden and running was ${hiddenWhileRunning.appState}`);
  }
  await ctx.setVisibility(false);
  const runningAfterVisible = await page.evaluate(() => globalThis.__keeper.tick);
  if (runningAfterVisible !== runningBeforeHidden) {
    throw new Error(`tick advanced across tab hide and show while running: ${String(runningBeforeHidden)} -> ${String(runningAfterVisible)}`);
  }
  await ctx.stepOnce();
  const runningAdvanced = await page.evaluate(() => ({
    tick: globalThis.__keeper.tick,
    appState: globalThis.__keeper.appState,
  }));
  if (runningAdvanced.tick <= runningAfterVisible) {
    throw new Error(`tick did not advance after tab return while running: ${String(runningAfterVisible)} -> ${String(runningAdvanced.tick)}`);
  }
  if (runningAdvanced.appState !== "running") {
    throw new Error(`app state after tab return while running was ${runningAdvanced.appState}`);
  }
  if (runningAdvanced.tick <= duringPause) {
    throw new Error(`tick did not advance after resume: ${String(duringPause)} -> ${String(runningAdvanced.tick)}`);
  }
  console.log(
    `visibility running hidden=${hiddenWhileRunning.appState} visible=${runningAdvanced.appState} tick=${String(runningBeforeHidden)}->${String(runningAdvanced.tick)}`,
  );
  await ctx.checkpoint("pause");
  console.log(`pause tick=${String(runningAdvanced.tick)}`);
  ctx.clipEnd();
}

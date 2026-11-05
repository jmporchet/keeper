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

function heartState(page) {
  return page.evaluate(() => ({
    heartBreached: globalThis.__keeper.heartBreached,
    breachTicks: globalThis.__keeper.breachTicks,
    defeated: globalThis.__keeper.defeated,
  }));
}

export const name = "defeat";

export async function run(ctx) {
  const { page } = ctx;
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

  let state = await heartState(page);
  let breachTicks = 0;
  while (!state.heartBreached) {
    if (breachTicks >= 1500) {
      throw new Error(`heart was not breached after ${String(breachTicks)} ticks`);
    }
    await ctx.stepOnce(1, 10);
    breachTicks += 1;
    state = await heartState(page);
  }

  await ctx.panToTileCenter(32, 32);
  const defeatTicks = await page.evaluate(() => globalThis.__keeper.defeatTicks);
  const midpoint = Math.floor(defeatTicks / 2);
  while (state.breachTicks < midpoint) {
    await ctx.stepOnce(2, 150);
    state = await heartState(page);
  }
  await ctx.stepOnce(1, 150);
  state = await heartState(page);
  const midHud = await page.evaluate(() => globalThis.__keeper.hudText);
  if (!midHud.includes("breach")) {
    throw new Error(`HUD did not show the breach timer: ${midHud}`);
  }
  await ctx.screenshot("proof/defeat-breach.png", "defeat-breach");
  await ctx.checkpoint("defeat-mid");
  ctx.clipStart();

  while (!state.defeated) {
    if (state.breachTicks > defeatTicks) {
      throw new Error(`breach timer passed ${String(defeatTicks)} without defeat`);
    }
    await ctx.stepOnce(2, 450);
    state = await heartState(page);
  }

  const tickAtDefeat = await page.evaluate(() => globalThis.__keeper.tick);
  await ctx.stepOnce(4, 120);
  const result = await page.evaluate(() => ({
    tick: globalThis.__keeper.tick,
    hash: globalThis.__keeper.worldHash,
    appState: globalThis.__keeper.appState,
    hudText: globalThis.__keeper.hudText,
    breachTicks: globalThis.__keeper.breachTicks,
    defeated: globalThis.__keeper.defeated,
    drawCalls: globalThis.__keeper.drawCalls,
  }));
  const spawnDisabled = await page.locator("#spawn-imp").isDisabled();
  if (!result.defeated || result.appState !== "defeated") {
    throw new Error(`app did not enter defeat: defeated=${String(result.defeated)} state=${result.appState}`);
  }
  if (!result.hudText.includes("defeated")) {
    throw new Error(`HUD did not show defeat: ${result.hudText}`);
  }
  if (result.tick !== tickAtDefeat) {
    throw new Error(`tick advanced after defeat: ${String(tickAtDefeat)} -> ${String(result.tick)}`);
  }
  if (!spawnDisabled) {
    throw new Error("sandbox panel actions stayed enabled after defeat");
  }
  if (result.drawCalls > 7) {
    throw new Error(`draw calls ${String(result.drawCalls)} exceed 7`);
  }
  console.log(
    `defeat setupTicks=${String(setupTicks)} arrivalTicks=${String(arrivalTicks)} breachTicks=${String(breachTicks)} midBreach=${String(midpoint)} tick=${String(result.tick)} hash=${String(result.hash)} appState=${result.appState} hud="${result.hudText}" drawCalls=${String(result.drawCalls)}`,
  );

  await ctx.stepOnce(1, 250);

  const restartVisible = await page.locator("#restart-game").isVisible();
  if (!restartVisible) {
    throw new Error("restart control is not visible after defeat");
  }
  await ctx.screenshot("proof/defeat.png", "defeat");
  const seedBeforeRestart = await page.evaluate(() => globalThis.__keeper.seed);
  await page.click("#restart-game", { force: true });
  const restarted = await page.evaluate(() => ({
    seed: globalThis.__keeper.seed,
    tick: globalThis.__keeper.tick,
    hash: globalThis.__keeper.worldHash,
    freshHash: globalThis.__keeper.freshHash,
    commandCount: globalThis.__keeper.commandCount,
    appState: globalThis.__keeper.appState,
    defeated: globalThis.__keeper.defeated,
    victorious: globalThis.__keeper.victorious,
    heartBreached: globalThis.__keeper.heartBreached,
    wavesCleared: globalThis.__keeper.wavesCleared,
    breachTicks: globalThis.__keeper.breachTicks,
    creatureCount: globalThis.__keeper.creatureCount,
    heroCount: globalThis.__keeper.heroCount,
    drawCalls: globalThis.__keeper.drawCalls,
  }));
  if (restarted.seed !== seedBeforeRestart) {
    throw new Error(`restart changed seed ${String(seedBeforeRestart)} -> ${String(restarted.seed)}`);
  }
  if (restarted.appState !== "running") {
    throw new Error(`restart did not return to running: ${restarted.appState}`);
  }
  if (restarted.tick !== 0 || restarted.hash !== restarted.freshHash) {
    throw new Error(
      `restart did not match a fresh world: tick=${String(restarted.tick)} hash=${String(restarted.hash)} fresh=${String(restarted.freshHash)}`,
    );
  }
  if (restarted.commandCount !== 0) {
    throw new Error(`restart kept ${String(restarted.commandCount)} commands`);
  }
  if (restarted.defeated || restarted.victorious || restarted.heartBreached) {
    throw new Error(
      `restart kept end flags: defeated=${String(restarted.defeated)} victorious=${String(restarted.victorious)} breached=${String(restarted.heartBreached)}`,
    );
  }
  if (restarted.wavesCleared !== 0 || restarted.breachTicks !== 0) {
    throw new Error(
      `restart kept counters: wavesCleared=${String(restarted.wavesCleared)} breachTicks=${String(restarted.breachTicks)}`,
    );
  }
  if (restarted.creatureCount !== 0 || restarted.heroCount !== 0) {
    throw new Error(
      `restart kept entities: creatures=${String(restarted.creatureCount)} heroes=${String(restarted.heroCount)}`,
    );
  }
  if (restarted.drawCalls > 7) {
    throw new Error(`restart draw calls ${String(restarted.drawCalls)} exceed 7`);
  }
  const overlayVisible = await page.locator("#pause-overlay").isVisible();
  if (overlayVisible) {
    throw new Error("end screen overlay stayed visible after restart");
  }
  console.log(
    `restart seed=${String(restarted.seed)} tick=${String(restarted.tick)} hash=${String(restarted.hash)} fresh=${String(restarted.freshHash)} appState=${restarted.appState} commandCount=${String(restarted.commandCount)} creatures=${String(restarted.creatureCount)} heroes=${String(restarted.heroCount)} drawCalls=${String(restarted.drawCalls)}`,
  );

  await ctx.stepOnce(12, 150);
  await ctx.stepOnce(12, 150);
  ctx.clipEnd();
}

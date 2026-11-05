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

function victoryState(page) {
  return page.evaluate(() => ({
    tick: globalThis.__keeper.tick,
    hash: globalThis.__keeper.worldHash,
    appState: globalThis.__keeper.appState,
    hudText: globalThis.__keeper.hudText,
    wavesCleared: globalThis.__keeper.wavesCleared,
    victorious: globalThis.__keeper.victorious,
    victoryWaves: globalThis.__keeper.victoryWaves,
    drawCalls: globalThis.__keeper.drawCalls,
  }));
}

export const name = "victory";

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

  await ctx.panToTileCenter(32, 35);
  const victoryWaves = await page.evaluate(() => globalThis.__keeper.victoryWaves);
  await page.evaluate((n) => globalThis.__keeper.setWavesCleared(n), victoryWaves - 1);
  ctx.clipStart();

  for (let i = 0; i < 5; i += 1) {
    await ctx.stepOnce(1, 180);
  }
  await ctx.panToTileCenter(32, 32);
  await page.evaluate(() => globalThis.__keeper.clearWave());
  await ctx.stepOnce(1, 250);
  await ctx.stepOnce(1, 150);
  const restartVisible = await page.locator("#restart-game").isVisible();
  if (!restartVisible) {
    throw new Error("restart control is not visible after victory");
  }
  await ctx.screenshot("proof/victory.png", "victory");

  const result = await victoryState(page);
  const spawnDisabled = await page.locator("#spawn-imp").isDisabled();
  if (!result.victorious || result.appState !== "victorious") {
    throw new Error(
      `app did not enter victory: victorious=${String(result.victorious)} state=${result.appState}`,
    );
  }
  if (result.wavesCleared !== result.victoryWaves) {
    throw new Error(
      `waves cleared ${String(result.wavesCleared)} did not reach ${String(result.victoryWaves)}`,
    );
  }
  if (!result.hudText.includes("victory")) {
    throw new Error(`HUD did not show victory: ${result.hudText}`);
  }
  if (!spawnDisabled) {
    throw new Error("sandbox panel actions stayed enabled after victory");
  }
  if (result.drawCalls > 7) {
    throw new Error(`draw calls ${String(result.drawCalls)} exceed 7`);
  }

  const tickAtVictory = result.tick;
  await ctx.stepOnce(4, 120);
  const frozenTick = await page.evaluate(() => globalThis.__keeper.tick);
  if (frozenTick !== tickAtVictory) {
    throw new Error(`tick advanced after victory: ${String(tickAtVictory)} -> ${String(frozenTick)}`);
  }

  console.log(
    `victory setupTicks=${String(setupTicks)} arrivalTicks=${String(arrivalTicks)} wavesCleared=${String(result.wavesCleared)}/${String(result.victoryWaves)} tick=${String(result.tick)} hash=${String(result.hash)} appState=${result.appState} hud="${result.hudText}" drawCalls=${String(result.drawCalls)}`,
  );

  ctx.clipEnd();
}

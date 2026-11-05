import { ms } from "../harness.mjs";

export const name = "panelPerf";

export async function run(ctx) {
  const { page, cx, cy } = ctx;
  ctx.clipStart();
  const beforePanel = await page.evaluate(() => ({
    impCount: globalThis.__keeper.impCount,
    goldStored: globalThis.__keeper.goldStored,
    taggedCount: globalThis.__keeper.taggedCount,
    hudText: globalThis.__keeper.hudText,
    camera: globalThis.__keeper.camera,
  }));
  await page.click("#spawn-imp", { force: true });
  await page.click("#spawn-imp", { force: true });
  await page.click("#add-gold", { force: true });
  await ctx.stepOnce(2);
  const afterPanel = await page.evaluate(() => ({
    impCount: globalThis.__keeper.impCount,
    goldStored: globalThis.__keeper.goldStored,
    treasuryStockTotal: globalThis.__keeper.treasuryStockTotal,
    taggedCount: globalThis.__keeper.taggedCount,
    hudText: globalThis.__keeper.hudText,
    camera: globalThis.__keeper.camera,
  }));
  if (afterPanel.impCount !== beforePanel.impCount + 2) {
    throw new Error(`panel spawn changed imp count ${String(beforePanel.impCount)} -> ${String(afterPanel.impCount)}`);
  }
  if (afterPanel.goldStored < beforePanel.goldStored + 100) {
    throw new Error(`panel gold changed ${String(beforePanel.goldStored)} -> ${String(afterPanel.goldStored)}`);
  }
  if (afterPanel.taggedCount !== beforePanel.taggedCount) {
    throw new Error(`panel click reached canvas: tagged ${String(beforePanel.taggedCount)} -> ${String(afterPanel.taggedCount)}`);
  }
  if (
    afterPanel.camera.targetX !== beforePanel.camera.targetX ||
    afterPanel.camera.targetZ !== beforePanel.camera.targetZ ||
    afterPanel.camera.yaw !== beforePanel.camera.yaw ||
    afterPanel.camera.pitch !== beforePanel.camera.pitch ||
    afterPanel.camera.distance !== beforePanel.camera.distance
  ) {
    throw new Error("panel click moved the camera");
  }
  const afterPanelOwnedGold = afterPanel.goldStored + afterPanel.treasuryStockTotal;
  if (
    !afterPanel.hudText.includes(`gold ${String(afterPanelOwnedGold)}`) ||
    !afterPanel.hudText.includes(`imps ${String(afterPanel.impCount)}`)
  ) {
    throw new Error(`hud did not show new values: ${afterPanel.hudText}`);
  }
  const maxImpsPerTileAfterPanel = await page.evaluate(() => globalThis.__keeper.maxImpsPerTile);
  if (maxImpsPerTileAfterPanel > 1) {
    throw new Error(`maxImpsPerTile after panel spawn was ${String(maxImpsPerTileAfterPanel)}, expected <= 1`);
  }
  console.log("maxImpsPerTile after panel", maxImpsPerTileAfterPanel);
  await ctx.stepOnce(4, 20);
  await ctx.stepFrames(6, 2, 1);

  await ctx.checkpoint("panel");
  const targetImps = 200;
  const beforeSpawn = await page.evaluate(() => globalThis.__keeper.impCount);
  const toSpawn = targetImps - beforeSpawn;
  if (toSpawn < 0) {
    throw new Error(`imp count ${String(beforeSpawn)} already above ${String(targetImps)}`);
  }
  if (toSpawn > 0) {
    await page.evaluate((n) => globalThis.__keeper.spawnImps(n), toSpawn);
  }
  await ctx.stepOnce(2);
  const spawnedImps = await page.evaluate(() => globalThis.__keeper.impCount);
  if (spawnedImps !== targetImps) {
    throw new Error(`spawnImps ended at ${String(spawnedImps)} imps, expected ${String(targetImps)}`);
  }
  for (let i = 0; i < 2; i += 1) {
    await ctx.stepOnce(2, 15);
  }
  await ctx.stepOnce(1, 0);
  await ctx.presentFrame();
  const maxImpsPerTileAtCapacity = await page.evaluate(() => globalThis.__keeper.maxImpsPerTile);
  console.log("maxImpsPerTile 200", maxImpsPerTileAtCapacity);
  for (let i = 0; i < 8; i += 1) {
    await ctx.panToTileCenter(i % 2 === 0 ? 35 : 30, 32);
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, i % 2 === 0 ? -240 : 240);
    await ctx.stepOnce(2, 120);
  }
  ctx.clipEnd();

  const simWarmup = await page.evaluate(() => globalThis.__keeper.benchSim(3, 200));
  if (simWarmup.samples.length !== 3) {
    throw new Error(`benchSim warm-up returned ${String(simWarmup.samples.length)} samples`);
  }
  const tickBeforeBench = await page.evaluate(() => globalThis.__keeper.tick);
  const simSamples = await page.evaluate(() => globalThis.__keeper.benchSim(30, 200));
  if (simSamples.samples.length !== 30) {
    throw new Error(`benchSim returned ${String(simSamples.samples.length)} samples`);
  }
  const tickAfterBench = await page.evaluate(() => globalThis.__keeper.tick);
  if (tickAfterBench - tickBeforeBench !== 30 * 200) {
    throw new Error(`benchSim advanced tick by ${String(tickAfterBench - tickBeforeBench)}, expected ${String(30 * 200)}`);
  }
  const impsAfterBench = await page.evaluate(() => globalThis.__keeper.impCount);
  if (impsAfterBench !== targetImps) {
    throw new Error(`benchSim ended at ${String(impsAfterBench)} imps, expected ${String(targetImps)}`);
  }
  await ctx.checkpoint("benchsim");

  const frameWarmup = await page.evaluate(() => globalThis.__keeper.benchFrame(2));
  if (frameWarmup.samples.length !== 2) {
    throw new Error(`benchFrame warm-up returned ${String(frameWarmup.samples.length)} samples`);
  }
  const frameSamples = await page.evaluate(() => globalThis.__keeper.benchFrame(8));
  if (frameSamples.samples.length !== 8) {
    throw new Error(`benchFrame returned ${String(frameSamples.samples.length)} samples`);
  }

  const simMedian = simSamples.median;
  const simP95 = simSamples.p95;
  const simMax = simSamples.max;
  const frameMedian = frameSamples.median;
  const frameP95 = frameSamples.p95;
  const frameMax = frameSamples.max;
  const perfDrawCalls = await page.evaluate(() => globalThis.__keeper.drawCalls);
  if (simMedian > 2.0) {
    throw new Error(`sim median ${ms(simMedian)} ms/tick exceeds 2.0 ms with ${String(targetImps)} imps`);
  }
  if (simP95 > 4.0) {
    throw new Error(`sim p95 ${ms(simP95)} ms/tick exceeds 4.0 ms with ${String(targetImps)} imps`);
  }
  if (perfDrawCalls > 7) {
    throw new Error(`draw calls ${String(perfDrawCalls)} exceed 7`);
  }
  console.log(
    `perf imps=${String(targetImps)} sim_ms_per_tick median=${ms(simMedian)} p95=${ms(simP95)} max=${ms(simMax)} frame_ms median=${ms(frameMedian)} p95=${ms(frameP95)} max=${ms(frameMax)} drawCalls=${String(perfDrawCalls)}`,
  );

  await ctx.stepOnce(2, 30);
  await ctx.checkpoint("benchframe");
  await ctx.screenshot("proof/perf.png", "perf");
  const result = await page.evaluate(() => ({
    tick: globalThis.__keeper.tick,
    hash: globalThis.__keeper.worldHash,
    impCount: globalThis.__keeper.impCount,
    drawCalls: globalThis.__keeper.drawCalls,
    camera: globalThis.__keeper.camera,
  }));
  if (result.drawCalls > 7) {
    throw new Error(`draw calls ${String(result.drawCalls)} exceed 7`);
  }
  console.log(
    `panelPerf tick=${String(result.tick)} imps=${String(result.impCount)} drawCalls=${String(result.drawCalls)} camera=${String(result.camera.targetX)},${String(result.camera.targetZ)} distance=${String(result.camera.distance)}`,
  );
}

export const name = "digClaim";

export async function run(ctx) {
  const { page, cx, cy } = ctx;
  ctx.clipStart();
  const claimedAtStart = await page.evaluate(() => globalThis.__keeper.claimedCount);
  const sweepXs = [35, 36, 37, 38, 39];
  const sweepPts = [];
  for (const tx of sweepXs) {
    const point = await ctx.pagePointForTile(tx, 32);
    if (point === null) {
      throw new Error(`corridor tile ${String(tx)},32 is off screen`);
    }
    sweepPts.push(point);
  }
  const first = sweepPts[0];
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (let i = 1; i < sweepPts.length; i += 1) {
    const point = sweepPts[i];
    await page.mouse.move(point.x, point.y);
  }
  await page.mouse.up();
  await ctx.stepOnce();
  await ctx.checkpoint("tag");
  const taggedAfterSweep = await page.evaluate(() => globalThis.__keeper.taggedCount);
  if (taggedAfterSweep !== 5) {
    throw new Error(`expected 5 tagged tiles after earth sweep, got ${String(taggedAfterSweep)}`);
  }

  const fastLength = 5;
  const fastRow = await ctx.findTaggableRow(fastLength);
  const fastStart = fastRow.points[0];
  const fastEnd = fastRow.points[fastRow.points.length - 1];
  if (fastStart === undefined || fastEnd === undefined) {
    throw new Error("fast drag row has no endpoints");
  }
  await page.mouse.move(fastStart.x, fastStart.y);
  await page.mouse.down();
  await page.mouse.move(fastEnd.x, fastEnd.y, { steps: 1 });
  await page.mouse.up();
  await ctx.stepOnce();
  const taggedAfterFastDrag = await page.evaluate(() => globalThis.__keeper.taggedCount);
  if (taggedAfterFastDrag !== taggedAfterSweep + fastLength) {
    throw new Error(
      `fast drag tagged ${String(taggedAfterFastDrag - taggedAfterSweep)} tiles, expected ${String(fastLength)}`,
    );
  }
  for (let i = 0; i < fastLength; i += 1) {
    const kind = await page.evaluate(
      ({ x, y }) => globalThis.__keeper.tileKind(x, y),
      { x: fastRow.x + i, y: fastRow.y },
    );
    if (kind !== "taggedEarth" && kind !== "taggedGold") {
      throw new Error(`fast drag left a gap at ${String(fastRow.x + i)},${String(fastRow.y)} (${String(kind)})`);
    }
  }
  await page.mouse.move(fastEnd.x, fastEnd.y);
  await page.mouse.down();
  await page.mouse.move(fastStart.x, fastStart.y, { steps: 1 });
  await page.mouse.up();
  await ctx.stepOnce();
  const taggedAfterFastUntag = await page.evaluate(() => globalThis.__keeper.taggedCount);
  if (taggedAfterFastUntag !== taggedAfterSweep) {
    throw new Error(
      `fast untag left ${String(taggedAfterFastUntag)} tagged tiles, expected ${String(taggedAfterSweep)}`,
    );
  }
  console.log(
    `fast drag row y=${String(fastRow.y)} x=${String(fastRow.x)}..${String(fastRow.x + fastLength - 1)} tagged=${String(fastLength)} contiguous`,
  );

  const rockPoint = await ctx.panToTileCenter(1, 32);
  const beforeRock = await page.evaluate(() => globalThis.__keeper.taggedCount);
  await page.mouse.move(rockPoint.x, rockPoint.y);
  await page.mouse.down();
  await page.mouse.up();
  await ctx.stepOnce();
  const afterRock = await page.evaluate(() => globalThis.__keeper.taggedCount);
  if (afterRock !== beforeRock) {
    throw new Error(`rock click changed tagged count ${String(beforeRock)} -> ${String(afterRock)}`);
  }
  if (afterRock !== 5) {
    throw new Error(`tagged count after rock click was ${String(afterRock)}`);
  }
  await ctx.checkpoint("rock");

  await ctx.panToTileCenter(35, 32);
  await page.mouse.move(cx, cy);
  for (let i = 0; i < 4; i += 1) {
    await page.mouse.wheel(0, -240);
    await ctx.stepOnce(1, 10);
  }
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: "right" });
  for (let i = 0; i < 2; i += 1) {
    await page.mouse.move(cx + i * 18, cy + Math.sin(i / 2) * 28);
    await ctx.stepOnce(6);
  }
  await page.mouse.up({ button: "right" });
  await ctx.panToTileCenter(34.5, 32);
  for (let x = 30; x <= 39; x += 1) {
    const point = await ctx.pagePointForTile(x, 32);
    if (point === null) {
      throw new Error(`corridor tile ${String(x)},32 is off screen`);
    }
  }
  for (let i = 0; i < 3; i += 1) {
    await ctx.stepOnce(10, 1);
  }
  await ctx.checkpoint("corridor");

  await ctx.presentFrame();
  let sawWorking = false;
  for (let i = 0; i < 21; i += 1) {
    await ctx.stepOnce(1, 5);
    const working = await page.evaluate(() =>
      globalThis.__keeper.impSnapshot().some((imp) => imp.state === "working"),
    );
    if (working) {
      sawWorking = true;
    }
  }
  if (!sawWorking) {
    throw new Error("no working imp was visible during the close-up");
  }

  let extraTicks = 0;
  let maxCarrying = 0;
  let carryingSeen = false;
  for (;;) {
    const counts = await page.evaluate(() => ({
      tagged: globalThis.__keeper.taggedCount,
      claimed: globalThis.__keeper.claimedCount,
      carrying: globalThis.__keeper.carryingCount,
      goldStored: globalThis.__keeper.goldStored,
      dirt: globalThis.__keeper.dirtCount,
    }));
    if (counts.carrying > maxCarrying) {
      maxCarrying = counts.carrying;
    }
    if (counts.carrying > 0) {
      carryingSeen = true;
    }
    if (
      counts.tagged === 0 &&
      counts.claimed === claimedAtStart + 5 &&
      carryingSeen &&
      counts.goldStored >= 40
    ) {
      break;
    }
    if (extraTicks >= 4000) {
      throw new Error(
        `dig and claim proof not complete after ${String(extraTicks)} extra ticks: tagged ${String(counts.tagged)}, claimed ${String(counts.claimed)} (start ${String(claimedAtStart)}), carrying ${String(counts.carrying)}, goldStored ${String(counts.goldStored)}`,
      );
    }
    await ctx.stepOnce(16, 1);
    extraTicks += 16;
  }
  if (!carryingSeen) {
    throw new Error("no imp carried gold during the dig and claim scenario");
  }
  await ctx.checkpoint("claim");
  for (let i = 0; i < 3; i += 1) {
    await ctx.panToTileCenter(i % 2 === 0 ? 35 : 30, 32);
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, i % 2 === 0 ? -240 : 240);
    await ctx.stepOnce(1, 150);
  }
  await ctx.panToTileCenter(34.5, 32);
  await ctx.stepOnce(1, 150);
  ctx.clipEnd();

  const result = await page.evaluate(() => ({
    tick: globalThis.__keeper.tick,
    hash: globalThis.__keeper.worldHash,
    taggedCount: globalThis.__keeper.taggedCount,
    dirtCount: globalThis.__keeper.dirtCount,
    claimedCount: globalThis.__keeper.claimedCount,
    goldStored: globalThis.__keeper.goldStored,
    impCount: globalThis.__keeper.impCount,
    carryingCount: globalThis.__keeper.carryingCount,
    camera: globalThis.__keeper.camera,
  }));
  if (result.taggedCount !== 0) {
    throw new Error(`tagged count ended at ${String(result.taggedCount)}`);
  }
  if (result.claimedCount !== claimedAtStart + 5) {
    throw new Error(
      `claimed count ended at ${String(result.claimedCount)}, expected ${String(claimedAtStart + 5)}`,
    );
  }
  if (result.goldStored < 40) {
    throw new Error(`goldStored ended at ${String(result.goldStored)}`);
  }
  for (let x = 30; x <= 39; x += 1) {
    const point = await ctx.pagePointForTile(x, 32);
    if (point === null) {
      throw new Error(`corridor tile ${String(x)},32 is off screen at the end`);
    }
  }
  console.log(
    `digClaim tick=${String(result.tick)} tagged=${String(result.taggedCount)} dirt=${String(result.dirtCount)} claimed=${String(result.claimedCount)} goldStored=${String(result.goldStored)} impCount=${String(result.impCount)} maxCarrying=${String(maxCarrying)} camera=${String(result.camera.targetX)},${String(result.camera.targetZ)} distance=${String(result.camera.distance)}`,
  );
}

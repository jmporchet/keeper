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

export const name = "lair";

export async function run(ctx) {
  const { page, cx, cy } = ctx;
  await page.click("#add-gold", { force: true });
  await ctx.stepOnce();
  await ctx.panToTileCenter(31, 30);
  await paintRow(ctx, "#paint-treasury", [30, 31, 32], 30);
  await page.click("#add-gold", { force: true });
  await ctx.stepOnce();

  ctx.clipStart();
  await ctx.panToTileCenter(31, 31);
  await paintRow(ctx, "#paint-lair", [30, 31, 32], 31);
  const lairTiles = await page.evaluate(() => globalThis.__keeper.lairTileCount);
  if (lairTiles !== 3) {
    throw new Error(`expected 3 lair tiles after drag, got ${String(lairTiles)}`);
  }
  const spentAfterLair = await page.evaluate(() => globalThis.__keeper.goldSpent);
  if (spentAfterLair !== 165) {
    throw new Error(`expected 165 gold spent after treasury and lair, got ${String(spentAfterLair)}`);
  }
  const portalKind = await page.evaluate(() => globalThis.__keeper.tileKind(32, 35));
  if (portalKind !== "portal") {
    throw new Error(`portal tile 32,35 was ${String(portalKind)}`);
  }
  await ctx.checkpoint("lair-paint");

  let creatureTicks = 0;
  for (;;) {
    const snapshot = await page.evaluate(() => globalThis.__keeper.creatureSnapshot());
    if (snapshot.some((creature) => creature.state === "sleeping")) {
      break;
    }
    if (creatureTicks >= 600) {
      throw new Error(`creature did not reach a bed after ${String(creatureTicks)} ticks`);
    }
    await ctx.stepOnce(12, 10);
    creatureTicks += 12;
  }
  const creaturesAfterWalk = await page.evaluate(() => globalThis.__keeper.creatureSnapshot());
  if (creaturesAfterWalk.length < 1) {
    throw new Error("no creature arrived at the portal");
  }
  const bedCreature = creaturesAfterWalk.find((creature) => creature.state === "sleeping");
  if (bedCreature === undefined) {
    throw new Error("no creature was sleeping on a bed");
  }
  const bedX = bedCreature.bedTileX;
  const bedY = bedCreature.bedTileY;
  await ctx.panToTileCenter(bedX, bedY);
  await ctx.checkpoint("lair");
  let wanderTicks = 0;
  let wanderer = bedCreature;
  for (;;) {
    const snapshot = await page.evaluate(() => globalThis.__keeper.creatureSnapshot());
    const wandering = snapshot.find((creature) => creature.state === "wandering");
    if (wandering !== undefined) {
      wanderer = wandering;
      break;
    }
    if (wanderTicks >= 600) {
      throw new Error(`creature did not wander after ${String(wanderTicks)} ticks`);
    }
    await ctx.stepOnce(6, 8);
    wanderTicks += 6;
  }
  if (wanderer.bedTileX !== bedX || wanderer.bedTileY !== bedY) {
    throw new Error(
      `wandering creature bed changed from ${String(bedX)},${String(bedY)} to ${String(wanderer.bedTileX)},${String(wanderer.bedTileY)}`,
    );
  }
  await ctx.panToTileCenter(wanderer.tileX, wanderer.tileY);
  for (let i = 0; i < 8; i += 1) {
    await ctx.stepOnce(2, 40);
  }
  const afterWander = await page.evaluate(() => globalThis.__keeper.creatureSnapshot());
  const wanderCheck = afterWander.find((creature) => creature.id === wanderer.id);
  if (wanderCheck === undefined) {
    throw new Error("wandering creature disappeared before resume");
  }
  if (wanderCheck.bedTileX !== bedX || wanderCheck.bedTileY !== bedY) {
    throw new Error(
      `resumed creature bed changed from ${String(bedX)},${String(bedY)} to ${String(wanderCheck.bedTileX)},${String(wanderCheck.bedTileY)}`,
    );
  }
  await ctx.screenshot("proof/lair.png", "lair");
  await ctx.checkpoint("lair-wander");
  const result = await page.evaluate(() => ({
    tick: globalThis.__keeper.tick,
    hash: globalThis.__keeper.worldHash,
    creatureCount: globalThis.__keeper.creatureCount,
    lairTileCount: globalThis.__keeper.lairTileCount,
    goldSpent: globalThis.__keeper.goldSpent,
  }));
  if (result.creatureCount < 1) {
    throw new Error(`creatureCount ended at ${String(result.creatureCount)}`);
  }
  if (result.lairTileCount !== 3) {
    throw new Error(`lairTileCount ended at ${String(result.lairTileCount)}`);
  }
  console.log(
    `lair tick=${String(result.tick)} creatures=${String(result.creatureCount)} lairTiles=${String(result.lairTileCount)} goldSpent=${String(result.goldSpent)} bed=${String(bedX)},${String(bedY)} wanderTicks=${String(wanderTicks)}`,
  );
  for (let i = 0; i < 3; i += 1) {
    await ctx.panToTileCenter(i % 2 === 0 ? 35 : 30, 32);
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, i % 2 === 0 ? -240 : 240);
    await ctx.stepOnce(1, 150);
  }
  await ctx.panToTileCenter(bedX, bedY);
  await ctx.stepOnce(1, 150);
  ctx.clipEnd();
}

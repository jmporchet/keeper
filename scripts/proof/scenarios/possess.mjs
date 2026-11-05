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

async function creaturePosition(page, id) {
  const creature = await page.evaluate((creatureId) => {
    const snapshot = globalThis.__keeper.creatureSnapshot();
    return snapshot.find((entry) => entry.id === creatureId) ?? null;
  }, id);
  if (creature === null) {
    return null;
  }
  return { x: creature.tileX, y: creature.tileY };
}

export const name = "possess";

export async function run(ctx) {
  const { page, cx, cy } = ctx;
  await page.click("#add-gold", { force: true });
  await page.click("#add-gold", { force: true });
  await ctx.stepOnce();
  await ctx.panToTileCenter(31, 31);
  await paintRow(ctx, "#paint-lair", [30, 31, 32], 31);

  let setupTicks = 0;
  let target;
  for (;;) {
    const creatures = await page.evaluate(() => globalThis.__keeper.creatureSnapshot());
    target = creatures.find((creature) => creature.state === "sleeping");
    if (target !== undefined) {
      break;
    }
    if (setupTicks >= 800) {
      throw new Error(`creature did not reach a bed after ${String(setupTicks)} ticks`);
    }
    await ctx.stepOnce(12, 10);
    setupTicks += 12;
  }

  await ctx.panToTileCenter(target.tileX, target.tileY);
  const point = await ctx.pagePointForTile(target.tileX, target.tileY);
  if (point === null) {
    throw new Error(`creature tile ${String(target.tileX)},${String(target.tileY)} is off screen`);
  }

  ctx.clipStart();
  await page.mouse.dblclick(point.x, point.y);
  await ctx.stepOnce(1);
  const possession = await page.evaluate(() => globalThis.__keeper.possession);
  if (possession.kind !== "creature") {
    throw new Error(`double-click did not possess a creature (${JSON.stringify(possession)})`);
  }
  if (possession.id !== target.id) {
    throw new Error(`possessed ${String(possession.id)}, expected ${String(target.id)}`);
  }
  const before = await creaturePosition(page, possession.id);
  if (before === null) {
    throw new Error(`possessed creature ${String(possession.id)} disappeared`);
  }

  await page.keyboard.down("d");
  await ctx.stepOnce(1);
  await page.keyboard.up("d");
  await ctx.stepOnce(1);
  const after = await creaturePosition(page, possession.id);
  if (after === null) {
    throw new Error(`possessed creature ${String(possession.id)} disappeared after moving`);
  }
  if (after.x === before.x && after.y === before.y) {
    throw new Error(`possessed creature stayed at ${String(before.x)},${String(before.y)}`);
  }

  await ctx.stepOnce(1, 150);
  await ctx.screenshot("proof/possess.png", "possess");
  const drawCalls = await page.evaluate(() => globalThis.__keeper.drawCalls);
  if (drawCalls > 7) {
    throw new Error(`draw calls ${String(drawCalls)} exceed 7`);
  }
  console.log(
    `possess id=${String(possession.id)} from=${String(before.x)},${String(before.y)} to=${String(after.x)},${String(after.y)} drawCalls=${String(drawCalls)}`,
  );

  await page.keyboard.press("Escape");
  await ctx.stepOnce(1);
  const released = await page.evaluate(() => globalThis.__keeper.possession);
  if (released.kind !== "none") {
    throw new Error(`Escape did not release possession (${JSON.stringify(released)})`);
  }
  await ctx.checkpoint("possess-exit");

  for (let i = 0; i < 3; i += 1) {
    await ctx.panToTileCenter(i % 2 === 0 ? 35 : 30, 32);
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, i % 2 === 0 ? -240 : 240);
    await ctx.stepOnce(1, 150);
  }
  await ctx.panToTileCenter(after.x, after.y);
  await ctx.stepOnce(1, 250);
  ctx.clipEnd();
}

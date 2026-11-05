export const name = "hand";

export async function run(ctx) {
  const { page, box, cx, cy } = ctx;
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
  await ctx.locateHandTarget();

  ctx.clipStart();
  const { target, point: pickPoint } = await ctx.locateHandTarget();
  const targetJob = target.job;
  if (targetJob === null || targetJob.state !== "reserved") {
    throw new Error(`imp ${String(target.id)} had no reserved job before pickup`);
  }
  await page.mouse.move(pickPoint.x, pickPoint.y);
  await page.mouse.down();
  await page.mouse.up();
  await ctx.stepOnce();
  const afterPickup = await page.evaluate(() => ({
    heldCount: globalThis.__keeper.heldCount,
    imps: globalThis.__keeper.impSnapshot(),
  }));
  if (afterPickup.heldCount !== 1) {
    throw new Error(`expected 1 held imp after pickup, got ${String(afterPickup.heldCount)}`);
  }
  const heldImp = afterPickup.imps.find((imp) => imp.id === target.id);
  if (heldImp === undefined || heldImp.state !== "held") {
    throw new Error(`imp ${String(target.id)} was not held after pickup`);
  }
  const jobAfterPickup = await page.evaluate(
    ({ x, y }) => globalThis.__keeper.jobSnapshot(x, y),
    { x: targetJob.tileX, y: targetJob.tileY },
  );
  const jobReleased =
    jobAfterPickup !== null && (jobAfterPickup.state === "open" || jobAfterPickup.holder !== target.id);
  if (!jobReleased) {
    throw new Error(
      `job ${String(targetJob.kind)} at ${String(targetJob.tileX)},${String(targetJob.tileY)} was still held by imp ${String(target.id)} after pickup`,
    );
  }
  const pickupTile = { x: heldImp.tileX, y: heldImp.tileY };
  await page.mouse.move(cx, cy);
  for (let i = 0; i < 2; i += 1) {
    await page.mouse.wheel(0, -240);
  }
  await ctx.stepOnce(12, 20);

  const holdStart = Date.now();
  let holdStep = 0;
  while (holdStep < 3 || Date.now() - holdStart < 150) {
    const angle = holdStep * 0.4;
    holdStep += 1;
    await page.mouse.move(
      cx + Math.cos(angle) * box.width * 0.32,
      cy + Math.sin(angle) * box.height * 0.24,
    );
    await ctx.stepOnce(2, 5);
  }
  await page.mouse.move(cx + box.width * 0.11, cy - box.height * 0.09);
  await ctx.stepOnce(1, 50);
  const duringHold = await page.evaluate(() => ({
    heldCount: globalThis.__keeper.heldCount,
    imps: globalThis.__keeper.impSnapshot(),
  }));
  if (duringHold.heldCount !== 1) {
    throw new Error(`expected 1 held imp during hold, got ${String(duringHold.heldCount)}`);
  }
  const stillHeld = duringHold.imps.find((imp) => imp.id === target.id);
  if (stillHeld === undefined || stillHeld.state !== "held") {
    throw new Error(`imp ${String(target.id)} was not held during the arc`);
  }
  await ctx.screenshot("proof/shot.png", "shot");
  await ctx.checkpoint("shot");

  const dropX = 30;
  const dropY = 30;
  const dropKind = await page.evaluate(
    ({ x, y }) => globalThis.__keeper.tileKind(x, y),
    { x: dropX, y: dropY },
  );
  if (dropKind !== "claimed" && dropKind !== "dirt" && dropKind !== "room") {
    throw new Error(`drop tile ${String(dropX)},${String(dropY)} is not walkable (${String(dropKind)})`);
  }
  const dropDistance = Math.max(Math.abs(dropX - pickupTile.x), Math.abs(dropY - pickupTile.y));
  if (dropDistance < 5) {
    throw new Error(`drop tile is only ${String(dropDistance)} tiles from pickup tile`);
  }
  const dropPoint = await ctx.pagePointForTile(dropX, dropY);
  if (dropPoint === null) {
    throw new Error(`drop tile ${String(dropX)},${String(dropY)} is off screen`);
  }
  await page.mouse.move(dropPoint.x, dropPoint.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.up({ button: "right" });
  await ctx.stepOnce();
  const afterDrop = await page.evaluate(() => ({
    heldCount: globalThis.__keeper.heldCount,
    imps: globalThis.__keeper.impSnapshot(),
  }));
  if (afterDrop.heldCount !== 0) {
    throw new Error(`expected 0 held imps after drop, got ${String(afterDrop.heldCount)}`);
  }
  const droppedImp = afterDrop.imps.find((imp) => imp.id === target.id);
  if (
    droppedImp === undefined ||
    droppedImp.state === "held" ||
    droppedImp.tileX !== dropX ||
    droppedImp.tileY !== dropY
  ) {
    throw new Error(`imp ${String(target.id)} was not dropped on tile ${String(dropX)},${String(dropY)}`);
  }
  const droppedKind = await page.evaluate(
    ({ x, y }) => globalThis.__keeper.tileKind(x, y),
    { x: dropX, y: dropY },
  );
  if (droppedKind !== "claimed" && droppedKind !== "dirt" && droppedKind !== "room") {
    throw new Error(`tile ${String(dropX)},${String(dropY)} stopped being walkable after drop`);
  }
  await ctx.checkpoint("drop");

  await ctx.panToTileCenter(dropX, dropY);
  await page.mouse.move(cx, cy);
  for (let i = 0; i < 3; i += 1) {
    await page.mouse.wheel(0, -240);
  }
  await ctx.stepOnce(1, 5);
  const slapTarget = await ctx.locateImp(target.id);
  await page.keyboard.down("Shift");
  await page.mouse.move(slapTarget.point.x, slapTarget.point.y);
  await page.mouse.click(slapTarget.point.x, slapTarget.point.y);
  await page.keyboard.up("Shift");
  await ctx.stepOnce();
  const afterSlap = await page.evaluate(() => ({
    heldCount: globalThis.__keeper.heldCount,
    imps: globalThis.__keeper.impSnapshot(),
  }));
  if (afterSlap.heldCount !== 0) {
    throw new Error(`Shift+left slap picked up an imp: held ${String(afterSlap.heldCount)}`);
  }
  const boostedImp = afterSlap.imps.find((imp) => imp.boost > 0);
  if (boostedImp === undefined) {
    throw new Error("Shift+left click did not boost an imp");
  }
  const boostedId = boostedImp.id;
  for (let i = 0; i < 10; i += 1) {
    await ctx.stepOnce(1, 40);
  }
  await ctx.stepOnce(ctx.slapTicks() + 2 - 10, 20);
  const afterSlapExpiry = await page.evaluate(() => globalThis.__keeper.impSnapshot());
  const expiredImp = afterSlapExpiry.find((imp) => imp.id === boostedId);
  if (expiredImp === undefined || expiredImp.boost !== 0) {
    throw new Error(`imp ${String(boostedId)} boost did not expire after ${String(ctx.slapTicks())} ticks`);
  }
  await ctx.checkpoint("slap");

  const result = await page.evaluate(() => ({
    tick: globalThis.__keeper.tick,
    hash: globalThis.__keeper.worldHash,
    heldCount: globalThis.__keeper.heldCount,
    impCount: globalThis.__keeper.impCount,
    camera: globalThis.__keeper.camera,
  }));
  console.log(
    `hand tick=${String(result.tick)} held=${String(result.heldCount)} impCount=${String(result.impCount)} camera=${String(result.camera.targetX)},${String(result.camera.targetZ)} distance=${String(result.camera.distance)}`,
  );
  ctx.clipEnd();
}

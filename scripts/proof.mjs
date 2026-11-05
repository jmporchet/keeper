import { spawn } from "node:child_process";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const PORT = Number(process.env.PROOF_PORT ?? "4173");
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SLAP_TICKS = 60;

function ms(value) {
  return value.toFixed(3);
}

async function waitUntilReady() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(ORIGIN);
      if (res.ok) {
        return;
      }
    } catch {
      await delay(100);
    }
  }
  throw new Error("vite preview did not become ready");
}

function killProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill("SIGTERM");
}

async function convertWebm(webmPath) {
  await new Promise((resolve, reject) => {
    const ffmpeg = spawn(
      "/usr/bin/ffmpeg",
      ["-y", "-i", webmPath, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "proof/play.mp4"],
      { stdio: "inherit" },
    );
    ffmpeg.on("error", reject);
    ffmpeg.on("exit", (code) => {
      if (code === 0) {
        resolve(undefined);
      } else {
        reject(new Error(`ffmpeg exited ${String(code)}`));
      }
    });
  });
}

function ffprobeDuration() {
  return new Promise((resolve, reject) => {
    let out = "";
    const probe = spawn("/usr/bin/ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      "proof/play.mp4",
    ]);
    probe.stdout.on("data", (data) => {
      out += String(data);
    });
    probe.on("error", reject);
    probe.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited ${String(code)}`));
        return;
      }
      const duration = Number.parseFloat(out.trim());
      resolve(duration);
    });
  });
}

function startPreview() {
  const preview = spawn(
    "node_modules/.bin/vite",
    ["preview", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "inherit" },
  );
  return new Promise((resolve, reject) => {
    const onExit = (code, signal) => {
      reject(new Error(`vite preview exited (${String(code)}/${String(signal)})`));
    };
    preview.once("exit", onExit);
    waitUntilReady().then(() => {
      preview.off("exit", onExit);
      resolve(preview);
    }, reject);
  });
}

async function stepOnce(page, n = 1, waitMs = 30) {
  await page.evaluate((count) => {
    globalThis.__keeper.step(count);
  }, n);
  await delay(waitMs);
}

async function pagePointForTile(page, box, tx, ty) {
  const local = await page.evaluate(({ x, y }) => globalThis.__keeper.canvasPointForTile(x, y), { x: tx, y: ty });
  if (local === null) {
    return null;
  }
  return { x: box.x + local.x, y: box.y + local.y };
}

async function findHandTarget(page) {
  for (let i = 0; i < 200; i += 1) {
    const imps = await page.evaluate(() => globalThis.__keeper.impSnapshot());
    const target = imps.find(
      (imp) => imp.state === "walking" && imp.job !== null && imp.job.state === "reserved" && imp.tileX >= 35,
    );
    if (target !== undefined && !imps.some((imp) => imp.id !== target.id && imp.state === "idle")) {
      return target;
    }
    await stepOnce(page, 3, 10);
  }
  throw new Error("no walking imp with a reserved job and no idle imps appeared");
}

async function locateHandTarget(page, box) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const target = await findHandTarget(page);
    const point = await pagePointForTile(page, box, target.tileX, target.tileY);
    if (point !== null) {
      return { target, point };
    }
    await panToTileCenter(page, box, target.tileX, target.tileY);
  }
  throw new Error("hand target stayed off screen");
}

async function locateImp(page, box, impId) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const imps = await page.evaluate(() => globalThis.__keeper.impSnapshot());
    const imp = imps.find((entry) => entry.id === impId);
    if (imp === undefined || imp.state === "held") {
      throw new Error(`imp ${String(impId)} is missing or held`);
    }
    const point = await pagePointForTile(page, box, imp.tileX, imp.tileY);
    if (point !== null) {
      return { imp, point };
    }
    await panToTileCenter(page, box, imp.tileX, imp.tileY);
  }
  throw new Error(`imp ${String(impId)} stayed off screen`);
}

async function panToTileCenter(page, box, tx, ty) {
  const targetX = tx - 32;
  const targetZ = ty - 32;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  for (let i = 0; i < 240; i += 1) {
    const point = await pagePointForTile(page, box, tx, ty);
    if (point !== null && Math.abs(point.x - cx) <= 16 && Math.abs(point.y - cy) <= 16) {
      return point;
    }
    const pose = await page.evaluate(() => globalThis.__keeper.camera);
    const dx = targetX - pose.targetX;
    const dz = targetZ - pose.targetZ;
    const right = dx * Math.cos(pose.yaw) - dz * Math.sin(pose.yaw);
    const forward = dx * Math.sin(pose.yaw) + dz * Math.cos(pose.yaw);
    const scale = 0.045 * (pose.distance / 40);
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(cx - right / scale, cy + forward / scale);
    await page.mouse.up({ button: "middle" });
    await delay(10);
  }
  throw new Error(`tile ${String(tx)},${String(ty)} never reached screen center`);
}

async function run() {
  const preview = await startPreview();
  try {
    const browser = await chromium.launch({
      channel: "chrome",
      headless: true,
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    });
    try {
      await rm("proof/tmp", { recursive: true, force: true });
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        recordVideo: { dir: "proof/tmp", size: { width: 1280, height: 720 } },
      });
      const page = await context.newPage();
      const recordStart = Date.now();
      await page.goto(`${ORIGIN}/?proof=1`);
      await page.waitForFunction(() => globalThis.__keeper !== undefined);
      const canvas = page.locator("canvas");
      await canvas.waitFor();
      const box = await canvas.boundingBox();
      if (box === null) {
        throw new Error("canvas has no bounding box");
      }
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      const claimedAtStart = await page.evaluate(() => globalThis.__keeper.claimedCount);

      const sweepXs = [35, 36, 37, 38, 39];
      const sweepPts = [];
      for (const tx of sweepXs) {
        const point = await pagePointForTile(page, box, tx, 32);
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
      await stepOnce(page);
      console.log("checkpoint tag", Date.now() - recordStart);
      const taggedAfterSweep = await page.evaluate(() => globalThis.__keeper.taggedCount);
      if (taggedAfterSweep !== 5) {
        throw new Error(`expected 5 tagged tiles after earth sweep, got ${String(taggedAfterSweep)}`);
      }

      const rockPoint = await panToTileCenter(page, box, 1, 32);
      const beforeRock = await page.evaluate(() => globalThis.__keeper.taggedCount);
      await page.mouse.move(rockPoint.x, rockPoint.y);
      await page.mouse.down();
      await page.mouse.up();
      await stepOnce(page);
      const afterRock = await page.evaluate(() => globalThis.__keeper.taggedCount);
      if (afterRock !== beforeRock) {
        throw new Error(`rock click changed tagged count ${String(beforeRock)} -> ${String(afterRock)}`);
      }
      if (afterRock !== 5) {
        throw new Error(`tagged count after rock click was ${String(afterRock)}`);
      }

      console.log("checkpoint rock", Date.now() - recordStart);
      await panToTileCenter(page, box, 31, 30);
      await page.click("#add-gold");
      await stepOnce(page);
      const treasuryXs = [30, 31, 32];
      const treasuryY = 30;
      const treasuryPoints = [];
      for (const tx of treasuryXs) {
        const point = await pagePointForTile(page, box, tx, treasuryY);
        if (point === null) {
          throw new Error(`treasury tile ${String(tx)},${String(treasuryY)} is off screen`);
        }
        treasuryPoints.push(point);
      }
      await page.click("#paint-treasury");
      const paintingOn = await page.evaluate(() => globalThis.__keeper.painting);
      if (!paintingOn) {
        throw new Error("paint treasury tool did not select Painting");
      }
      const treasuryFirst = treasuryPoints[0];
      await page.mouse.move(treasuryFirst.x, treasuryFirst.y);
      await page.mouse.down();
      for (let i = 1; i < treasuryPoints.length; i += 1) {
        const point = treasuryPoints[i];
        await page.mouse.move(point.x, point.y);
      }
      await page.mouse.up();
      await stepOnce(page);
      const treasuryTiles = await page.evaluate(() => globalThis.__keeper.treasuryTiles());
      if (treasuryTiles.length !== 3) {
        throw new Error(`expected 3 treasury tiles after drag, got ${String(treasuryTiles.length)}`);
      }
      for (const tile of treasuryTiles) {
        if (!treasuryXs.includes(tile.x) || tile.y !== treasuryY) {
          throw new Error(`unexpected treasury tile ${String(tile.x)},${String(tile.y)}`);
        }
        if (tile.stock !== 0) {
          throw new Error(`treasury tile ${String(tile.x)},${String(tile.y)} started with stock ${String(tile.stock)}`);
        }
      }
      const spentAfterPaint = await page.evaluate(() => globalThis.__keeper.goldSpent);
      if (spentAfterPaint !== 75) {
        throw new Error(`expected 75 gold spent after painting 3 tiles, got ${String(spentAfterPaint)}`);
      }
      await page.click("#paint-treasury");
      const paintingOff = await page.evaluate(() => globalThis.__keeper.painting);
      if (paintingOff) {
        throw new Error("paint treasury tool stayed selected after toggle");
      }

      console.log("checkpoint paint", Date.now() - recordStart);
      await page.click("#add-gold");
      await stepOnce(page);
      await panToTileCenter(page, box, 31, 31);
      const lairXs = [30, 31, 32];
      const lairY = 31;
      const lairPoints = [];
      for (const tx of lairXs) {
        const point = await pagePointForTile(page, box, tx, lairY);
        if (point === null) {
          throw new Error(`lair tile ${String(tx)},${String(lairY)} is off screen`);
        }
        lairPoints.push(point);
      }
      await page.click("#paint-lair");
      const lairPaintingOn = await page.evaluate(() => globalThis.__keeper.painting);
      if (!lairPaintingOn) {
        throw new Error("paint lair tool did not select Painting");
      }
      const lairFirst = lairPoints[0];
      await page.mouse.move(lairFirst.x, lairFirst.y);
      await page.mouse.down();
      for (let i = 1; i < lairPoints.length; i += 1) {
        const point = lairPoints[i];
        await page.mouse.move(point.x, point.y);
      }
      await page.mouse.up();
      await stepOnce(page);
      const lairTiles = await page.evaluate(() => globalThis.__keeper.lairTileCount);
      if (lairTiles !== 3) {
        throw new Error(`expected 3 lair tiles after drag, got ${String(lairTiles)}`);
      }
      const spentAfterLair = await page.evaluate(() => globalThis.__keeper.goldSpent);
      if (spentAfterLair !== 165) {
        throw new Error(`expected 165 gold spent after treasury and lair, got ${String(spentAfterLair)}`);
      }
      await page.click("#paint-lair");
      const lairPaintingOff = await page.evaluate(() => globalThis.__keeper.painting);
      if (lairPaintingOff) {
        throw new Error("paint lair tool stayed selected after toggle");
      }

      let creatureTicks = 0;
      for (;;) {
        const snapshot = await page.evaluate(() => globalThis.__keeper.creatureSnapshot());
        if (snapshot.some((creature) => creature.state === "sleeping")) {
          break;
        }
        if (creatureTicks >= 600) {
          throw new Error(`creature did not reach a bed after ${String(creatureTicks)} ticks`);
        }
        await stepOnce(page, 12, 20);
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
      await panToTileCenter(page, box, bedCreature.bedTileX, bedCreature.bedTileY);
      await page.screenshot({ path: "proof/lair.png" });
      console.log("checkpoint lair", Date.now() - recordStart);

      await page.click("#save-game");
      const saved = await page.evaluate(() => ({
        hash: globalThis.__keeper.worldHash,
        tick: globalThis.__keeper.tick,
      }));
      await page.click("#add-gold");
      await stepOnce(page, 40, 20);
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
      await page.screenshot({ path: "proof/replay.png" });
      console.log("checkpoint replay", Date.now() - recordStart);

      await panToTileCenter(page, box, 29, 32);

      const { target, point: pickPoint } = await locateHandTarget(page, box);
      const targetJob = target.job;
      if (targetJob === null || targetJob.state !== "reserved") {
        throw new Error(`imp ${String(target.id)} had no reserved job before pickup`);
      }
      await page.mouse.move(pickPoint.x, pickPoint.y);
      await page.mouse.down();
      await page.mouse.up();
      await stepOnce(page);
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
      if (jobAfterPickup === null || jobAfterPickup.state !== "open") {
        throw new Error(
          `job ${String(targetJob.kind)} at ${String(targetJob.tileX)},${String(targetJob.tileY)} was not Open after pickup`,
        );
      }
      const pickupTile = { x: heldImp.tileX, y: heldImp.tileY };
      await page.mouse.move(cx, cy);
      for (let i = 0; i < 6; i += 1) {
        await page.mouse.wheel(0, -240);
      }
      await stepOnce(page, 12, 20);

      const holdStart = Date.now();
      let angle = 0;
      while (Date.now() - holdStart < 70) {
        angle += 0.16;
        await page.mouse.move(
          cx + Math.cos(angle) * box.width * 0.32,
          cy + Math.sin(angle) * box.height * 0.24,
        );
        await stepOnce(page, 1, 25);
      }
      await page.mouse.move(cx + box.width * 0.11, cy - box.height * 0.09);
      await stepOnce(page, 1, 80);
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
      await page.screenshot({ path: "proof/shot.png" });
      console.log("checkpoint shot", Date.now() - recordStart);

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
      const dropPoint = await pagePointForTile(page, box, dropX, dropY);
      if (dropPoint === null) {
        throw new Error(`drop tile ${String(dropX)},${String(dropY)} is off screen`);
      }
      await page.mouse.move(dropPoint.x, dropPoint.y);
      await page.mouse.down({ button: "right" });
      await page.mouse.up({ button: "right" });
      await stepOnce(page);
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

      console.log("checkpoint drop", Date.now() - recordStart);
      const slapTarget = await locateImp(page, box, target.id);
      await page.keyboard.down("Shift");
      await page.mouse.move(slapTarget.point.x, slapTarget.point.y);
      await page.mouse.click(slapTarget.point.x, slapTarget.point.y);
      await page.keyboard.up("Shift");
      await stepOnce(page);
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
      await stepOnce(page, SLAP_TICKS + 2, 20);
      const afterSlapExpiry = await page.evaluate(() => globalThis.__keeper.impSnapshot());
      const expiredImp = afterSlapExpiry.find((imp) => imp.id === boostedId);
      if (expiredImp === undefined || expiredImp.boost !== 0) {
        throw new Error(`imp ${String(boostedId)} boost did not expire after ${String(SLAP_TICKS)} ticks`);
      }
      console.log("checkpoint slap", Date.now() - recordStart);
      await panToTileCenter(page, box, 34.5, 32);
      await page.mouse.move(cx, cy);
      for (let i = 0; i < 6; i += 1) {
        await page.mouse.wheel(0, -240);
      }
      await stepOnce(page, 12, 20);

      await page.mouse.move(cx, cy);
      await page.mouse.down({ button: "right" });
      for (let i = 0; i < 4; i += 1) {
        await page.mouse.move(cx + i * 10, cy + Math.sin(i / 3) * 22);
        await stepOnce(page, 3);
      }
      await page.mouse.up({ button: "right" });
      await panToTileCenter(page, box, 34.5, 32);
      for (let x = 30; x <= 39; x += 1) {
        const point = await pagePointForTile(page, box, x, 32);
        if (point === null) {
          throw new Error(`corridor tile ${String(x)},32 is off screen`);
        }
      }
      await stepOnce(page, 20, 20);

      console.log("checkpoint corridor", Date.now() - recordStart);
      const beforePause = await page.evaluate(() => globalThis.__keeper.tick);
      await page.keyboard.press("Escape");
      await page.waitForSelector("#pause-overlay.visible");
      const spawnDisabled = await page.locator("#spawn-imp").isDisabled();
      const goldDisabled = await page.locator("#add-gold").isDisabled();
      if (!spawnDisabled || !goldDisabled) {
        throw new Error(`panel buttons not disabled while paused: spawn ${String(spawnDisabled)}, gold ${String(goldDisabled)}`);
      }
      for (let i = 0; i < 8; i += 1) {
        await stepOnce(page);
      }
      const duringPause = await page.evaluate(() => globalThis.__keeper.tick);
      if (duringPause !== beforePause) {
        throw new Error(`tick advanced while paused: ${String(beforePause)} -> ${String(duringPause)}`);
      }
      await page.keyboard.press("Escape");
      await page.waitForSelector("#pause-overlay.visible", { state: "hidden" });
      const spawnEnabled = await page.locator("#spawn-imp").isEnabled();
      const goldEnabled = await page.locator("#add-gold").isEnabled();
      if (!spawnEnabled || !goldEnabled) {
        throw new Error(`panel buttons not re-enabled after resume: spawn ${String(spawnEnabled)}, gold ${String(goldEnabled)}`);
      }
      for (let i = 0; i < 8; i += 1) {
        await stepOnce(page);
      }

      console.log("checkpoint pause", Date.now() - recordStart);
      let extraTicks = 0;
      let maxCarrying = 0;
      let carryingSeen = false;
      for (;;) {
        const counts = await page.evaluate(() => ({
          goldStored: globalThis.__keeper.goldStored,
          goldSpent: globalThis.__keeper.goldSpent,
          treasuryTileCount: globalThis.__keeper.treasuryTileCount,
          treasuryStockTotal: globalThis.__keeper.treasuryStockTotal,
          carryingCount: globalThis.__keeper.carryingCount,
          tagged: globalThis.__keeper.taggedCount,
          claimed: globalThis.__keeper.claimedCount,
          lairTileCount: globalThis.__keeper.lairTileCount,
        }));
        if (counts.carryingCount > maxCarrying) {
          maxCarrying = counts.carryingCount;
        }
        if (counts.carryingCount > 0) {
          carryingSeen = true;
        }
        const elapsed = Date.now() - recordStart;
        if (
          counts.treasuryTileCount === 3 &&
          counts.treasuryStockTotal >= 20 &&
          carryingSeen &&
          counts.tagged === 0 &&
          counts.claimed + counts.treasuryTileCount + counts.lairTileCount === claimedAtStart + 5 &&
          elapsed >= 1000
        ) {
          break;
        }
        if (extraTicks >= 4000) {
          throw new Error(
            `gold and treasury proof not complete after ${String(extraTicks)} extra ticks: goldStored ${String(counts.goldStored)}, goldSpent ${String(counts.goldSpent)}, treasuryTiles ${String(counts.treasuryTileCount)}, treasuryStock ${String(counts.treasuryStockTotal)}, maxCarrying ${String(maxCarrying)}, tagged ${String(counts.tagged)}, claimed ${String(counts.claimed)} (start ${String(claimedAtStart)}), elapsed ${String(elapsed)} ms`,
          );
        }
        await stepOnce(page, 16, 1);
        extraTicks += 16;
      }
      console.log("checkpoint wait", Date.now() - recordStart);
      await panToTileCenter(page, box, 31, 30);
      await stepOnce(page);
      const treasuryAfterDelivery = await page.evaluate(() => ({
        tiles: globalThis.__keeper.treasuryTiles(),
        stock: globalThis.__keeper.treasuryStockTotal,
      }));
      if (treasuryAfterDelivery.stock < 20) {
        throw new Error(`treasury stock ended at ${String(treasuryAfterDelivery.stock)}`);
      }
      if (!treasuryAfterDelivery.tiles.some((tile) => tile.stock > 0)) {
        throw new Error("no treasury tile had a gold pile");
      }
      await page.screenshot({ path: "proof/treasury.png" });
      await panToTileCenter(page, box, 34.5, 32);

      console.log("checkpoint treasury", Date.now() - recordStart);
      const beforePanel = await page.evaluate(() => ({
        impCount: globalThis.__keeper.impCount,
        goldStored: globalThis.__keeper.goldStored,
        taggedCount: globalThis.__keeper.taggedCount,
        hudText: globalThis.__keeper.hudText,
        camera: globalThis.__keeper.camera,
      }));
      await page.click("#spawn-imp");
      await page.click("#spawn-imp");
      await page.click("#add-gold");
      await stepOnce(page, 2);
      const afterPanel = await page.evaluate(() => ({
        impCount: globalThis.__keeper.impCount,
        goldStored: globalThis.__keeper.goldStored,
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
      if (
        !afterPanel.hudText.includes(`gold ${String(afterPanel.goldStored)}`) ||
        !afterPanel.hudText.includes(`imps ${String(afterPanel.impCount)}`)
      ) {
        throw new Error(`hud did not show new values: ${afterPanel.hudText}`);
      }
      await stepOnce(page, 4, 20);

      console.log("checkpoint panel", Date.now() - recordStart);
      const targetImps = 200;
      const beforeSpawn = await page.evaluate(() => globalThis.__keeper.impCount);
      const toSpawn = targetImps - beforeSpawn;
      if (toSpawn < 0) {
        throw new Error(`imp count ${String(beforeSpawn)} already above ${String(targetImps)}`);
      }
      if (toSpawn > 0) {
        await page.evaluate((n) => globalThis.__keeper.spawnImps(n), toSpawn);
      }
      await stepOnce(page, 2);
      const spawnedImps = await page.evaluate(() => globalThis.__keeper.impCount);
      if (spawnedImps !== targetImps) {
        throw new Error(`spawnImps ended at ${String(spawnedImps)} imps, expected ${String(targetImps)}`);
      }
      for (let i = 0; i < 4; i += 1) {
        await stepOnce(page, 2, 30);
      }

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

      console.log("checkpoint benchsim", Date.now() - recordStart);
      const frameWarmup = await page.evaluate(() => globalThis.__keeper.benchFrame(5));
      if (frameWarmup.samples.length !== 5) {
        throw new Error(`benchFrame warm-up returned ${String(frameWarmup.samples.length)} samples`);
      }
      const frameSamples = await page.evaluate(() => globalThis.__keeper.benchFrame(30));
      if (frameSamples.samples.length !== 30) {
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
      console.log(
        `perf imps=${String(targetImps)} sim_ms_per_tick median=${ms(simMedian)} p95=${ms(simP95)} max=${ms(simMax)} frame_ms median=${ms(frameMedian)} p95=${ms(frameP95)} max=${ms(frameMax)} drawCalls=${String(perfDrawCalls)}`,
      );

      await stepOnce(page, 2, 30);

      const result = await page.evaluate(() => ({
        tick: globalThis.__keeper.tick,
        hash: globalThis.__keeper.hash,
        taggedCount: globalThis.__keeper.taggedCount,
        dirtCount: globalThis.__keeper.dirtCount,
        claimedCount: globalThis.__keeper.claimedCount,
        goldStored: globalThis.__keeper.goldStored,
        impCount: globalThis.__keeper.impCount,
        carryingCount: globalThis.__keeper.carryingCount,
        creatureCount: globalThis.__keeper.creatureCount,
        lairTileCount: globalThis.__keeper.lairTileCount,
        hudText: globalThis.__keeper.hudText,
        drawCalls: globalThis.__keeper.drawCalls,
        camera: globalThis.__keeper.camera,
      }));
      if (result.tick <= duringPause) {
        throw new Error(`tick did not advance after resume: ${String(duringPause)} -> ${String(result.tick)}`);
      }
      if (result.drawCalls > 8) {
        throw new Error(`tile draw calls ${String(result.drawCalls)} exceed 8`);
      }
      if (result.goldStored < 40) {
        throw new Error(`goldStored ended at ${String(result.goldStored)}`);
      }
      if (result.creatureCount < 1) {
        throw new Error(`creatureCount ended at ${String(result.creatureCount)}`);
      }
      if (result.lairTileCount !== 3) {
        throw new Error(`lairTileCount ended at ${String(result.lairTileCount)}`);
      }
      for (let x = 30; x <= 39; x += 1) {
        const point = await pagePointForTile(page, box, x, 32);
        if (point === null) {
          throw new Error(`corridor tile ${String(x)},32 is off screen at the end`);
        }
      }
      console.log(
        beforePause,
        duringPause,
        result.tick,
        result.hash,
        result.drawCalls,
        result.taggedCount,
        result.dirtCount,
        result.claimedCount,
        result.goldStored,
        maxCarrying,
        result.camera.targetX,
        result.camera.targetZ,
        result.camera.distance,
        result.impCount,
        result.goldStored,
        result.hudText,
      );
      console.log("checkpoint benchframe", Date.now() - recordStart);
      await page.screenshot({ path: "proof/perf.png" });
      await context.close();
      const files = await readdir("proof/tmp");
      const webm = files.find((name) => name.endsWith(".webm"));
      if (webm === undefined) {
        throw new Error("recordVideo did not write a webm");
      }
      await convertWebm(path.join("proof/tmp", webm));
      await rm("proof/tmp", { recursive: true, force: true });
      const duration = await ffprobeDuration();
      if (!(duration >= 10 && duration <= 20)) {
        throw new Error(`play.mp4 duration ${String(duration)} s is outside 10-20 s`);
      }
      console.log("play.mp4 duration", duration, "dirtCount", result.dirtCount, "claimedCount", result.claimedCount);
    } finally {
      await browser.close();
    }
  } finally {
    killProcess(preview);
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

import { spawn } from "node:child_process";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const PORT = Number(process.env.PROOF_PORT ?? "4173");
const ORIGIN = `http://127.0.0.1:${PORT}`;

function medianOf(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  if (count === 0) {
    throw new Error("median requires at least one value");
  }
  const middle = Math.floor(count / 2);
  if (count % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentileOf(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  if (count === 0) {
    throw new Error("percentile requires at least one value");
  }
  if (p <= 0) {
    return sorted[0];
  }
  const rank = Math.ceil((p / 100) * count);
  return sorted[Math.min(rank, count) - 1];
}

function maxOf(values) {
  if (values.length === 0) {
    throw new Error("max requires at least one value");
  }
  let result = values[0];
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] > result) {
      result = values[i];
    }
  }
  return result;
}

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

async function stepOnce(page, n = 1, waitMs = 80) {
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
    await stepOnce(page, 3, 30);
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
    await stepOnce(page);
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
      await stepOnce(page);
      for (let i = 1; i < sweepPts.length; i += 1) {
        const point = sweepPts[i];
        await page.mouse.move(point.x, point.y);
        await stepOnce(page);
      }
      await page.mouse.up();
      await stepOnce(page);
      const taggedAfterSweep = await page.evaluate(() => globalThis.__keeper.taggedCount);
      if (taggedAfterSweep !== 5) {
        throw new Error(`expected 5 tagged tiles after earth sweep, got ${String(taggedAfterSweep)}`);
      }

      const rockPoint = await panToTileCenter(page, box, 1, 32);
      const beforeRock = await page.evaluate(() => globalThis.__keeper.taggedCount);
      await page.mouse.move(rockPoint.x, rockPoint.y);
      await page.mouse.down();
      await stepOnce(page);
      await page.mouse.up();
      await stepOnce(page);
      const afterRock = await page.evaluate(() => globalThis.__keeper.taggedCount);
      if (afterRock !== beforeRock) {
        throw new Error(`rock click changed tagged count ${String(beforeRock)} -> ${String(afterRock)}`);
      }
      if (afterRock !== 5) {
        throw new Error(`tagged count after rock click was ${String(afterRock)}`);
      }

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
        await stepOnce(page, 2, 40);
      }

      const holdStart = Date.now();
      let angle = 0;
      while (Date.now() - holdStart < 3000) {
        angle += 0.16;
        await page.mouse.move(
          cx + Math.cos(angle) * box.width * 0.32,
          cy + Math.sin(angle) * box.height * 0.24,
        );
        await stepOnce(page, 1, 50);
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

      await panToTileCenter(page, box, 34.5, 32);
      await page.mouse.move(cx, cy);
      for (let i = 0; i < 6; i += 1) {
        await page.mouse.wheel(0, -240);
        await stepOnce(page, 2, 40);
      }

      await page.mouse.move(cx, cy);
      await page.mouse.down({ button: "right" });
      for (let i = 0; i < 8; i += 1) {
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
      for (let i = 0; i < 12; i += 1) {
        await stepOnce(page, 5);
      }

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

      let extraTicks = 0;
      let maxCarrying = 0;
      let carryingSeen = false;
      for (;;) {
        const counts = await page.evaluate(() => ({
          goldStored: globalThis.__keeper.goldStored,
          carryingCount: globalThis.__keeper.carryingCount,
          tagged: globalThis.__keeper.taggedCount,
          claimed: globalThis.__keeper.claimedCount,
        }));
        if (counts.carryingCount > maxCarrying) {
          maxCarrying = counts.carryingCount;
        }
        if (counts.carryingCount > 0) {
          carryingSeen = true;
        }
        const elapsed = Date.now() - recordStart;
        if (
          counts.goldStored >= 40 &&
          carryingSeen &&
          counts.tagged === 0 &&
          counts.claimed === claimedAtStart + 5 &&
          elapsed >= 12000
        ) {
          break;
        }
        if (extraTicks >= 4000) {
          throw new Error(
            `gold and claim proof not complete after ${String(extraTicks)} extra ticks: goldStored ${String(counts.goldStored)}, maxCarrying ${String(maxCarrying)}, tagged ${String(counts.tagged)}, claimed ${String(counts.claimed)} (start ${String(claimedAtStart)}), elapsed ${String(elapsed)} ms`,
          );
        }
        await stepOnce(page, 4, 30);
        extraTicks += 4;
      }

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
      for (let i = 0; i < 40; i += 1) {
        await stepOnce(page, 1, 20);
      }

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
      await page.mouse.move(cx, cy);
      for (let i = 0; i < 2; i += 1) {
        await page.mouse.wheel(0, 240);
        await stepOnce(page, 1, 20);
      }
      for (let i = 0; i < 5; i += 1) {
        await stepOnce(page, 2, 30);
      }

      const simWarmup = await page.evaluate(() => globalThis.__keeper.benchSim(5, 20));
      if (simWarmup.length !== 5) {
        throw new Error(`benchSim warm-up returned ${String(simWarmup.length)} samples`);
      }
      const tickBeforeBench = await page.evaluate(() => globalThis.__keeper.tick);
      const simSamples = await page.evaluate(() => globalThis.__keeper.benchSim(30, 20));
      const tickAfterBench = await page.evaluate(() => globalThis.__keeper.tick);
      if (tickAfterBench - tickBeforeBench !== 30 * 20) {
        throw new Error(`benchSim advanced tick by ${String(tickAfterBench - tickBeforeBench)}, expected ${String(30 * 20)}`);
      }
      const impsAfterBench = await page.evaluate(() => globalThis.__keeper.impCount);
      if (impsAfterBench !== targetImps) {
        throw new Error(`benchSim ended at ${String(impsAfterBench)} imps, expected ${String(targetImps)}`);
      }

      const frameWarmup = await page.evaluate(() => globalThis.__keeper.benchFrame(5));
      if (frameWarmup.length !== 5) {
        throw new Error(`benchFrame warm-up returned ${String(frameWarmup.length)} samples`);
      }
      const frameSamples = await page.evaluate(() => globalThis.__keeper.benchFrame(30));
      if (frameSamples.length !== 30) {
        throw new Error(`benchFrame returned ${String(frameSamples.length)} samples`);
      }

      const simMedian = medianOf(simSamples);
      const simP95 = percentileOf(simSamples, 95);
      const simMax = maxOf(simSamples);
      const frameMedian = medianOf(frameSamples);
      const frameP95 = percentileOf(frameSamples, 95);
      const frameMax = maxOf(frameSamples);
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

      for (let i = 0; i < 3; i += 1) {
        await stepOnce(page, 2, 30);
      }

      const result = await page.evaluate(() => ({
        tick: globalThis.__keeper.tick,
        hash: globalThis.__keeper.hash,
        taggedCount: globalThis.__keeper.taggedCount,
        dirtCount: globalThis.__keeper.dirtCount,
        claimedCount: globalThis.__keeper.claimedCount,
        goldStored: globalThis.__keeper.goldStored,
        impCount: globalThis.__keeper.impCount,
        carryingCount: globalThis.__keeper.carryingCount,
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

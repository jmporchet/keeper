import { spawn } from "node:child_process";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const PORT = 4173;
const ORIGIN = `http://127.0.0.1:${PORT}`;

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

async function stepOnce(page) {
  await page.evaluate(() => {
    globalThis.__keeper.step(1);
  });
  await delay(80);
}

async function pagePointForTile(page, box, tx, ty) {
  const local = await page.evaluate(({ x, y }) => globalThis.__keeper.canvasPointForTile(x, y), { x: tx, y: ty });
  if (local === null) {
    return null;
  }
  return { x: box.x + local.x, y: box.y + local.y };
}

async function panUntilTileVisible(page, box, tx, ty) {
  for (let i = 0; i < 80; i += 1) {
    const point = await pagePointForTile(page, box, tx, ty);
    if (point !== null) {
      return point;
    }
    await page.keyboard.down("KeyA");
    await stepOnce(page);
  }
  await page.keyboard.up("KeyA");
  throw new Error(`tile ${String(tx)},${String(ty)} stayed off screen`);
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

      const sweepXs = [24, 25, 26, 27, 28];
      const sweepPts = [];
      for (const tx of sweepXs) {
        const point = await pagePointForTile(page, box, tx, 32);
        if (point === null) {
          throw new Error(`earth tile ${String(tx)},32 is off screen`);
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

      await page.mouse.down({ button: "right" });
      for (let i = 0; i < 10; i += 1) {
        await page.mouse.move(cx + i * 12, cy + Math.sin(i / 5) * 45);
        await stepOnce(page);
      }
      await page.mouse.up({ button: "right" });

      await page.keyboard.down("KeyW");
      for (let i = 0; i < 8; i += 1) {
        await stepOnce(page);
      }
      await page.keyboard.down("KeyD");
      for (let i = 0; i < 6; i += 1) {
        await stepOnce(page);
      }
      await page.keyboard.up("KeyW");
      await page.keyboard.up("KeyD");
      await page.keyboard.down("KeyA");
      for (let i = 0; i < 6; i += 1) {
        await stepOnce(page);
      }
      await page.keyboard.up("KeyA");

      await page.mouse.move(cx, cy);
      for (let i = 0; i < 4; i += 1) {
        await page.mouse.wheel(0, -140);
        await stepOnce(page);
      }
      for (let i = 0; i < 4; i += 1) {
        await page.mouse.wheel(0, 180);
        await stepOnce(page);
      }

      await page.mouse.move(cx, cy);
      await page.mouse.down({ button: "middle" });
      for (let i = 0; i < 8; i += 1) {
        await page.mouse.move(cx - i * 14, cy + i * 7);
        await stepOnce(page);
      }
      await page.mouse.up({ button: "middle" });

      const rockPoint = await panUntilTileVisible(page, box, 1, 32);
      await page.keyboard.up("KeyA");
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

      const beforePause = await page.evaluate(() => globalThis.__keeper.tick);
      await page.keyboard.press("Escape");
      await page.waitForSelector("#pause-overlay.visible");
      for (let i = 0; i < 8; i += 1) {
        await stepOnce(page);
      }
      const duringPause = await page.evaluate(() => globalThis.__keeper.tick);
      if (duringPause !== beforePause) {
        throw new Error(`tick advanced while paused: ${String(beforePause)} -> ${String(duringPause)}`);
      }
      await page.keyboard.press("Escape");
      await page.waitForSelector("#pause-overlay.visible", { state: "hidden" });
      for (let i = 0; i < 8; i += 1) {
        await stepOnce(page);
      }

      const result = await page.evaluate(() => ({
        tick: globalThis.__keeper.tick,
        hash: globalThis.__keeper.hash,
        taggedCount: globalThis.__keeper.taggedCount,
        drawCalls: globalThis.__keeper.drawCalls,
        camera: globalThis.__keeper.camera,
      }));
      if (result.tick <= duringPause) {
        throw new Error(`tick did not advance after resume: ${String(duringPause)} -> ${String(result.tick)}`);
      }
      if (result.drawCalls > 8) {
        throw new Error(`tile draw calls ${String(result.drawCalls)} exceed 8`);
      }
      if (result.taggedCount !== 5) {
        throw new Error(`tagged count ended at ${String(result.taggedCount)}`);
      }
      console.log(
        beforePause,
        duringPause,
        result.tick,
        result.hash,
        result.drawCalls,
        result.taggedCount,
        result.camera.targetX,
        result.camera.targetZ,
        result.camera.distance,
      );
      const hold = 12000 - (Date.now() - recordStart);
      if (hold > 0) {
        await delay(hold);
      }
      await page.screenshot({ path: "proof/shot.png" });
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
      console.log("play.mp4 duration", duration);
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

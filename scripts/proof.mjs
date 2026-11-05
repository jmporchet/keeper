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
      await page.goto(`${ORIGIN}/?proof=1`);
      await page.waitForFunction(() => globalThis.__keeper !== undefined);
      const runUntil = Date.now() + 5000;
      while (Date.now() < runUntil) {
        await page.evaluate(() => {
          globalThis.__keeper.step(1);
        });
        await delay(50);
      }
      const beforePause = await page.evaluate(() => globalThis.__keeper.tick);
      await page.keyboard.press("Escape");
      await page.waitForSelector("#pause-overlay.visible");
      const pausedUntil = Date.now() + 5000;
      while (Date.now() < pausedUntil) {
        await page.evaluate(() => {
          globalThis.__keeper.step(1);
        });
        await delay(50);
      }
      const duringPause = await page.evaluate(() => globalThis.__keeper.tick);
      if (duringPause !== beforePause) {
        throw new Error(`tick advanced while paused: ${String(beforePause)} -> ${String(duringPause)}`);
      }
      await page.keyboard.press("Escape");
      await page.waitForSelector("#pause-overlay.visible", { state: "hidden" });
      const resumeUntil = Date.now() + 5000;
      while (Date.now() < resumeUntil) {
        await page.evaluate(() => {
          globalThis.__keeper.step(1);
        });
        await delay(50);
      }
      const result = await page.evaluate(() => ({
        tick: globalThis.__keeper.tick,
        hash: globalThis.__keeper.hash,
        drawCalls: globalThis.__keeper.drawCalls,
      }));
      if (result.tick <= duringPause) {
        throw new Error(`tick did not advance after resume: ${String(duringPause)} -> ${String(result.tick)}`);
      }
      if (result.drawCalls > 8) {
        throw new Error(`tile draw calls ${String(result.drawCalls)} exceed 8`);
      }
      console.log(beforePause, duringPause, result.tick, result.hash, result.drawCalls);
      await page.screenshot({ path: "proof/shot.png" });
      await context.close();
      const files = await readdir("proof/tmp");
      const webm = files.find((name) => name.endsWith(".webm"));
      if (webm === undefined) {
        throw new Error("recordVideo did not write a webm");
      }
      await convertWebm(path.join("proof/tmp", webm));
      await rm("proof/tmp", { recursive: true, force: true });
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

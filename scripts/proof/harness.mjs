import { spawn } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const PORT = Number(process.env.PROOF_PORT ?? "4173");
const ORIGIN = `http://127.0.0.1:${PORT}`;
const VIEWPORT = { width: 1280, height: 720 };
const SLAP_TICKS = 60;

export function ms(value) {
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

export function killProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill("SIGTERM");
}

export function startPreview() {
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

export function launchBrowser() {
  return chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
}

export async function prepareTmp() {
  await rm("proof/tmp", { recursive: true, force: true });
  await mkdir("proof/tmp", { recursive: true });
}

export function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("/usr/bin/ffmpeg", args, { stdio: "inherit" });
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

export function ffprobeDuration(file) {
  return new Promise((resolve, reject) => {
    let out = "";
    const probe = spawn("/usr/bin/ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
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

async function stepOnce(page, n = 1, waitMs = 30) {
  await page.evaluate((count) => {
    globalThis.__keeper.step(count);
  }, n);
  await delay(waitMs);
}

async function stepFrames(page, frames, ticksPerFrame, waitMs) {
  for (let i = 0; i < frames; i += 1) {
    await stepOnce(page, ticksPerFrame, waitMs);
  }
}

async function presentFrame(page) {
  await page.evaluate(() => new Promise((resolve) => {
    globalThis.requestAnimationFrame(() => {
      globalThis.requestAnimationFrame(() => resolve());
    });
  }));
}

async function pagePointForTile(page, box, tx, ty) {
  const local = await page.evaluate(({ x, y }) => globalThis.__keeper.canvasPointForTile(x, y), { x: tx, y: ty });
  if (local === null) {
    return null;
  }
  return { x: box.x + local.x, y: box.y + local.y };
}

async function setVisibility(page, hidden) {
  await page.evaluate((isHidden) => {
    Object.defineProperty(globalThis.document, "hidden", { configurable: true, get: () => isHidden });
    Object.defineProperty(globalThis.document, "visibilityState", {
      configurable: true,
      get: () => (isHidden ? "hidden" : "visible"),
    });
    globalThis.document.dispatchEvent(new globalThis.Event("visibilitychange"));
  }, hidden);
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
    await delay(1);
  }
  throw new Error(`tile ${String(tx)},${String(ty)} never reached screen center`);
}

async function findTaggableRow(page, box, length) {
  for (let y = 28; y <= 34; y += 1) {
    for (let x = 27; x + length - 1 <= 37; x += 1) {
      const kinds = await page.evaluate(
        ({ rowX, rowY, count }) => {
          const result = [];
          for (let i = 0; i < count; i += 1) {
            result.push(globalThis.__keeper.tileKind(rowX + i, rowY));
          }
          return result;
        },
        { rowX: x, rowY: y, count: length },
      );
      if (!kinds.every((kind) => kind === "earth" || kind === "goldSeam")) {
        continue;
      }
      const points = [];
      let onScreen = true;
      for (let i = 0; i < length; i += 1) {
        const point = await pagePointForTile(page, box, x + i, y);
        if (point === null) {
          onScreen = false;
          break;
        }
        points.push(point);
      }
      if (onScreen) {
        return { x, y, points };
      }
    }
  }
  throw new Error(`no taggable on-screen row of ${String(length)} tiles found`);
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
    await stepOnce(page, 3, 1);
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

export async function createScenarioContext(browser, name) {
  const dir = path.join("proof/tmp", name);
  await mkdir(dir, { recursive: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir, size: VIEWPORT },
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

  const ctx = {
    name,
    context,
    page,
    box,
    cx,
    cy,
    recordStart,
    clipStartMs: undefined,
    clipEndMs: undefined,
    clipStart() {
      if (this.clipStartMs !== undefined) {
        throw new Error(`scenario ${name} already marked a clip start`);
      }
      this.clipStartMs = Date.now() - this.recordStart;
      console.log(`clip start ${name} at ${String(this.clipStartMs)} ms`);
    },
    clipEnd() {
      if (this.clipStartMs === undefined) {
        throw new Error(`scenario ${name} marked a clip end before a clip start`);
      }
      if (this.clipEndMs !== undefined) {
        throw new Error(`scenario ${name} already marked a clip end`);
      }
      this.clipEndMs = Date.now() - this.recordStart;
      console.log(`clip end ${name} at ${String(this.clipEndMs)} ms`);
    },
    async checkpoint(label) {
      const tick = await page.evaluate(() => globalThis.__keeper.tick);
      console.log(`checkpoint ${label} elapsed=${String(Date.now() - this.recordStart)} tick=${String(tick)}`);
    },
    async screenshot(target, label) {
      const start = Date.now();
      await page.screenshot({ path: target, timeout: 120000 });
      console.log(`screenshot ${label} ms=${String(Date.now() - start)}`);
    },
    async printFinal() {
      const result = await page.evaluate(() => ({
        tick: globalThis.__keeper.tick,
        hash: globalThis.__keeper.worldHash,
      }));
      console.log(`scenario ${name} final tick=${String(result.tick)} hash=${String(result.hash)}`);
    },
    stepOnce(n = 1, waitMs = 30) {
      return stepOnce(page, n, waitMs);
    },
    stepFrames(frames, ticksPerFrame, waitMs) {
      return stepFrames(page, frames, ticksPerFrame, waitMs);
    },
    presentFrame() {
      return presentFrame(page);
    },
    pagePointForTile(tx, ty) {
      return pagePointForTile(page, box, tx, ty);
    },
    panToTileCenter(tx, ty) {
      return panToTileCenter(page, box, tx, ty);
    },
    findTaggableRow(length) {
      return findTaggableRow(page, box, length);
    },
    findHandTarget() {
      return findHandTarget(page);
    },
    locateHandTarget() {
      return locateHandTarget(page, box);
    },
    locateImp(impId) {
      return locateImp(page, box, impId);
    },
    setVisibility(hidden) {
      return setVisibility(page, hidden);
    },
    slapTicks() {
      return SLAP_TICKS;
    },
  };
  return ctx;
}

export async function closeScenarioContext(ctx) {
  if (ctx.clipStartMs === undefined || ctx.clipEndMs === undefined) {
    throw new Error(`scenario ${ctx.name} did not mark a clip window`);
  }
  const windowMs = ctx.clipEndMs - ctx.clipStartMs;
  if (windowMs < 1000) {
    throw new Error(`scenario ${ctx.name} clip window ${String(windowMs)} ms is under 1000 ms`);
  }
  await delay(300);
  await ctx.context.close();
  const dir = path.join("proof/tmp", ctx.name);
  const files = await readdir(dir);
  const webm = files.find((file) => file.endsWith(".webm"));
  if (webm === undefined) {
    throw new Error(`recordVideo did not write a webm for ${ctx.name}`);
  }
  return {
    name: ctx.name,
    webm: path.join(dir, webm),
    clipStartMs: ctx.clipStartMs,
    clipEndMs: ctx.clipEndMs,
    windowMs,
  };
}

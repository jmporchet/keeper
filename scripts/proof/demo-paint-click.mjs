import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildConcatArgs, buildConcatList, buildCutArgs, MIN_TOTAL_MS, MAX_TOTAL_MS } from "./reel.mjs";
import {
  closeScenarioContext,
  createScenarioContext,
  ffprobeDuration,
  killProcess,
  launchBrowser,
  prepareTmp,
  runFfmpeg,
  startPreview,
} from "./harness.mjs";
import * as paintClick from "./scenarios/paintClick.mjs";

const TAIL_MS = 120;

async function main() {
  await prepareTmp();
  const preview = await startPreview();
  let browser;
  try {
    browser = await launchBrowser();
    const ctx = await createScenarioContext(browser, paintClick.name);
    await paintClick.run(ctx);
    await ctx.printFinal();
    const clip = await closeScenarioContext(ctx);
    if (clip.windowMs < MIN_TOTAL_MS || clip.windowMs > MAX_TOTAL_MS) {
      throw new Error(`paintClick clip window ${String(clip.windowMs)} ms is outside 10-20 s`);
    }
    const cutDir = path.join("proof/tmp", "cut");
    await mkdir(cutDir, { recursive: true });
    const cutFile = path.join(cutDir, "paintClick.mp4");
    const webmDurationMs = (await ffprobeDuration(clip.webm)) * 1000;
    const requestedEndMs = clip.clipStartMs + clip.windowMs + TAIL_MS;
    const endMs = Math.min(requestedEndMs, webmDurationMs - 50);
    const startMs = Math.max(0, clip.clipStartMs);
    if (endMs <= startMs) {
      throw new Error(`paintClick has no footage between ${String(startMs)} and ${String(endMs)} ms`);
    }
    await runFfmpeg(
      buildCutArgs({
        input: clip.webm,
        output: cutFile,
        startMs,
        endMs,
      }),
    );
    const listPath = path.join("proof/tmp", "concat.txt");
    await writeFile(listPath, buildConcatList([{ file: path.resolve(cutFile) }]));
    const output = path.resolve("proof/play.mp4");
    await runFfmpeg(buildConcatArgs({ listPath: path.resolve(listPath), output }));
    const duration = await ffprobeDuration(output);
    if (!(duration >= MIN_TOTAL_MS / 1000 && duration <= MAX_TOTAL_MS / 1000)) {
      throw new Error(`demo reel duration ${String(duration)} s is outside 10-20 s`);
    }
    console.log(`demo reel ${output} duration ${String(duration)} s window=${String(clip.windowMs)} ms`);
    if (process.env.PROOF_KEEP_TMP === undefined) {
      await rm("proof/tmp", { recursive: true, force: true });
    }
  } finally {
    if (browser !== undefined) {
      await browser.close();
    }
    killProcess(preview);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

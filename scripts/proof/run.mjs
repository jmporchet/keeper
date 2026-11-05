import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  allocateWindows,
  buildConcatArgs,
  buildConcatList,
  buildCutArgs,
  DEFAULT_TARGET_MS,
  MAX_TOTAL_MS,
  MIN_TOTAL_MS,
} from "./reel.mjs";
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
import { scenarios } from "./scenarios/index.mjs";

const TAIL_MS = 120;

function parseOnly(argv) {
  let only;
  for (const arg of argv) {
    if (!arg.startsWith("--only=")) {
      throw new Error(`unknown argument ${arg}`);
    }
    if (only !== undefined) {
      throw new Error("--only may be passed once");
    }
    const names = arg.slice("--only=".length).split(",").map((name) => name.trim()).filter((name) => name.length > 0);
    if (names.length === 0) {
      throw new Error("--only needs at least one scenario name");
    }
    only = names;
  }
  return only;
}

function selectScenarios(only) {
  if (only === undefined) {
    return scenarios;
  }
  const known = new Set(scenarios.map((scenario) => scenario.name));
  for (const name of only) {
    if (!known.has(name)) {
      throw new Error(`unknown scenario ${name}`);
    }
  }
  const wanted = new Set(only);
  return scenarios.filter((scenario) => wanted.has(scenario.name));
}

async function cutClip(clip, allocation, output) {
  const webmDurationMs = (await ffprobeDuration(clip.webm)) * 1000;
  const requestedEndMs = clip.clipStartMs + allocation.sourceEndMs + TAIL_MS;
  const endMs = Math.min(requestedEndMs, webmDurationMs - 50);
  const startMs = Math.max(0, endMs - allocation.outputMs);
  if (endMs <= startMs) {
    throw new Error(`clip ${clip.name} has no footage between ${String(startMs)} and ${String(endMs)} ms`);
  }
  const args = buildCutArgs({
    input: clip.webm,
    output,
    startMs,
    endMs,
  });
  console.log(
    `cut ${clip.name} source=${startMs.toFixed(0)}-${endMs.toFixed(0)} ms output=${allocation.outputMs} ms`,
  );
  await runFfmpeg(args);
}

async function assembleReel(clips, output, fullRun) {
  const cutDir = path.join("proof/tmp", "cut");
  await mkdir(cutDir, { recursive: true });
  let allocations;
  if (fullRun) {
    allocations = allocateWindows(
      clips.map((clip) => ({ name: clip.name, windowMs: clip.windowMs })),
      { targetMs: DEFAULT_TARGET_MS },
    );
  } else {
    allocations = clips.map((clip) => ({
      name: clip.name,
      sourceStartMs: 0,
      sourceEndMs: clip.windowMs,
      outputMs: clip.windowMs,
    }));
  }
  const cutFiles = [];
  for (let i = 0; i < clips.length; i += 1) {
    const clip = clips[i];
    const allocation = allocations[i];
    const cutFile = path.join(cutDir, `${clip.name}.mp4`);
    await cutClip(clip, allocation, cutFile);
    cutFiles.push({ file: path.resolve(cutFile) });
  }
  const listPath = path.join("proof/tmp", "concat.txt");
  await writeFile(listPath, buildConcatList(cutFiles));
  await runFfmpeg(buildConcatArgs({ listPath: path.resolve(listPath), output: path.resolve(output) }));
  const duration = await ffprobeDuration(output);
  if (fullRun && !(duration >= MIN_TOTAL_MS / 1000 && duration <= MAX_TOTAL_MS / 1000)) {
    throw new Error(`reel duration ${String(duration)} s is outside 10-20 s`);
  }
  console.log(`reel ${output} duration ${String(duration)} s`);
  return duration;
}

async function run() {
  const startedAt = Date.now();
  const only = parseOnly(process.argv.slice(2));
  const selected = selectScenarios(only);
  const fullRun = only === undefined;
  const output = fullRun ? "proof/play.mp4" : `proof/play-${selected.map((scenario) => scenario.name).join("-")}.mp4`;
  await prepareTmp();
  await rm("proof/debug.png", { force: true });
  const preview = await startPreview();
  let browser;
  try {
    browser = await launchBrowser();
    const clips = [];
    for (const scenario of selected) {
      console.log(`scenario ${scenario.name} start`);
      const ctx = await createScenarioContext(browser, scenario.name);
      let scenarioError;
      try {
        await scenario.run(ctx);
        await ctx.printFinal();
        const drawCalls = await ctx.page.evaluate(() => globalThis.__keeper.drawCalls);
        if (drawCalls > 7) {
          throw new Error(`scenario ${scenario.name} draw calls ${String(drawCalls)} exceed 7`);
        }
        console.log(`scenario ${scenario.name} drawCalls ${String(drawCalls)}`);
      } catch (error) {
        scenarioError = error;
      }
      let clip;
      if (ctx.clipStartMs !== undefined && ctx.clipEndMs !== undefined) {
        clip = await closeScenarioContext(ctx);
        clips.push(clip);
      } else {
        await ctx.context.close();
      }
      if (scenarioError !== undefined) {
        throw scenarioError;
      }
      console.log(`scenario ${scenario.name} clip ${String(clip.windowMs)} ms`);
    }
    await assembleReel(clips, output, fullRun);
    if (process.env.PROOF_KEEP_TMP === undefined) {
      await rm("proof/tmp", { recursive: true, force: true });
    }
    console.log(`proof wall time ${((Date.now() - startedAt) / 1000).toFixed(2)} s`);
  } finally {
    if (browser !== undefined) {
      await browser.close();
    }
    killProcess(preview);
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

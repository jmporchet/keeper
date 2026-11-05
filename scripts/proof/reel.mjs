export const MIN_CLIP_MS = 1000;
export const MIN_TOTAL_MS = 10000;
export const MAX_TOTAL_MS = 20000;
export const DEFAULT_TARGET_MS = 13000;
export const OUTPUT_WIDTH = 1280;
export const OUTPUT_HEIGHT = 720;
export const OUTPUT_FPS = 25;

function sum(values) {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total;
}

function seconds(valueMs) {
  return (valueMs / 1000).toFixed(3);
}

export function allocateWindows(clips, options = {}) {
  if (!Array.isArray(clips) || clips.length === 0) {
    throw new Error("proof reel needs at least one clip");
  }
  const targetMs = options.targetMs === undefined ? DEFAULT_TARGET_MS : options.targetMs;
  if (!Number.isFinite(targetMs)) {
    throw new Error("proof reel target must be finite");
  }
  const windows = [];
  for (const clip of clips) {
    if (typeof clip.name !== "string" || clip.name.length === 0) {
      throw new Error("proof clip needs a name");
    }
    if (!Number.isFinite(clip.windowMs) || clip.windowMs < MIN_CLIP_MS) {
      throw new Error(
        `proof clip ${clip.name} window ${String(clip.windowMs)} ms is under ${String(MIN_CLIP_MS)} ms`,
      );
    }
    windows.push(clip.windowMs);
  }
  const totalMs = sum(windows);
  if (totalMs < MIN_TOTAL_MS) {
    throw new Error(`proof footage ${String(totalMs)} ms is under ${String(MIN_TOTAL_MS)} ms`);
  }
  const minimumMs = clips.length * MIN_CLIP_MS;
  if (minimumMs > MAX_TOTAL_MS) {
    throw new Error(`proof reel cannot fit ${String(clips.length)} clips in ${String(MAX_TOTAL_MS)} ms`);
  }
  const desiredMs = Math.min(MAX_TOTAL_MS, Math.max(MIN_TOTAL_MS, Math.max(targetMs, minimumMs)));
  const configuredMaxShare = options.maxShareMs === undefined ? 2000 : options.maxShareMs;
  if (!Number.isFinite(configuredMaxShare)) {
    throw new Error("proof reel max share must be finite");
  }
  const maxShareMs = Math.max(MIN_CLIP_MS, configuredMaxShare, desiredMs / clips.length);
  let outputs = windows.slice();
  if (totalMs > desiredMs) {
    outputs = windows.map((windowMs) => Math.min(windowMs, maxShareMs));
    let current = sum(outputs);
    if (current > desiredMs) {
      while (current > desiredMs + 1e-6) {
        const excess = current - desiredMs;
        const reducible = outputs.map((value) => Math.max(0, value - MIN_CLIP_MS));
        const reducibleTotal = sum(reducible);
        if (reducibleTotal <= 1e-6) {
          break;
        }
        outputs = outputs.map((value, index) => {
          const next = value - excess * (reducible[index] / reducibleTotal);
          return Math.max(MIN_CLIP_MS, Math.min(windows[index], maxShareMs, next));
        });
        current = sum(outputs);
      }
    } else if (current < desiredMs) {
      let deficit = desiredMs - current;
      while (deficit > 0) {
        let added = false;
        for (let index = 0; index < outputs.length && deficit > 0; index += 1) {
          const room = Math.min(windows[index], maxShareMs) - outputs[index];
          if (room <= 0) {
            continue;
          }
          const add = Math.min(room, deficit);
          outputs[index] += add;
          deficit -= add;
          added = true;
        }
        if (!added) {
          break;
        }
      }
    }
  }
  const targeted = totalMs > desiredMs;
  const rounded = outputs.map((value, index) =>
    Math.min(windows[index], Math.max(MIN_CLIP_MS, Math.round(value))),
  );
  let finalTotal = sum(rounded);
  if (targeted && finalTotal > desiredMs) {
    let excess = finalTotal - desiredMs;
    while (excess > 0) {
      let reduced = false;
      for (let index = 0; index < rounded.length && excess > 0; index += 1) {
        const room = rounded[index] - MIN_CLIP_MS;
        if (room <= 0) {
          continue;
        }
        const take = Math.min(room, excess);
        rounded[index] -= take;
        excess -= take;
        reduced = true;
      }
      if (!reduced) {
        break;
      }
    }
    finalTotal = sum(rounded);
  }
  if (targeted && finalTotal < desiredMs) {
    let deficit = desiredMs - finalTotal;
    while (deficit > 0) {
      let added = false;
      for (let index = 0; index < rounded.length && deficit > 0; index += 1) {
        const room = Math.min(windows[index], maxShareMs) - rounded[index];
        if (room <= 0) {
          continue;
        }
        const add = Math.min(room, deficit);
        rounded[index] += add;
        deficit -= add;
        added = true;
      }
      if (!added) {
        break;
      }
    }
    finalTotal = sum(rounded);
  }
  if (finalTotal < MIN_TOTAL_MS || finalTotal > MAX_TOTAL_MS) {
    throw new Error(
      `proof reel ${String(finalTotal)} ms is outside ${String(MIN_TOTAL_MS)}-${String(MAX_TOTAL_MS)} ms`,
    );
  }
  return clips.map((clip, index) => {
    const outputMs = rounded[index];
    return {
      name: clip.name,
      sourceStartMs: clip.windowMs - outputMs,
      sourceEndMs: clip.windowMs,
      outputMs,
    };
  });
}

export function buildCutArgs({ input, output, startMs, endMs }) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new Error("proof cut window is invalid");
  }
  return [
    "-y",
    "-i",
    input,
    "-ss",
    seconds(startMs),
    "-to",
    seconds(endMs),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(OUTPUT_FPS),
    "-s",
    `${String(OUTPUT_WIDTH)}x${String(OUTPUT_HEIGHT)}`,
    "-an",
    output,
  ];
}

export function buildConcatArgs({ listPath, output }) {
  return [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(OUTPUT_FPS),
    "-s",
    `${String(OUTPUT_WIDTH)}x${String(OUTPUT_HEIGHT)}`,
    "-movflags",
    "+faststart",
    "-an",
    output,
  ];
}

export function buildConcatList(entries) {
  const lines = [];
  for (const entry of entries) {
    lines.push(`file '${entry.file.replaceAll("'", "'\\''")}'`);
  }
  return `${lines.join("\n")}\n`;
}

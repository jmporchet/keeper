# Guidelines

Rules for every change, human or agent. Each rule says what to do. Sources are at the end.

## 1. Model the domain

- **Every stateful thing is a state machine.** Imps, tiles, jobs, app flow, input and camera modes. No pair of booleans that must stay in sync. A new behaviour adds a state or a transition, not an `if` in a caller.
- **Make illegal states unrepresentable.** Discriminated unions with per-state data (`{ kind: "walking", jobId, path }`), not optional fields. Branded ids (`TileIndex`, `ImpId`, `JobId`, `Tick`). Exhaustive `switch` ending in a `never` check.
- **Two kinds of chart.** Sim entities use hand-rolled typed machines run in the fixed-step loop. App flow, input and camera use XState v5. See [design.md](design.md#statechart-library-decision).
- **Every chart is drawn.** Each chart has a Mermaid `stateDiagram-v2` in `docs/design.md`, updated in the same PR as the code.
- **Risky charts are checked.** Job reservation, Hand of Evil pick-up and drop, and pause or context loss get a TLA+ spec under `specs/`, checked with the pstack `statechart` skill. Each invariant is a sentence the player would agree with ("one imp per job"). When TLC finds a bug path, replay it as a test against the real code before fixing.

## 2. Keep the sim pure and deterministic

- `src/sim/` imports nothing from the DOM, `three` or XState. Lint enforces it.
- Fixed step of 1/20 s. The render loop uses an accumulator, clamps frame delta to 100 ms and runs at most 4 sim steps per frame.
- One seeded PRNG inside the sim state. No `Math.random`, `Date.now` or `performance.now` in `src/sim/`.
- The only way to change the sim is a typed command with a tick. A run is a seed plus a command log, so every bug report can be a replay.
- Iterate in a stable order (by index, never by `Map` insertion of objects from the DOM).

## 3. Keep the hot path allocation-free

- Code that runs every tick or every frame lives in `*.hot.ts`. Lint bans object and array literals, closures, `new`, spread and string building in those files. The loop makes no garbage, so the GC does not stutter.
- Tiles live in typed arrays. Agents and jobs live in preallocated pools with free lists, referenced by index.
- Render with `InstancedMesh`, one per visual kind. A removed block gets scale 0 so its instance index stays its tile index.
- Budgets: 60 fps with 200 imps on a mid-range laptop; first-load JS under 300 KB gzipped (sum of gzip sizes of JS files statically referenced from `dist/index.html`, measured with Node `zlib` gzip level 9 after `vite build`). The build fails above that budget.

## 4. Turn every lesson into structure

- When review or a bug finds a mistake, add a lint rule, a type or a test that makes it impossible, in the same PR. Do not add a sentence to this file when a rule can enforce it.
- **No comments.** A lint rule bans them. If code needs explaining, rename it or write a test.
- No `any`, no non-null `!`, no `as` casts outside parse functions at boundaries.

## 5. Tests that show behaviour

- **Expect (snapshot) tests** print readable state: the tile grid as ASCII, an imp's state per tick, the job board. The diff in review shows how behaviour changed, not only that it did.
- **Property tests** (fast-check) for invariants: determinism (same seed and commands give the same state hash), conservation of gold, claimed floor stays connected to the heart, no job reserved twice, camera target stays on the map.
- **Headless bots** play the sandbox for N ticks from a seed and assert invariants every tick. This is the deterministic simulation test.
- Assert what the player can observe. Do not test private helpers.
- Never delete or weaken a test to make a PR green. Fix the code or explain in the PR why the test was wrong.

## 6. PR proof

Every PR proves itself. A green build alone is not proof.

1. `npm run build` passes, then `npm test` and `npm run lint`.
2. `npm run proof` serves the built `dist/`, opens it in headless Chromium with Playwright on the shared box, runs the named scenarios in `scripts/proof/scenarios/` in registry order, and writes the stills and `proof/play.mp4`.
   - Scenarios: `digClaim`, `hand`, `pause`, `treasury`, `lair`, `hatchery`, `saveReplay`, `possess`, `panelPerf`.
   - Stills: `proof/shot.png`, `proof/treasury.png`, `proof/lair.png`, `proof/hatchery.png`, `proof/replay.png`, `proof/possess.png`, `proof/perf.png`.
   - Each scenario records its own clip in a fresh browser context and marks the window worth showing. The reel cuts each clip window, re-encodes it with `libx264`/`yuv420p` at 1280x720 25 fps, and concatenates the clips in registry order into `proof/play.mp4` with `-movflags +faststart`. The reel is **10 to 20 seconds** (target 13). The run fails outside that bound or if a scenario clip window is under 1 second.
   - `node scripts/proof/run.mjs --only=treasury,lair` runs a subset and writes `proof/play-<names>.mp4`; the reel duration guard applies only to a full run.
3. Every feature PR attaches `proof/shot.png` and `proof/play.mp4` to the PR description. A docs-only or tooling-only PR says "no gameplay change" instead of the video.
4. The scenario drives the real user path (mouse and keyboard events on the canvas), not internal setters. It also prints the sim tick and a state hash so the reviewer sees the result as text.
5. The proof scripts live in the repo and the reviewer can rerun them. Add a scenario by adding a file to `scripts/proof/scenarios/` that exports `{ name, run(ctx) }` and listing it in `scripts/proof/scenarios/index.mjs` in reel order.

Box status, checked 2026-11-04:

- Google Chrome 156 at `/usr/bin/google-chrome`. Launch Playwright with `channel: "chrome"`. The Playwright-bundled Chromium is not downloaded.
- System `ffmpeg` at `/usr/bin/ffmpeg` for the WebM to MP4 step.
- The `playwright` npm package is not installed globally. Install it as a dev dependency in the repo. `recordVideo` needs Playwright's own ffmpeg build. It was missing at first and is now installed at `~/.cache/ms-playwright/ffmpeg-1013` (`npx playwright install ffmpeg`).
- No GPU. WebGL runs through SwiftShader (`--use-angle=swiftshader --enable-unsafe-swiftshader`). The three.js keyframes example rendered at about 4 fps. A test recording (screenshot plus a 9.5 s MP4) worked end to end.
- Because software rendering is slow, the proof build exposes a test hook in proof mode only (`?proof=1`): the sim runs on its fixed tick and the renderer draws every tick, so a slow frame rate makes the video choppy but never changes what happens. If `recordVideo` output is too choppy to read, the proof script falls back to stepping N ticks, screenshotting each one and joining the frames with ffmpeg at 20 fps.

## 7. Small PRs, one feature each

- One backlog item per PR, in backlog order. Each PR ends in its acceptance check.
- The PR description opens with `## Why` (the player-facing goal), then `## Proof`.
- Agents open PRs. A human merges. Nobody merges without Jean-Marie's explicit yes.

## Sources

- poteto on tibo.dog (X, 2026-11-01): lint rule for every bug found, TLA+ on the game's state machines, `.hot.ts` files with a no-allocation lint, custom deterministic sim with three.js only for drawing, server-side replay, build fails over a download budget, headless bots tuning difficulty, comments banned by lint.
- poteto on Yaron Minsky's talk (X, 2026-10-26) and the talk itself (YouTube rUYP4C29yCw): agents thrive on feedback and types are one of the best kinds; make illegal states unrepresentable; property tests, fuzzing, deterministic simulation testing; expect tests make behaviour legible and shrink review; agents lower the cost of formal methods.
- pstack skills `statechart`, `principle-model-the-domain`, `principle-prove-it-works`, `create-verification-skill`.
- last30days research, 2026-11-04 (Reddit partial, X, HN, GitHub): plain three.js plus HTML overlays is enough for small browser games; teams make agents enforce state rules with pre-merge checks that every touched state is in the transition tables.
- three.js forum, GateQuake: 10,000 tiles in two `InstancedMesh` draw calls, state in typed arrays, scale 0 for removed tiles.
- Voxel Musou write-up: fixed-step accumulator with clamped delta and capped substeps.
- Dunky benchmark: XState allocates a snapshot per transition, about 1.6M events/s.
- KeeperFX `spdigger_stack.c` and GameFAQs DK mechanics: imp job priorities and claiming rules.

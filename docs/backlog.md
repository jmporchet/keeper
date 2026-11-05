# Backlog: milestone 1 (sandbox)

One feature per PR, in this order. Each item names its acceptance check. "Proof" means the PR proof in [guidelines.md](guidelines.md#6-pr-proof): build, tests, screenshot, gameplay video.

| # | Item | Acceptance check |
|---|------|------------------|
| 1 | **Scaffold.** Vite + TypeScript strict + Vitest + ESLint + Playwright proof script (`npm run proof`). Blank canvas page. | `npm run build`, `npm test`, `npm run lint` pass in CI. `npm run proof` writes `proof/shot.png` and `proof/play.mp4` of the blank page. |
| 2 | **Lint guardrails.** Ban comments, ban `any`, require exhaustive `switch`, ban DOM and `three` imports under `src/sim/`, ban allocation in `*.hot.ts`. | A fixture file for each rule fails lint; a test runs ESLint on the fixtures and asserts each error. |
| 3 | ~~**Sim core.** Fixed-step loop (20 Hz), seeded PRNG, `Tick` and id brands, command queue, `step(state, commands)`.~~ | Property test: same seed and command log give the same state hash after 10,000 ticks, across two runs. |
| 4 | **Tile grid + map.** Typed-array grid, hard-coded 64x64 map, tile kinds from chart 3. | Expect test prints the map as ASCII and matches the committed snapshot. |
| 5 | ~~**Render the map.** Three.js scene, one `InstancedMesh` per tile kind, torch-style lighting.~~ | Proof screenshot shows the map; draw calls ≤ 8 (read from `renderer.info` and printed by the proof script). |
| 6 | ~~**App chart.** XState chart 1: boot, loading, sandbox running/paused, context lost.~~ | Unit test drives every transition. Proof video shows pause and resume; tick counter frozen while paused. |
| 7 | **Free camera.** Orbit, pan (drag + WASD), zoom, clamps (chart 2 camera states). | Proof video: scripted orbit, pan and zoom. Test: target never leaves the map after 1,000 random inputs (property test). |
| 8 | ~~**Tag tiles.** Click and sweep to tag earth and gold; rock refuses. Tagged tiles highlighted.~~ | Expect test of the grid after a tag sweep. Proof screenshot shows highlighted tiles. |
| 9 | ~~**Job board.** Chart 5, job pool, priorities. TLA+ spec for reservation.~~ | TLA+ check passes with `OneImpPerJob` invariant; Mermaid chart from the `statechart` skill committed. Property test: no job reserved twice after random commands. |
| 10 | ~~**Imps walk.** Spawn imps at the heart, grid pathfinding, chart 4 idle/walking/wandering.~~ | Expect test of an imp's path. Proof video shows imps walking. |
| 11 | **Imps dig.** Working state, earth becomes dirt. | Proof video: tag a corridor, imps dig it out. Determinism test still passes. |
| 12 | **Imps claim.** Dirt next to claimed floor gets claimed. | Property test: every claimed tile connects to the heart through claimed tiles. |
| 13 | **Gold.** Mining, carrying, gold counter. No treasury: gold drops at the heart. | Expect test: gold total is conserved (seam + carried + stored). |
| 14 | **Treasury room.** Paint on claimed floor, pay per tile, imps deliver gold there. | Proof video: paint a treasury, gold piles appear. Test: painting on unclaimed floor is refused. |
| 15 | **Hand of Evil.** Pick up, hold, drop, slap (chart 2 holding, chart 4 held). | Proof video: pick up an imp mid-walk and drop it elsewhere; its job returns to `Open`. |
| 16 | **Sandbox panel + HUD.** Spawn imp, add gold, show gold, imp count, tick. | Proof screenshot of the panel. Test: panel actions are plain commands in the replay log. |
| 17 | **Perf budget.** 200 imps at 60 fps target; first download budget enforced by the build. | Proof script prints sim ms per tick and frame ms; build fails above the size budget. |

| 18 | ~~**Lair + portal.** Paint lair on claimed floor, portal attracts one creature kind to a free bed.~~ | Proof: paint lair tiles, a creature arrives at the portal and walks to a bed. Test: two creatures never share a bed. |
| 19 | ~~**Hatchery + feeding.** Paint hatchery, chickens appear, creatures eat.~~ | Proof: hatchery with chickens; a hungry creature walks to one. |
| 20 | ~~**Command-log save/replay.** Export/import the seed + command log; replay matches live hashWorld.~~ | Test: round-trip save then replay equals the live hash after N ticks. |
| 21 | ~~**Payday.** Every PAY_TICKS, pay each live creature a wage from treasury; unpaid creatures leave.~~ | Proof: payday with and without enough gold; unpaid frees its bed. Test: gold conserved across payday; bed freed. |
| 22 | ~~**Training room.** Paint training on claimed floor; a creature trains for N ticks and gains a level/flag.~~ | Proof: paint training, a fly trains; bed still owned. |
| 23 | ~~**First hero invasion.** A hero party enters from the portal on a timer; sandbox skirmish, no defeat screen.~~ | Proof: heroes appear and path; at least one fight resolution. |
| 24 | ~~**Fly wander.** A sleeping fly may wander to a seeded reachable tile between sleep and hunger, keeping its bed and hunger timer.~~ | Proof: a fly sleeps, wanders and keeps its bed; tests cover the continued hunger timer and the hungry transition. |

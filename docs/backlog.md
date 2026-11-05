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
| 25 | ~~**Possession.** Enter a live creature; WASD moves it; Esc exits.~~ | Proof: possess a fly, move one tile, exit; camera follows. |
| 26 | ~~**Hero goals.** Heroes path to the heart; heart has HP; at 0 the heart is breached (HUD flag, sandbox continues).~~ | Proof: heroes reach/attack the heart; breach flag set; no defeat screen. |
| 27 | ~~**Workshop room.** Paint a workshop on claimed floor; dig and claim jobs adjacent to it finish faster.~~ | Proof: paint a workshop and an adjacent dig completes within the workshop timer; tests cover refusals, cost, and boosted versus full job times. |
| 28 | ~~**Heart repair.** After breach, pay REPAIR_HEART_COST to restore heart HP and allow hero waves again.~~ | Proof: breach then repair; heartHp restored; a later wave can spawn. Test: refuse when gold short; conservation. |
| 29 | ~~**Library room.** Paint a library on claimed floor; training on a tile adjacent to it finishes in half the ticks.~~ | Proof: paint a library adjacent to a training tile and a creature reaches level one within the library timer; tests cover refusals, cost, the Chebyshev aura and boosted versus full training times. |
| 30 | ~~**Doors.** Paint a door on claimed floor; heroes blocked until door HP breaks; imps/creatures pass.~~ | Proof: hero blocked by door then path opens when door breaks. |
| 31 | ~~**Trap (gas).** Paint a gas trap on claimed floor; first hero to step on it takes damage once; imps/creatures ignore.~~ | Proof: hero HP drops on trap tile; trap spent. |
| 32 | ~~**Wave escalation.** After each successful heart repair the next hero wave grows in party size and HP, capped at `HERO_WAVE_PARTY_CAP = 5` and `HERO_WAVE_HP_CAP = 6`; the first wave stays at baseline.~~ | Proof: breach then repair; the respawned wave has more heroes or higher max HP. Tests cover baseline, first escalation, caps and `repairsDone` hashing. |
| 33 | ~~**Door toggle.** Click a door to open/close; open lets heroes through; closed blocks them again.~~ | Proof: open a door and a hero walks through; close blocks. |
| 34 | ~~**Beetle.** A second creature kind arrives through the portal beside the fly, picked by the seeded arrival roll and hashed; it has `BEETLE_HP = 5` and a distinct darker, wider render tint while sharing the fly lifecycle, training, hunger, payday, possession and combat rules.~~ | Proof: lair arrivals include a beetle, draw calls stay ≤ 7. Tests cover both kinds arriving, kind hashing, beetle possession and hero damage to a beetle. |

# Backlog: milestone 2 (DK look)

One feature per PR, in this order. Each item names its acceptance check. "Proof" means the PR proof in [guidelines.md](guidelines.md#6-pr-proof): build, tests, screenshot, gameplay video.

| # | Item | Acceptance check |
|---|------|------------------|
| 35 | ~~**M2 visual brief (docs).** Add the DK-inspired look axes and constraints to `docs/design.md`.~~ | `docs/design.md` has a Milestone 2 section with the pitch, axes and constraints; no copied Bullfrog or EA assets. |
| 36 | ~~**Cave floor atlas.** Generate a runtime atlas for dirt, claimed stone flags, rock, gold veins, earth top and room or portal floors; apply it to the tile `InstancedMesh` groups with per-instance atlas cells so tints still work.~~ | Proof screenshot shows textured floors and distinct rock and gold tops; draw calls ≤ 7; first-load JS ≤ 300 KB gzip; tests cover atlas cell selection. |
| 37 | ~~**Cave wall faces.** Draw cave wall faces on dug edges using the atlas and existing tile meshes.~~ | Proof screenshot shows cave walls around dug corridors; draw calls ≤ 7; no new art assets. |
| 38 | ~~**Room floor variants.** Give each room kind a distinct atlas floor variant while keeping per-instance tints.~~ | Proof shows treasury, lair, hatchery, training, workshop and library floors reading differently; draw calls ≤ 7; tests cover room-to-cell selection. |
| 39 | ~~**Torch lights.** Add torch point lights with darker falloff and optional fog.~~ | Proof screenshot shows lit dungeon pools with dark falloff; frame budget still met at 200 imps; no extra draw calls. |
| 40 | ~~**Imp silhouette.** Replace the cone with a low-poly DK-inspired imp silhouette.~~ | Proof shows the new imp silhouette while walking, working and held; draw calls ≤ 7. |
| 41 | ~~**Creature silhouettes (fly, beetle, heroes).** Give fly, beetle and heroes distinct low-poly silhouettes within the existing instanced meshes.~~ | Proof shows fly, beetle and hero silhouettes; draw calls ≤ 7; possession still works. |
| 42 | ~~**Room props pass.** Make treasury piles, lair beds and hatchery chickens readable props.~~ | Proof shows stocked treasury, occupied lair beds and hatchery chickens; shared props draw calls ≤ 7. |
| 43 | ~~**Door & trap meshes.** Give doors and gas traps distinct meshes instead of floor tints.~~ | Proof shows closed and open doors and a live and spent trap; draw calls ≤ 7. |
| 44 | ~~**HUD/panel restyle.** Restyle the HUD and sandbox panel as a classic DK dark stone panel with HTML/CSS.~~ | Proof screenshot shows the restyled HUD and panel; all panel actions still work; no new gameplay rules. |

# Backlog: milestone 3 (hold the heart)

One feature per PR, in this order. Each item names its acceptance check. "Proof" means the PR proof in [guidelines.md](guidelines.md#6-pr-proof): build, tests, screenshot, gameplay video.

| # | Item | Acceptance check |
|---|------|------------------|
| 45 | ~~**M3 brief (docs).** Add the hold-the-heart axes and constraints to `docs/design.md`.~~ | `docs/design.md` has a Milestone 3 section with the pitch, axes, constraints and out-of-scope list; no copied Bullfrog or EA assets. |
| 46 | ~~**Defeat condition.** The heart stays breached for `DEFEAT_TICKS`; the app enters defeat.~~ | Tests: breach for fewer than `DEFEAT_TICKS` does not defeat, breach for `DEFEAT_TICKS` does, repair resets the timer; determinism hash covers the timer. Proof video shows the breach timer reaching defeat. |
| 47 | **Victory condition.** Surviving `VICTORY_WAVES` hero waves wins. | Tests: the wave counter increments on cleared waves, victory fires exactly at `VICTORY_WAVES`, earlier clears do not win. Proof video shows the final wave and the victory transition. |
| 48 | **End screen + restart.** Show defeat or victory and restart from the same seed. | Tests: restart rebuilds the seed and clears the command log, the restarted state matches a fresh run, no stale entities. Proof video shows both end screens and a restart. |
| 49 | **Spell lightning.** Cast at a hero for gold, damage and cooldown. | Tests: cost is refused when short, cooldown blocks recast until elapsed, damage is applied once, gold is conserved. Proof video shows a cast and a cooldown. |
| 50 | **Spell heal creature.** Heal a creature for gold and cooldown. | Tests: healing is capped at max HP, cost and cooldown are enforced, dead creatures are refused. Proof video shows a damaged creature healed. |
| 51 | **Spell speed imps.** Speed up imps for gold and cooldown. | Tests: buff expires after its ticks, cost and cooldown are enforced, job timing reflects the boost. Proof video shows a sped-up imp. |
| 52 | **Spell panel/casting UX.** Panel shows costs and cooldowns and supports targeting. | Tests: casts are plain commands in the replay log, panel disables unaffordable or cooling spells. Proof screenshot shows the panel and a targeted cast; draw calls ≤ 7. |
| 53 | **Warlock kind.** Warlock arrives through the portal after library research. | Tests: research gates arrivals, warlock is picked by the seeded roll and hashed, it shares creature lifecycle rules. Proof video shows research and a warlock arriving; draw calls ≤ 7. |
| 54 | **Troll kind.** Troll arrives through the portal after a workshop is built. | Tests: workshop gates arrivals, troll is picked by the seeded roll and hashed, it shares creature lifecycle rules. Proof video shows a troll arriving; draw calls ≤ 7. |
| 55 | **Creature levels 2-3.** Training can raise a creature to levels two and three. | Tests: level caps at three, training time and stats scale by level, hashing covers level. Proof video shows a creature reaching level three; draw calls ≤ 7. |
| 56 | **Blade trap.** A blade trap damages the first hero to step on it; imps and creatures ignore it. | Tests: hero HP drops once, trap becomes spent, non-heroes take no damage. Proof video shows a hero hit by a blade trap; draw calls ≤ 7. |
| 57 | **Magic door.** A magic door blocks heroes until broken or toggled, with distinct rules from a normal door. | Tests: heroes are blocked while closed, pass when open or broken, imps and creatures pass either way. Proof video shows a magic door blocking and opening; draw calls ≤ 7. |
| 58 | **Trap repair.** Imps repair spent traps for gold. | Tests: repair job is claimed by one imp, gold is spent, the trap returns to live, non-spent traps are refused. Proof video shows an imp repairing a spent trap; draw calls ≤ 7. |
| 59 | **SFX dig/combat/payday.** Minimal runtime-generated SFX for dig, combat and payday. | Tests: the sound module is pure and deterministic, each event maps to one cue, no analytics or ads SDK is imported. Proof video includes audible dig, combat and payday cues. |
| 60 | **Cave ambience.** Runtime-generated cave ambience loop. | Tests: ambience starts and stops with the app chart, no external audio asset is fetched, no analytics SDK. Proof video includes the ambience. |
| 61 | **Pathfinding bench / flow field decision.** Bench 200 imps and choose flow field or A*. | Tests: the bench prints sim ms per tick for both approaches, the chosen pathfinder stays deterministic, the 200-imp budget passes. Proof video or script output shows the bench and the documented decision. |
| 62 | **Sim Worker (optional).** Move the sim into a Web Worker behind a flag. | Tests: worker and main-thread sims produce the same hash for the same seed and command log, command ordering is preserved. Proof video shows the worker mode running; draw calls ≤ 7. |

# Bugfix

- Bugfix: room/door/trap/repair costs spend treasury gold too (HUD gold)

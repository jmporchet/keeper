# AGENTS.md

Read these before you change anything:

1. [docs/design.md](docs/design.md): what the game is, the architecture, and every state chart.
2. [docs/guidelines.md](docs/guidelines.md): the rules. They are not optional.
3. [docs/backlog.md](docs/backlog.md): take the next unchecked item. One item per PR.

Hard rules:

- Model state as a state machine. Update its Mermaid chart in `docs/design.md` in the same PR.
- `src/sim/` is pure and deterministic: no DOM, no `three`, no XState, no `Math.random`, no clocks.
- `*.hot.ts` files do not allocate.
- No comments in code. Found a mistake? Add a lint rule, type or test that prevents it.
- Every PR runs `npm run build`, `npm test`, `npm run lint`, then `npm run proof`.
- Every feature PR attaches `proof/shot.png` and `proof/play.mp4`, a 10 to 20 second reel of the named proof scenarios (`digClaim`, `hand`, `pause`, `treasury`, `lair`, `hatchery`, `saveReplay`, `possess`, `workshop`, `panelPerf`) recorded with Playwright `recordVideo` in headless Chrome (`channel: "chrome"`) and assembled with ffmpeg. See [PR proof](docs/guidelines.md#6-pr-proof).
- Never merge. Jean-Marie merges.

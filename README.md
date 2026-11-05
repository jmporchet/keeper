# keeper

A web clone of Dungeon Keeper: dig with imps, claim tiles, build rooms, all in 3D in the browser with a free camera.

Status: tile grid. Read [docs/design.md](docs/design.md), [docs/backlog.md](docs/backlog.md) and [docs/guidelines.md](docs/guidelines.md).

## Develop

```bash
npm install
npm run dev
npm run build
npm test
npm run lint
npm run proof
npm run preview
```

`npm run dev` starts Vite. `npm run build` typechecks and writes `dist/`. `npm test` runs Vitest. `npm run lint` runs ESLint. `npm run proof` builds, then records `proof/shot.png` and `proof/play.mp4` in headless Chrome. `npm run preview` serves `dist/`.

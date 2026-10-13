# Repository map for coding agents

This repository hosts Daniel Vaško's static portfolio and **Dutchman**, a desktop single-player Three.js naval game inspired by the Unity project Naglfar. There is no backend, runtime AI service, Unity runtime, or level/campaign system here.

## Read narrowly

- Game change: start with the task table below, then inspect the named symbols in `dutchman-source/src/main.ts`. Most game systems intentionally coexist in that one module; do not assume separate entity/system directories.
- Read [docs/dutchman.md](docs/dutchman.md) for update ordering, coupled behavior, constants, and verification. Do not scan generated bundles to understand the game.
- Portfolio-only change: read the relevant HTML page and `assets/css/styles.css`; game source is unrelated.
- Keep this map updated when responsibilities change. Preserve working timing, signs, balance and update order unless the requested task explicitly changes them. Document awkward coupling before extracting or redesigning it.

## Files and entry points

| Path | Responsibility |
| --- | --- |
| `index.html`, `pages/*.html` | Portfolio pages. Homepage button and Projects page link into `games/dutchman/`. |
| `assets/css/styles.css` | Portfolio styling, independent of game styling. |
| `js/app.js` | Portfolio navigation, contact links, year, project-list initialization. |
| `js/services/projectService.js`, `data/projects.json`, `js/components/projectList.js` | Fetch project data and render cards/optional game link. URLs in cards resolve relative to the consuming page. |
| `dutchman-source/index.html` | Game HTML shell, canvas, HUD, intro/pause/death overlay; loads `/src/main.ts`. IDs are a contract with `$()` in the main module. |
| `dutchman-source/src/main.ts` | Scene setup, procedural assets, shared entity/state arrays, input, simulation, UI, audio and frame loop. |
| `dutchman-source/src/ship-layout.ts` | `ShipLayout`, capped dimensions/decks, per-side installed gun counts, shared muzzle rows, firing-side selection and chart coordinates. |
| `dutchman-source/src/progression.ts` | Versioned wallet/upgrade saves, nine-category catalogue, prices/prerequisites, atomic paired or one-side purchases, derived movement/combat stats, starting elevation and muzzle speed. |
| `dutchman-source/src/harbour.ts` | Safe perimeter, dock interaction range, spawn position, port obstacles, segment crossing and enemy exclusion. |
| `dutchman-source/src/shipyard-ui.ts` | Shop dialog rendering, purchase previews, optional ship-stat panel; callbacks connect it to the game. |
| `dutchman-source/src/physics.ts` | `WORLD`, normalized `WAVES`, `waveHeight`, `ballistic`, `trajectoryImpact`, `angleDelta`, `segmentSphere`; pure math without DOM. |
| `dutchman-source/src/style.css` | Game layout, HUD, overlays, responsive rules, Google Fonts with fallbacks. |
| `dutchman-source/public/` | Files copied unchanged into the build; currently Three.js license only. Models and sounds are generated in code. |
| `dutchman-source/tests/physics.test.ts` | Original math tests; `tests/ship-layout.test.ts` additionally checks caps, gun spacing, map headings and cached trajectory equivalence. `tests/progression.test.ts` covers purchases, saves, protection and preview/live impact agreement. |
| `dutchman-source/package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`, `vite.config.js` | Commands, pinned dependencies, esbuild permission, strict TS settings and static build destination. |
| `games/dutchman/` | **Generated, committed deployment output.** Edit source and rebuild; never hand-edit hashed JS/CSS or generated HTML. |

## Task → symbols to inspect in `dutchman-source/src/main.ts`

| Task | Start here; follow these dependencies |
| --- | --- |
| Shop/upgrades/persistence | `progression.ts` first (catalogue/quotes/stats/save); `shipyard-ui.ts` for cards; `main.ts` `openPort`, `buyUpgrade`, `spawnShip`, `makeShip`, `persistProgress`. `reset` preserves progress. |
| Safe harbour | `harbour.ts` rules; `main.ts` `protectedShip`, `fire`, enemy branch of `simulate`, projectile loop, `safePosition`, port model and `drawMap`. |
| Player controls/movement | `keys`, `controlled`, keyboard/pointer/wheel listeners; player branch of `simulate`; `statsFor` in `progression.ts`; `clearInput`, `pause`, `resume`. |
| Camera / Q/E views | `aimSide`, `direction`, `side`, camera branch of `frame`, `playerSail` fade; same side convention used by `shotData`. |
| Enemy spawning | `spawnShip`, `safePosition`, `spawnEnemy`, `reset`, replacement timer at end of `simulate`. |
| Enemy behavior | Enemy branch of `simulate`: patrol/engage, aiming, island avoidance, boundary steering. |
| Collision / buoyancy | Ship/island and ship/ship loops, float samples, projectile loop inside `simulate`; `waveHeight`, `segmentSphere` in `physics.ts`. |
| Weapon change | `ShipLayout.rows`/`mounts` in `ship-layout.ts`; `muzzleSpeed`, `Shot`, `shotData`, `firePlayer`, `fire`, `updateArc`, projectile loop, enemy aiming formula, `hud` reload display; `ballistic`/`trajectorySamples`/`trajectoryImpact` in `physics.ts`. |
| Score / progression | `sink`, loot loop of `simulate`, `score`, `kills`, `best`, `reset`, `hud`. Voyage score/best is separate from `progress.wallet`; upgrades persist through death; enemies are replenished without level scaling. |
| HUD / minimap | `hud`, `drawMap`, `notice`; `chartPoint`/`chartHeading` in `ship-layout.ts`; state is read directly from module globals and entity arrays. Also inspect HTML IDs and CSS. |
| Menus / restart | `running`, `started`, `dead`, start/pause click handlers, `pause`, `resume`, `reset`, player branch of `sink`; overlay HTML and body classes in CSS. |
| Rendering / ocean | Renderer/scene initialization, `waveGLSL`, `waterMaterial`, `waterUniform`, `frame`; `WAVES`/`waveHeight` in `physics.ts`. |
| Models / map / effects | `ShipLayout` dimensions in `ship-layout.ts`; `mat`, `mesh`, `box`, `consolidate`, `makeShip`, `shipTemplates`, `islands`, buoy/crate templates, `burst`, effect loop. No asset-loader pipeline. |
| Audio / persistence | `tone`, sound click handler, `audio`/`sound`; best-score load/write at `dutchman-best`; versioned wallet/upgrades at `dutchman-progress-v1` via `progression.ts`. Position, health and current voyage are not saved. |

## Run and verify

From `dutchman-source/`, using Node **22.18+** and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

`pnpm dev` serves the game alone. For deployment paths and portfolio links, serve the repository root with `python -m http.server 5173 --bind 127.0.0.1`, then open `http://127.0.0.1:5173/games/dutchman/`. Do not open HTML via `file://`.

Vite uses relative asset URLs and empties **only `games/dutchman/`** when building. Commit source and corresponding build output for runtime changes. Keep deployment configuration unchanged unless needed. On restricted Windows environments, the native Vite config loader is already configured; if dev dependency prebundling fails, test the production build with the static server instead.

Minimum checks: tests, build/typecheck, `git diff --check`, then the manual checklist in `docs/dutchman.md`. For comments/docs-only changes, compare rebuilt output to the committed output as strong evidence of unchanged runtime behavior. Do not claim full gameplay coverage from the unit tests.

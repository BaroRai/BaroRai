# Repository map for coding agents

This repository hosts Daniel Vaško's static portfolio and **Dutchman**, a desktop single-player Three.js naval game inspired by the Unity project Naglfar. There is no backend, runtime AI service, Unity runtime, or campaign service here.

## Read narrowly

- Game change: start with the task table below, then inspect the named symbols in `games/dutchman/source/src/main.ts`. Most game systems intentionally coexist in that one module; do not assume separate entity/system directories.
- Read [games/dutchman/docs/dutchman.md](games/dutchman/docs/dutchman.md) for update ordering, coupled behavior, constants, and verification. Do not scan generated bundles to understand the game.
- Portfolio-only change: read the relevant HTML page and `portfolio/assets/css/styles.css`; game source is unrelated.
- Keep this map updated when responsibilities change. Preserve working timing, signs, balance and update order unless the requested task explicitly changes them. Document awkward coupling before extracting or redesigning it.

## Files and entry points

| Path | Responsibility |
| --- | --- |
| `portfolio/index.html`, `portfolio/pages/*.html` | Portfolio pages. Homepage button and Projects page link into `games/dutchman/`. |
| `portfolio/assets/css/styles.css` | Portfolio styling, independent of game styling. |
| `portfolio/js/app.js` | Portfolio navigation, contact links, year, project-list initialization. |
| `portfolio/js/services/projectService.js`, `portfolio/data/projects.json`, `portfolio/js/components/projectList.js` | Fetch project data and render cards/optional game link. URLs in cards resolve relative to the consuming page. |
| `games/dutchman/source/index.html` | Game HTML shell, canvas, HUD, intro/pause/death overlay; loads `/src/main.ts`. IDs are a contract with `$()` in the main module. |
| `games/dutchman/source/src/main.ts` | Scene setup, shared entity/state arrays, input, simulation, UI, audio and frame loop. Ship models and geometry ownership are in ship-model.ts and rendering.ts. |
| `games/dutchman/source/src/ship-layout.ts` | `ShipLayout`, capped dimensions/decks, per-side installed gun counts, shared muzzle rows, firing-side selection and chart coordinates. |
| `games/dutchman/source/src/progression.ts` | Versioned wallet/upgrade saves, nine-category catalogue, prices/prerequisites, atomic paired or one-side purchases, derived movement/combat stats, starting elevation and muzzle speed. |
| `games/dutchman/source/src/harbour.ts` | Safe perimeter, dock interaction range, spawn position, port obstacles, segment crossing and enemy exclusion. |
| `games/dutchman/source/src/shipyard-ui.ts` | Shop dialog rendering, purchase previews, optional ship-stat panel; callbacks connect it to the game. |
| `games/dutchman/source/src/physics.ts` | `WORLD`, normalized `WAVES`, `waveHeight`, `ballistic`, `trajectoryImpact`, `angleDelta`, `segmentSphere`; pure math without DOM. |
| `games/dutchman/source/src/style.css` | Game layout, HUD, overlays, responsive rules, Google Fonts with fallbacks. |
| `games/dutchman/source/public/` | Files copied unchanged into the build; currently Three.js license only. Models and sounds are generated in code. |
| `games/dutchman/source/tests/physics.test.ts` | Original math tests; `tests/ship-layout.test.ts` additionally checks caps, gun spacing, map headings and cached trajectory equivalence. `tests/progression.test.ts` covers purchases, saves, protection and preview/live impact agreement. |
| `games/dutchman/source/package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`, `vite.config.js` | Commands, pinned dependencies, esbuild permission, strict TS settings and static build destination. |
| `games/dutchman/` | Game entry point; source/ and docs/ are authored, dist/ is **generated, committed deployment output.** Edit source and rebuild; never hand-edit hashed JS/CSS or generated HTML. |

## Task → symbols to inspect in `games/dutchman/source/src/main.ts`

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
| Score / progression | `sink`, loot loop of `simulate`, `score`, `kills`, `best`, `reset`, `hud`. Voyage score/best is separate from `progress.wallet`; upgrades persist through death; enemies are replenished to the active region's fleet cap. |
| HUD / minimap | `hud`, `drawMap`, `notice`; `chartPoint`/`chartHeading` in `ship-layout.ts`; state is read directly from module globals and entity arrays. Also inspect HTML IDs and CSS. |
| Menus / restart | `running`, `started`, `dead`, start/pause click handlers, `pause`, `resume`, `reset`, player branch of `sink`; overlay HTML and body classes in CSS. |
| Rendering / ocean | Renderer/scene initialization, `waveGLSL`, `waterMaterial`, `waterUniform`, `frame`; `WAVES`/`waveHeight` in `physics.ts`. |
| Models / map / effects | `ShipLayout` dimensions in `ship-layout.ts`; `mat`, `mesh`, `box`, `consolidate`, `makeShip`, `EnemyModels`, `islands`, buoy/crate templates, `burst`, effect loop. No asset-loader pipeline. |
| Audio / persistence | `tone`, sound click handler, `audio`/`sound`; best-score load/write at `dutchman-best`; versioned wallet/upgrades at `dutchman-progress-v1` via `progression.ts`. Position, health and current voyage are not saved. |

## Run and verify

From `games/dutchman/source/`, using Node **22.18+** and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

`pnpm dev` serves the game alone. For deployment paths and portfolio links, serve the repository root with `python -m http.server 5173 --bind 127.0.0.1`, then open `http://127.0.0.1:5173/games/dutchman/`. Do not open HTML via `file://`.

Vite uses relative asset URLs and empties **only `games/dutchman/dist/`** when building. Commit source and corresponding build output for runtime changes. Keep deployment configuration unchanged unless needed. On restricted Windows environments, the native Vite config loader is already configured; if dev dependency prebundling fails, test the production build with the static server instead.

Minimum checks: tests, build/typecheck, `git diff --check`, then the manual checklist in `games/dutchman/docs/dutchman.md`. For comments/docs-only changes, compare rebuilt output to the committed output as strong evidence of unchanged runtime behavior. Do not claim full gameplay coverage from the unit tests.

## Extracted rendering modules

- games/dutchman/source/src/ship-model.ts: makeShip builds owned geometry using an injected material palette, ShipLayout and Equipment.
- games/dutchman/source/src/rendering.ts: mesh/box helpers, consolidate and disposeGeometry. Materials are borrowed; consolidate consumes input geometry.
- games/dutchman/source/tests/rendering.test.ts: resource ownership, geometry bounds and base/asymmetric/maximum upgraded model coverage.

Root index.html redirects to portfolio/. The game entry point games/dutchman/index.html redirects to dist/. Keep both entry points outside Vite output. All game dependencies and tests live in games/dutchman/source/.

## Region ownership and travel

- src/regions.ts (under games/dutchman/source): five region definitions, topology, enemy profiles, arrival clearance, recommendations and isolated region save.
- src/region-world.ts: one region scene, procedural islands/port, instanced buoys and owned graphics disposal.
- src/region-slot.ts: dispose the old region before constructing the next. Never cache inactive scene objects.
- src/enemy-models.ts: only active-region NPC templates; dispose after detaching clones. Shared global materials are borrowed.
- main.ts: openTravel/confirmTravel, clearRegionEntities/installRegion, fleet spawning and active collision arrays. Preserve the player object and modular upgrade data during travel.
- tests/regions.test.ts: topology, arrivals, readiness, persistence and resource lifecycle. tests/region-memory.html is the Vite-served browser resource harness.

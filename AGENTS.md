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
| `dutchman-source/src/physics.ts` | `WORLD`, normalized `WAVES`, `waveHeight`, `ballistic`, `angleDelta`, `segmentSphere`; pure math without DOM. |
| `dutchman-source/src/style.css` | Game layout, HUD, overlays, responsive rules, Google Fonts with fallbacks. |
| `dutchman-source/public/` | Files copied unchanged into the build; currently Three.js license only. Models and sounds are generated in code. |
| `dutchman-source/tests/physics.test.ts` | Four Node tests for flight, swept collision, CPU/GPU wave agreement and angular wrapping. |
| `dutchman-source/package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`, `vite.config.js` | Commands, pinned dependencies, esbuild permission, strict TS settings and static build destination. |
| `games/dutchman/` | **Generated, committed deployment output.** Edit source and rebuild; never hand-edit hashed JS/CSS or generated HTML. |

## Task → symbols to inspect in `dutchman-source/src/main.ts`

| Task | Start here; follow these dependencies |
| --- | --- |
| Player controls/movement | `keys`, `controlled`, keyboard/pointer/wheel listeners; player branch of `simulate`; `clearInput`, `pause`, `resume`. |
| Camera / Q/E views | `aimSide`, `direction`, `side`, camera branch of `frame`; same side convention used by `shotData`. |
| Enemy spawning | `spawnShip`, `safePosition`, `spawnEnemy`, `reset`, replacement timer at end of `simulate`. |
| Enemy behavior | Enemy branch of `simulate`: patrol/engage, aiming, island avoidance, boundary steering. |
| Collision / buoyancy | Ship/island and ship/ship loops, float samples, projectile loop inside `simulate`; `waveHeight`, `segmentSphere` in `physics.ts`. |
| Weapon change | `muzzleSpeed`, `Shot`, `shotData`, `fire`, `updateArc`, projectile loop, enemy aiming formula, `hud` reload display; `ballistic` in `physics.ts`. |
| Score / progression | `sink`, loot loop of `simulate`, `score`, `kills`, `best`, `reset`, `hud`. No levels or difficulty progression; enemies are replenished. |
| HUD / minimap | `hud`, `drawMap`, `notice`; state is read directly from module globals and entity arrays. Also inspect HTML IDs and CSS. |
| Menus / restart | `running`, `started`, `dead`, start/pause click handlers, `pause`, `resume`, `reset`, player branch of `sink`; overlay HTML and body classes in CSS. |
| Rendering / ocean | Renderer/scene initialization, `waveGLSL`, `waterMaterial`, `waterUniform`, `frame`; `WAVES`/`waveHeight` in `physics.ts`. |
| Models / map / effects | `mat`, `mesh`, `box`, `consolidate`, `makeShip`, `shipTemplates`, `islands`, buoy/crate templates, `burst`, effect loop. No asset-loader pipeline. |
| Audio / persistence | `tone`, sound click handler, `audio`/`sound`; best-score load/write at `dutchman-best` in localStorage. No saved voyage. |

## Run and verify

From `dutchman-source/`, using Node **22.18+** and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

`pnpm dev` serves the game alone. For deployment paths and portfolio links, serve the repository root with `python -m http.server 5173 --bind 127.0.0.1`, then open `http://127.0.0.1:5173/games/dutchman/`. Do not open HTML via `file://`.

Vite uses relative asset URLs and empties **only `games/dutchman/`** when building. Commit source and corresponding build output for runtime changes. Keep deployment configuration unchanged unless needed. On restricted Windows environments, the native Vite config loader is already configured; if dev dependency prebundling fails, test the production build with the static server instead.

Minimum checks: tests, build/typecheck, `git diff --check`, then the manual checklist in `docs/dutchman.md`. For comments/docs-only changes, compare rebuilt output to the committed output as strong evidence of unchanged runtime behavior. Do not claim full gameplay coverage from the four math tests.

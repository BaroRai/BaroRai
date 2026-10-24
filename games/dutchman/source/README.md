# Dutchman

A desktop, single-player naval playground adapted from the sailing, wave-sampling, buoyancy, camera and ballistic principles in [Naglfar](https://github.com/Rezawa7/Naglfar). Made for fun with AI coding agents and iterative tuning by Daniel Vaško. All models are original procedural geometry; no Unity model or texture assets are redistributed.

## Build and preview

Use Node 22.18+ and pnpm. From this directory:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

The build writes only to `../dist`. Serve the repository root with `python -m http.server 5173` and open `/games/dutchman/`. This also verifies the portfolio return link. `pnpm dev` provides a development server for the game alone.

The generated game is committed so the existing GitHub Pages branch publishing setup can serve it without introducing a new deployment workflow. Rebuild and commit source plus output for each change. Asset paths are relative and work under `/BaroRai/games/dutchman/dist/`. The rest of the portfolio has no game dependencies. Portfolio integration consists of the homepage Try Dutchman button, one project entry and optional project-link rendering.

## Controls

W accelerates; S brakes; A/D steer. Hold Q for port or E for starboard and release to return to chase view. Mouse wheel or up/down arrows adjust elevation. Click or Space fires the selected side while Q/E is held, or both sides from chase view; holding repeats after each side reloads. Aiming raises the camera above and behind the whole ship and fades player sails. F or the dock button opens the shipyard near the southern port; I toggles ship details. The port protects your ship and disables combat. Esc pauses. Losing focus pauses and clears input. Sound starts muted and is synthesized locally.

## Simulation and limits

10° starting aim with 60-unit/s cannonballs, shared predicted-water/static-obstacle impact checks, fixed 60 Hz simulation, capped frame catch-up, GPU Gerstner water using shared CPU coefficients, inverse horizontal displacement for float sampling, five-point damped buoyancy, swept projectile collision, simple ship/island collision, 1.2 km square bounded map, 8–12 enemies according to region, with capped replacement spawns, 60 loot crates maximum, 93 projectiles maximum (a full broadside must fit before firing), and 160 effect particles maximum. Ship and island meshes are merged by material. No backend or runtime AI calls. Wallet/upgrades and personal best use optional localStorage; the game works when storage is unavailable.

Enemy states are patrol and engage, with island avoidance and broadside alignment. Collision hulls are simplified spheres rather than detailed meshes. This is an arcade adaptation, not a reproduction of Unity physics. Touch controls and multiplayer are out of scope. Enemy aiming and difficulty need player feedback. Fonts use Google Fonts with local system fallbacks.

## Tuning

`src/physics.ts`: world extent and wave directions/amplitudes/wavelengths/speeds. `src/progression.ts`: upgrade catalogue, prices, derived stats and versioned saving. `src/harbour.ts`: protected water and dock rules. `src/shipyard-ui.ts`: shop and expanded stats. `src/ship-layout.ts`: capped hull dimensions, decks, per-side installed cannons and minimap coordinates. `src/main.ts`: procedural model construction, movement, enemy engagement radius, muzzle speed, damage, reload durations, loot rewards and travel orchestration. `src/style.css`: presentation. `tests/physics.test.ts` checks wave/render alignment, ballistic flight, swept hits and angular wrapping. `tests/ship-layout.test.ts` checks upgrade bounds, cannon spacing, map direction, firing selection and cached trajectory equivalence. `tests/progression.test.ts` checks purchases, persistence, safe-zone geometry and impact prediction. Nine categories can be purchased at port; hull changes add slots, and paired cannon purchases fill one slot on each side. Unspent doubloons and upgrades survive sinking/reload; voyage score remains separate.

Three.js is MIT licensed; see `../dist/THIRD_PARTY_LICENSES.txt`.

## Agent documentation

Start with [AGENTS.md](../../../AGENTS.md) for task-to-symbol routing. See [the implementation notes](../docs/dutchman.md) for lifecycle, constants, fragile behavior and manual verification.

Ship geometry is built in src/ship-model.ts from ShipLayout and Equipment. src/rendering.ts owns geometry batching/disposal; it borrows materials. These modules have no dependency on game state or the DOM. The build only empties ../dist; it never removes source or docs. Serve the repository root for portfolio navigation; the game-only dev server does not serve portfolio/.

## Regional voyages

Approach a boundary route buoy and press F to preview the destination, recommended current hull, weaker broadside damage and top speed. Recommendations do not block entry or charge doubloons. Shallows connects north to Coral Reach, east to Frostwake, south to Ember Strait and west to Stormglass. Each destination has a return route and a protected mini-port. All five maps are 1.2 km square with different island layouts and palettes.

The extensions have 9/10/11/12 NPCs and 2/3/4/5 ship types respectively. Cutters, brigs, bombards, chasers and dreadnoughts vary in size, speed, firepower and colour. Region definitions and ship profiles live in src/regions.ts; procedural scenery lives in src/region-world.ts.

Travel preserves your ship, damage, upgrades, doubloons, score and kills. Loose loot, projectiles and patrols are cleared; returning creates a new patrol. Only one region scene and its NPC templates exist at once, with disposal before the next map is built. Lightweight region definitions remain available for previews. Reload keeps wallet, upgrades and selected region, while starting a fresh voyage at its port.

For graphics-resource verification, run pnpm dev and open /tests/region-memory.html. Run 100 map swaps; the harness compares rendered geometry/texture counts on returning to Shallows and requires one region scene throughout. This is a resource-lifecycle check, not an FPS or heap-memory benchmark.

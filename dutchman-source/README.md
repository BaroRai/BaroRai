# Dutchman

A desktop, single-player naval playground adapted from the sailing, wave-sampling, buoyancy, camera and ballistic principles in [Naglfar](https://github.com/Rezawa7/Naglfar). Made for fun with AI coding agents and iterative tuning by Daniel Vaško. All models are original procedural geometry; no Unity model or texture assets are redistributed.

## Build and preview

Use Node 22.18+ and pnpm. From this directory:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

The build writes only to `../games/dutchman`. Serve the portfolio root with `python -m http.server 5173` and open `/games/dutchman/`. This also verifies the portfolio return link. `pnpm dev` provides a development server for the game alone.

The generated game is committed so the existing GitHub Pages branch publishing setup can serve it without introducing a new deployment workflow. Rebuild and commit source plus output for each change. Asset paths are relative and work under `/BaroRai/games/dutchman/`. The rest of the portfolio has no game dependencies. Portfolio integration consists of the homepage Try Dutchman button, one project entry and optional project-link rendering.

## Controls

W accelerates; S brakes; A/D steer. Hold Q for port or E for starboard and release to return to chase view. Mouse wheel or up/down arrows adjust elevation. Click or Space fires the selected side while Q/E is held, or both sides from chase view; holding repeats after each side reloads. Aiming moves the camera toward the stern and fades player sails. Esc pauses. Losing focus pauses and clears input. Sound starts muted and is synthesized locally.

## Simulation and limits

Fixed 60 Hz simulation, capped frame catch-up, GPU Gerstner water using shared CPU coefficients, inverse horizontal displacement for float sampling, five-point damped buoyancy, swept projectile collision, simple ship/island collision, 1.2 km square bounded map, eight enemies with capped replacement spawns, 60 loot crates maximum, 93 projectiles maximum (a full broadside must fit before firing), and 160 effect particles maximum. Ship and island meshes are merged by material. No backend or runtime AI calls. Personal best uses optional localStorage; the game works when storage is unavailable.

Enemy states are patrol and engage, with island avoidance and broadside alignment. Collision hulls are simplified spheres rather than detailed meshes. This is an arcade adaptation, not a reproduction of Unity physics. Touch controls and multiplayer are out of scope. Enemy aiming and difficulty need player feedback. Fonts use Google Fonts with local system fallbacks.

## Tuning

`src/physics.ts`: world extent and wave directions/amplitudes/wavelengths/speeds. `src/ship-layout.ts`: capped hull dimensions, decks, shared cannon rows and minimap coordinates. `src/main.ts`: procedural model construction, movement, enemy engagement radius, muzzle speed, damage, reload durations, loot rewards and island layout. `src/style.css`: presentation. `tests/physics.test.ts` checks wave/render alignment, ballistic flight, swept hits and angular wrapping. `tests/ship-layout.test.ts` checks upgrade bounds, cannon spacing, map direction, firing selection and cached trajectory equivalence. Upgrade purchasing is not implemented; voyages still start with the original ship configuration.

Three.js is MIT licensed; see `../games/dutchman/THIRD_PARTY_LICENSES.txt`.

## Agent documentation

Start with [AGENTS.md](../AGENTS.md) for task-to-symbol routing. See [the implementation notes](../docs/dutchman.md) for lifecycle, constants, fragile behavior and manual verification.

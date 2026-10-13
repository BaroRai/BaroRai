# Dutchman: current implementation notes

Use root `AGENTS.md` for paths and task routing. This document describes existing behavior, not a proposed architecture.

## Lifecycle and data flow

`dutchman-source/index.html` loads `src/main.ts`, which imports Three.js, `mergeGeometries`, pure physics helpers and game CSS. Top-level code creates renderer/lights/camera, materials, ship template cache, ocean, seven islands, 80 boundary buoys, crate/effect templates, listeners and state. `reset()` builds the initial fleet before the first `requestAnimationFrame(frame)`. There is no application class, entity-component system or external asset loading phase.

Entities are plain records with Three.js objects: `Ship`, `Shot`, `Loot`, `Effect`, `Island`. Mutable arrays and globals connect all systems. `player` also belongs to `ships`; shots retain their owner record even after that ship is removed. Templates/clones share geometry and materials. The player sail has a separate material from enemy sails; `frame` fades it to 20% opacity while aiming and restores it afterward. Shots and effects recycle meshes; loot clones are removed from the scene on collection/expiry. Do not dispose shared resources during individual entity removal.

`frame` requests another frame first, caps elapsed time at 0.08 seconds, and accumulates fixed 1/60-second simulation steps only while `running`. Menus discard accumulated time. Before the first start, water and ship bobbing animate without combat. Camera interpolation and rendering continue while paused; `hud`/`drawMap` refresh roughly every 0.1 seconds. Consequently, pause freezes simulation but does not freeze every visual interpolation.

`simulate` ordering matters:

1. Advance wave clock, read selected side/elevation, process held player fire.
2. For each ship, decrement reloads, calculate player/AI steering and speed, move, resolve islands/boundary, sample buoyancy and update its mesh.
3. Separate overlapping ship pairs using logical x/z positions.
4. Advance projectiles, sweep against ship spheres, then test water/islands/expiry; apply damage and call `sink`.
5. Bob/collect/expire loot, update score/best/health; update effects and buoys.
6. Replenish enemies on the spawn timer and update notices.

The HUD reads these globals directly; no event bus or view-model layer exists. `sink(player)` stops simulation and reuses the intro overlay as game-over UI. The start button calls `reset` only for a new/dead voyage, then `resume`. Reset clears voyage entities/score/kills/time/elevation, but keeps personal best, sound preference for the page session, shared assets and mesh pools. Blur/hidden-document pauses clear held input.

## Constants and contracts

| Area | Current location / important values |
| --- | --- |
| World / waves | `physics.ts`: `WORLD=600` half extent; three `WAVES` with normalized directions and computed `k`. `main.ts` also contains literal buoy bounds, spawn area, projectile limits and HUD map label: changing WORLD alone is insufficient. |
| Movement | `simulate`: player desired max speed 22, coast decrement 2×dt, brake damping 2.8, other damping .65; steering rate .65 with speed factor. S brakes; it does not reverse. |
| Float behavior | `simulate`: center and layout-derived forward/back and lateral samples (base ±6/±3); vertical spring 16, damping 6, rotation damping 5. CPU height inverts Gerstner horizontal displacement; GPU shader uses the same WAVES/time. |
| Coordinate signs | `direction(yaw)=(sin(yaw),0,cos(yaw))`; right vector uses yaw−π/2. Port is −1, starboard +1. A adds yaw, D subtracts. Match camera, projectile velocity and roll signs together. Q takes priority when both Q/E are held. |
| Input / aiming | Listeners and `simulate`: elevation starts at 22°, clamped 5–55°. Arrows step on keydown and continue at 24°/s while held; wheel changes 2° per event sign. Immediate click/Space and held repeat use `firePlayer`: selected side while Q/E held, otherwise both sides with independent reloads. |
| Spawning | `reset`: player, two fixed enemies, six random attempts. `spawnEnemy`: up to 50 candidate tries in ±520 square; player distance >150, ships >35, islands >r+24; scale .72–.97. End of `simulate`: every >9 seconds, attempt one replacement if total ships <9. Failed placement is allowed. |
| AI | `simulate`: engage <210, broadside turn <145, speed depends on <100 distance, fire between 30 and 185 with angular error <.22; island avoidance r+65; boundary turn at 530. |
| Weapons | `muzzleSpeed=46`; `fire` uses shared `ShipLayout.mounts` (base three shots at z offsets −3/0/3); cooldown 2.8 player /4.5 enemy. Whole broadsides are admitted only if they fit within **93** active shots. `hud` separately divides cooldown by 2.8. |
| Projectile physics | `ballistic` uses half-gravity 4.905; AI aiming separately uses 9.81. `shotData` adds ship forward velocity. Shot loop uses swept spheres (radius 5×scale, raised center, enlarged for upgraded layouts), water height, island radius + y<12, age>9 and abs(x/z)>750. Only the shooter is excluded: friendly fire is possible. |
| Damage / loot | Player hull 100, enemy 65 in `spawnShip`; damage 25 player shot /9 enemy shot in `simulate`; `sink` increments kills for any enemy sinking and drops three crates. Pickup radius 13, +100 score, +5 hull capped at 100; 180-second expiry, 60-crate cap. |
| Progression / save | No levels, upgrade purchases, win condition or scaling difficulty. Capped procedural ship layouts exist as groundwork; normal voyages still spawn the base layout. Fixed map and replacement enemies; score comes from crates, kills tracked separately. Only best score persists (`dutchman-best`), with storage failures caught. |
| Effects / sound | `burst`: up to ten particles per event, 160 cap, .7-second life. `tone` synthesizes triangle oscillators for start, player fire, pickup, death and sound-toggle confirmation. Muted by default; no sound files/music. |

## Ship layout foundation

`ship-layout.ts` owns `ShipLayout`: at most three length extensions, two width upgrades, three total gun decks, and six guns per row per side. Length adds three world units per extension, width adds two, deck spacing is three. Gun capacity is `min(6, 3 + lengthExtensions)`; rows have three-unit spacing. Inputs are normalized to bounded integers. `BASE_SHIP` retains the original 16×7 dimensions and three guns per side.

`makeShip` extends the middle hull, retains shaped bow/stern, repeats supported decks, moves the cabin/masts and builds guns from those same mounts. Geometry is merged by material once per configuration and cached. `spawnShip` accepts an optional layout; normal gameplay uses the base. The layout also supplies buoyancy spacing and approximate collision size. Muzzles now start at barrel tips rather than the old independent hardcoded offset.

There is no purchase UI, cost curve, saved upgrade state, new health/speed scaling or automatic upgrade progression. Those are future gameplay decisions. A larger hull still needs spawn-clearance/boundary tuning before player upgrades are exposed. Cached configurations currently live for the page session; revisit cache ownership if frequent in-game rebuilds are added.

`chartPoint` maps +Z north and +X west; `chartHeading` negates yaw. Keep both together for all markers. The side camera moves to the stern and outward toward the selected broadside; its height follows deck count.

## Fragile areas / technical debt (preserved)

- `main.ts` is densely formatted and couples initialization, input, simulation and UI. Use symbol searches instead of reading generated bundles. Extracting systems would require preserving shared state and ordering; it is not needed for ordinary tuning.
- `updateArc` caches immutable local `trajectorySamples` when elevation changes. Both sides share the mirrored shape; each muzzle gets a translated line with live yaw, ship velocity and water clipping. One line-segment buffer and instanced target rings support 18 guns per side. The preview tests water only, not ships/islands, and wave height is sampled at the current time rather than predicting future water.
- Shot directions intentionally remain yaw/elevation based: decorative wave pitch/roll do not tilt projectile velocity. Muzzle layout matches the level ship model; rocking can still visually offset a barrel from its launch point. Changing this requires an explicit aiming/physics decision.
- Ship-pair separation updates logical x/z after meshes were positioned. Rendering/projectile centers may reflect the prior position until the next simulation step. Changing order can affect collision behavior.
- Reload, gravity, map bounds, and other values are duplicated across physics, AI, HUD and geometry. There is no central configuration file. The table above lists the coupled locations.
- `sink(player)` sets `running=false` during a simulation step; the rest of that current step still finishes. Avoid casually changing iteration/removal behavior or shooter references.
- `$()` asserts every HTML ID exists, and minimap context is non-null asserted. HTML IDs, `hud`, menu handlers and CSS body classes must remain aligned.
- Random placement/AI uses `Math.random`; there is no seeded replay or deterministic end-to-end gameplay test. Unit tests do not cover menus, AI, score, restart or audio.
- WebGL-unavailable/context-loss UI is handled separately from normal death; context loss disables the start button and requests reload. Preserve that distinction.
- `consolidate` creates temporary geometries, and dynamic loops allocate vectors/arrays. Resource ownership and performance may merit a later focused review; no pooling/disposal rewrite is part of this cleanup.
- `tsx` remains a dev dependency although the test script uses Node's native type stripping. Dependency cleanup would change the lockfile/tooling and is deferred.

Unity heritage is conceptual: Gerstner waves, five-point float sampling, side cameras and ballistic equations. There are no `.cs`, Unity prefabs/scenes, imported Unity meshes or Unity update callbacks in this repository. The game uses custom arcade math and Three.js, not Unity physics.

## Verification checklist

1. Run `pnpm test` and `pnpm build` in `dutchman-source`; run `git diff --check`. Vite's >500 KB uncompressed chunk warning is currently expected; inspect real errors separately.
2. Serve repository root; open `/games/dutchman/`. Check intro, ocean, ships, islands, no missing assets or console errors; start voyage.
3. Check W acceleration/S brake, A/D turning, held Q/E side views and release-to-chase and sail opacity restoration, Q-only/E-only fire, both-side fire from chase, independent reloads, wheel and arrows, reload bars and aiming arc.
4. Check nearby enemies approach/turn/fire; observe projectile hits and hull damage. Check islands, ship contact, world boundary and water impacts as time allows.
5. Sink an enemy and collect crates: score +100, hull +5 (cap 100), kills and minimap update; reload to verify best score if testing persistence. No level transition is expected.
6. Check Escape/button pause and resume, blur/visibility pause, death overlay and Sail again (fresh hull/score/fleet). Enable sound via user gesture and check its cues; do not describe a toggle-state check as an audible test.
7. Follow homepage/Projects game links and game's return link using static production paths. Touch gameplay is not implemented.

For documentation/comment-only changes, byte-identical regenerated JS/CSS/HTML plus unchanged tests provide a useful regression guard. Record which interactive checks actually ran, and distinguish untested flows from verified ones.

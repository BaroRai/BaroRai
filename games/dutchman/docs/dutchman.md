# Dutchman: current implementation notes

Use root `AGENTS.md` for paths and task routing. This document describes existing behavior, not a proposed architecture.

## Lifecycle and data flow

`games/dutchman/source/index.html` loads `src/main.ts`, which imports the extracted ship-model.ts and rendering.ts modules, Three.js, pure physics helpers and game CSS. Top-level code creates renderer/lights/camera, materials, ship template cache, ocean, seven islands, 80 boundary buoys plus the harbour ring, crate/effect templates, listeners and state. `reset()` builds the initial fleet before the first `requestAnimationFrame(frame)`. There is no application class, entity-component system or external asset loading phase.

Entities are plain records with Three.js objects: `Ship`, `Shot`, `Loot`, `Effect`, `Island`. Mutable arrays and globals connect all systems. `player` also belongs to `ships`; shots retain their owner record even after that ship is removed. Enemy templates/clones share geometry and materials. Player geometry is owned by that player: `buyUpgrade` and `reset` dispose it on replacement, never the shared materials. The player sail has a separate material from enemy sails; `frame` fades it to 20% opacity while aiming and restores it afterward. Shots and effects recycle meshes; loot clones are removed from the scene on collection/expiry. Do not dispose shared resources during individual entity removal.

`frame` requests another frame first, caps elapsed time at 0.08 seconds, and accumulates fixed 1/60-second simulation steps only while `running`. Menus discard accumulated time. Before the first start, water and ship bobbing animate without combat. Camera interpolation and rendering continue while paused; `hud`/`drawMap` refresh roughly every 0.1 seconds. Consequently, pause freezes simulation but does not freeze every visual interpolation.

`simulate` ordering matters:

1. Advance wave clock, read selected side/elevation, process held player fire.
2. For each ship, decrement reloads, calculate player/AI steering and speed, move, resolve islands/boundary, sample buoyancy and update its mesh.
3. Separate ship pairs, reapply enemy harbour exclusion and synchronize mesh x/z.
4. Advance shots using simulation time minus launch time. Find terrain/water impact, absorb harbour-crossing shots, then sweep the remaining segment against unprotected ships; apply damage/expiry.
5. Bob/collect/expire loot, update score/best/health; update effects and buoys.
6. Replenish enemies on the spawn timer and update notices.

The HUD reads these globals directly; no event bus or view-model layer exists. `sink(player)` stops simulation and reuses the intro overlay as game-over UI. The start button calls `reset` only for a new/dead voyage, then `resume`. Reset clears voyage entities/score/kills/time/elevation, but keeps persistent wallet/upgrades, personal best, sound preference for the page session, shared assets and mesh pools. Blur/hidden-document pauses clear held input.

## Constants and contracts

| Area | Current location / important values |
| --- | --- |
| World / waves | `physics.ts`: `WORLD=600` half extent; three `WAVES` with normalized directions and computed `k`. `main.ts` also contains literal buoy bounds, spawn area, projectile limits and HUD map label: changing WORLD alone is insufficient. |
| Movement | `simulate`: base max speed 22, coast decrement 2×dt; `statsFor` derives acceleration, brake damping and turn rate from upgrades and hull weight. S brakes; it does not reverse. |
| Float behavior | `simulate`: center and layout-derived forward/back and lateral samples (base ±6/±3); vertical spring 16, damping 6, rotation damping 5. CPU height inverts Gerstner horizontal displacement; GPU shader uses the same WAVES/time. |
| Coordinate signs | `direction(yaw)=(sin(yaw),0,cos(yaw))`; right vector uses yaw−π/2. Port is −1, starboard +1. A adds yaw, D subtracts. Match camera, projectile velocity and roll signs together. Q takes priority when both Q/E are held. |
| Input / aiming | Listeners and `simulate`: elevation starts at 10° (`START_ELEVATION`), clamped 5–55°. Arrows step on keydown and continue at 24°/s while held; wheel changes 2° per event sign. Immediate click/Space and held repeat use `firePlayer`: selected side while Q/E held, otherwise both sides with independent reloads. |
| Spawning | `reset`: player at the harbour dock with saved upgrades, two fixed enemies, six random attempts. `spawnEnemy`: up to 50 candidate tries in ±520 square; player distance >150, ships >their collision radius+24, obstacles >r+24; excludes harbour+35; scale .72–.97. End of `simulate`: every >9 seconds, attempt one replacement if total ships <9. Failed placement is allowed. |
| AI | `simulate`: all enemies patrol while the player is protected; harbour avoidance and hull exclusion apply every step. Otherwise engage <210, broadside turn <145, speed depends on <100 distance, fire between 30 and 185 with angular error <.22; island avoidance r+65; boundary turn at 530. |
| Weapons | `MUZZLE_SPEED=60` in `progression.ts`; `fire` uses shared `ShipLayout.mounts` (base three shots at z offsets −3/0/3); cooldown 2.8 player /4.5 enemy. Whole broadsides are admitted only if they fit within **93** active shots. `fire` and HUD share per-ship reload stats. Installed guns are independent per side; the current shop buys pairs. |
| Projectile physics | `ballistic` uses half-gravity 4.905; AI aiming separately uses 9.81. `shotData` adds ship forward velocity. Shot loop uses swept spheres (radius 5×scale, raised center, enlarged for upgraded layouts), shared `trajectoryImpact` for predicted wave height and cylindrical static obstacles, age>12 and abs(x/z)>750. Protected hulls and harbour-crossing shots cannot cause damage; friendly fire outside remains possible. Damage is captured when fired. |
| Damage / loot | Base hull 100 player/65 enemy; player health and damage derive from `statsFor` (base damage 25), enemy damage 9; `sink` increments kills for any enemy sinking and drops three crates. Pickup radius 13, +100 wallet and voyage score, +5 hull capped at current maximum; 180-second expiry, 60-crate cap. |
| Progression / save | Nine upgrade categories, no levels/win condition/difficulty scaling. `dutchman-progress-v1` stores version, wallet, upgrade levels and per-side gun counts. `dutchman-best` stays separate. Purchases and loot save immediately; storage failures show session-only status in the shop. Sinking/reload retain upgrades and wallet but reset the voyage. |
| Effects / sound | `burst`: up to ten particles per event, 160 cap, .7-second life. `tone` synthesizes triangle oscillators for start, player fire, pickup, death and sound-toggle confirmation. Muted by default; no sound files/music. |

## Ship layout foundation

`ship-layout.ts` owns `ShipLayout`: at most three length extensions, two width upgrades, three total gun decks, and six guns per row per side. Length adds three world units per extension, width adds two, deck spacing is three. Gun capacity is `min(6, 3 + lengthExtensions)`; rows have three-unit spacing. Inputs are normalized to bounded integers. `BASE_SHIP` retains the original 16×7 dimensions and three guns per side.

`makeShip` extends the middle hull, retains shaped bow/stern, repeats supported decks, moves the cabin/masts and builds guns from those same mounts. Geometry is merged by material. Enemies cache layouts; player geometry is rebuilt only on purchase/reset and old geometry disposed. `spawnShip` receives the saved player layout. The layout also supplies buoyancy spacing and approximate collision size. Muzzles now start at barrel tips rather than the old independent hardcoded offset.

`progression.ts` owns prices, caps, prerequisites and stat effects. Hull width permits one additional deck per level. Hull/deck purchases add capacity, never free guns. `ShipLayout` accepts explicit `{port,starboard}` installed totals; rows fill bottom-up, then center guns evenly on each row. Increasing capacity can redistribute those mounts. Omit explicit armament only for the original fully populated layout API/tests.

`quoteCannons(progress, sides)` supports a single side or both. It validates ALL requested sides before payment and returns a new state; the shop always requests both. New upgrades should extend the catalogue, normalization, derived stats and model appearance together. Adding a stat must not require rewriting purchasing logic.

`statsFor` applies modest size/deck weight penalties and equipment bonuses. Extra health adds only the increase in maximum health (preserving existing damage). Enemy stats remain fixed. All equipment levels have visible procedural additions: sails, barrel thickness, helm/rudder, anchors/capstan, hull strakes. World-edge and spawn clearance use layout size; hull collisions remain approximations.

The shipyard opens via F/click only within `canDock`; it freezes simulation and clears input. F/Esc/button closes it and restores canvas focus. I/click toggles non-pausing ship stats. Protected water overlaps a ship's collision radius; enemy hulls are pushed completely outside. `fire` gates both player and enemy shots, and existing projectiles are absorbed at the boundary. `HARBOUR` and `PORT_OBSTACLES` own logical geometry; the decorative port model in main.ts must stay aligned when relocating it.

`chartPoint` maps +Z north and +X west; `chartHeading` negates yaw. Keep both together for all markers. The side camera moves to the stern and outward toward the selected broadside; its height follows deck count. Chase distance/height also follow hull length, decks and sails.

## Fragile areas / technical debt (preserved)

- `main.ts` is densely formatted and couples initialization, input, simulation and UI. Use symbol searches instead of reading generated bundles. Extracting systems would require preserving shared state and ordering; it is not needed for ordinary tuning.
- `updateArc` caches immutable local `trajectorySamples` when elevation changes. Both sides share the mirrored shape; each muzzle gets a translated line with live yaw, ship velocity and water clipping. One line-segment buffer and instanced target rings support 18 guns per side. Preview and real shots share `trajectoryImpact`, checking water at launchTime+flightAge and static obstacles (including the safe perimeter). Refined impact points stop the preview. Moving enemies are not predicted; decorative island meshes still use approximate collision volumes.
- Shot directions intentionally remain yaw/elevation based: decorative wave pitch/roll do not tilt projectile velocity. Muzzle layout matches the level ship model; rocking can still visually offset a barrel from its launch point. Changing this requires an explicit aiming/physics decision.
- Ship separation is followed by harbour exclusion and mesh x/z synchronization; keep that ordering so protected hulls cannot be pushed into combat.
- Gravity/map bounds still have coupled literals. Upgrade/combat tuning now lives in `progression.ts`; geometry caps live in `ship-layout.ts`; harbour tuning lives in `harbour.ts`. The table above lists the coupled locations.
- `sink(player)` sets `running=false` during a simulation step; the rest of that current step still finishes. Avoid casually changing iteration/removal behavior or shooter references.
- `$()` asserts every HTML ID exists, and minimap context is non-null asserted. HTML IDs, `hud`, menu handlers and CSS body classes must remain aligned.
- Random placement/AI uses `Math.random`; there is no seeded replay or deterministic end-to-end gameplay test. Unit tests do not cover menus, AI, score, restart or audio.
- WebGL-unavailable/context-loss UI is handled separately from normal death; context loss disables the start button and requests reload. Preserve that distinction.
- rendering.ts consumes procedural input geometry and releases temporary merged inputs, including indexed conversions. Materials remain borrowed. Never pass shared scene/template geometry into consolidate. Combat reuses collision scratch vectors and updates cooldowns in place. Ship iteration is direct: movement does not remove ships, and projectile collision breaks immediately after a possible sink. Preserve these iteration contracts. Camera interpolation reuses target vectors; ballistic prediction still allocates points and merits profiling before further changes.
- `tsx` remains a dev dependency although the test script uses Node's native type stripping. Dependency cleanup would change the lockfile/tooling and is deferred.

Unity heritage is conceptual: Gerstner waves, five-point float sampling, side cameras and ballistic equations. There are no `.cs`, Unity prefabs/scenes, imported Unity meshes or Unity update callbacks in this repository. The game uses custom arcade math and Three.js, not Unity physics.

## Verification checklist

1. Run `pnpm test` and `pnpm build` in `games/dutchman/source`; run `git diff --check`. Vite's >500 KB uncompressed chunk warning is currently expected; inspect real errors separately.
2. Serve repository root; open `/games/dutchman/`. Check intro, ocean, ships, islands, no missing assets or console errors; start voyage.
3. Check W acceleration/S brake, A/D turning, held Q/E side views and release-to-chase and sail opacity restoration, Q-only/E-only fire, both-side fire from chase, independent reloads, wheel and arrows, reload bars and aiming arc.
4. Check nearby enemies approach/turn/fire; observe projectile hits and hull damage. Check islands, ship contact, world boundary and water impacts as time allows.
5. Sink an enemy and collect crates: score +100, hull +5 (cap derived maximum), kills and minimap update; reload to verify best score if testing persistence. No level transition is expected.
6. Check Escape/button pause and resume, blur/visibility pause, death overlay and Sail again (fresh hull/score/fleet). Enable sound via user gesture and check its cues; do not describe a toggle-state check as an audible test.
7. Start at port: no firing/damage, enemies passive/outside. Verify an already airborne hostile shot is absorbed on entry and damage resumes outside. F/button opens shop, F/Esc closes it without stuck controls. Buy a pair only with slots on BOTH sides; test width-before-deck prerequisites, insufficient funds, caps and visible model changes.
8. Buy upgrades, reload, sink/restart: wallet and upgrades persist; voyage score resets. I toggles expanded stats. Check storage denial/corrupt data fallback; max-size ship camera, clearance and 18 guns per side.
9. Follow homepage/Projects game links and game's return link using static production paths. Touch gameplay is not implemented.

For documentation/comment-only changes, byte-identical regenerated JS/CSS/HTML plus unchanged tests provide a useful regression guard. Record which interactive checks actually ran, and distinguish untested flows from verified ones.

## Module boundaries and extension workflow

The repository separates portfolio/ from games/dutchman/. The game contains source/, docs/, and generated dist/; its index.html keeps the previous game URL working. Vite empties dist/ only. Root index.html forwards to portfolio/. Former /pages/*.html URLs now live under /portfolio/pages/*.html.

ShipLayout remains the authoritative source of dimensions, deck capacity and cannon mounts. progression.ts owns purchase validation, save normalization and derived stats. ship-model.ts turns a supplied layout/equipment/material palette into an owned Group without accessing scene state, DOM or persistence. rendering.ts owns procedural geometry consolidation and disposal. main.ts connects these modules and preserves the simulation order above. Enemy template cache keys include equipment as well as layout and installed armament, so future enemy equipment variants cannot reuse the wrong visual model.

To add an upgrade, update the catalogue/caps, save normalization, stats and model appearance together; keep purchase validation in progression.ts and muzzle placement in ShipLayout. Add regression coverage for save round trips, capacity, asymmetric armament and the resulting model. Do not dispose materials when replacing a player model or dispose shared enemy template geometry when removing a clone.

## Verification of this refactor

18 Node tests pass, including new geometry ownership and base/asymmetric/maximum ship model tests. TypeScript and the production build pass. Browser smoke checks cover rendering, starting, safe harbour/shipyard prerequisites, sailing, both broadside reloads, pause/resume, ship stats and portfolio navigation. No frame-rate improvement is claimed: this change removes identifiable allocation/disposal overhead; a controlled hardware benchmark remains future work. Full death/restart, audible sound and purchasing with earned funds are not covered by this smoke run.

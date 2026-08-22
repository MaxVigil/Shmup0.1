# MVP Combat Specification v0.1

**Product:** Shmup  
**Scope:** MVP Combat  
**Status:** READY FOR IMPLEMENTATION  
**Previous consistency review:** Passed — 2026-08-20; superseded by cross-document master audit  
**Canonical term:** `Combat Screen`

Combat UI composition, visual states, typography, icons, and shared components must comply with `MVP_DESIGN_SYSTEM_SPEC_v0.1.md`. This document remains authoritative for Combat product behaviour and gameplay timing.

## 1. Purpose

The `Combat Screen` is the active gameplay environment in which the player controls an aircraft and engages enemies during a mission.

This document contains only product behaviour explicitly agreed for the MVP. Behaviour not defined here must not be invented by the implementer and requires a new product decision.

## 2. Canonical terminology

- `Combat Screen` — the active gameplay screen.
- `Mission` — the strategic entity selected before combat; it is not a synonym for `Combat Screen`.
- `Mission Details Overlay` — the overlay opened from `Operations` before combat begins.
- `Pause Overlay` — the blocking overlay displayed while combat is paused.
- `Mission Result Overlay` — the overlay displayed after combat is resolved.
- `Hull Integrity` — the aircraft's remaining durability.

Do not use `Flight Screen`, `Mission Screen`, or `Battle Screen` as names for the `Combat Screen`.

## 3. Entry and exit

### 3.1 Entry

The agreed entry flow is:

```text
Operations
  -> Mission Details Overlay
  -> Combat Screen
```

### 3.2 Exit paths

The `Combat Screen` can end through:

1. Mission completion.
2. Player defeat when `Hull Integrity = 0`.
3. Player interruption through the pause flow and `Return to Base`.

The agreed return flow is:

```text
Combat resolved
  -> Mission Result Overlay
  -> Operations
```

For player interruption:

```text
Combat Screen
  -> Pause Overlay
  -> Return to Base
  -> Operations
```

The detailed consequences and result flows are defined in Sections 9 and 10.

## 4. Combat Screen

### 4.1 Gameplay area

- The combat gameplay area must occupy the full available game viewport.
- The MVP must not use a narrow, classic vertical-arcade playfield.
- The player aircraft must support free two-dimensional movement within the gameplay area.

### 4.2 Background

- The MVP background must be a solid black colour.
- The background must not contain terrain, tiles, textures, images, animation, parallax, weather, environmental objects, or terrain collision.
- Player aircraft, enemies, projectiles, and the `Hull Integrity` bar must remain clearly readable against the background.
- Combat behaviour must not depend on the background implementation.
- Future replacement of the black background with scrolling battlefield assets must not require changes to combat rules.
- Do not build a terrain system, background animation system, or speculative asset-loading system for this requirement.

### 4.3 HUD

The MVP combat HUD contains only the player aircraft's `Hull Integrity` bar.

The bar must:

- be horizontal;
- appear directly below the player aircraft;
- communicate remaining `Hull Integrity` visually;
- contain no numeric value.
- use `surface-interactive` for its track and `accent` for its fill;
- use the canonical Design System height of `0.5rem`;
- have no threshold-based colour change, segmentation, gradient, or animation.

Its geometry and positioning are:

```text
barWidth = 65% of rendered aircraft width
barHeight = 0.5rem
barGap = 1% of viewport short side
bar horizontal centre = aircraft horizontal centre
bar top edge = aircraft bottom edge + barGap
```

- The bar follows the aircraft.
- It is not part of the aircraft collision hitbox and does not affect `Movement Bounds`.
- On viewport resize, width and gap are recalculated while the current Hull ratio is retained.

The MVP combat HUD must not display:

- mission objectives;
- score;
- enemy counter;
- ammunition counter;
- minimap;
- resource indicators;
- damage numbers;
- weapon-name indicators;
- other non-essential combat information.

The global `Settings Button` is a utility control and is not part of the Combat HUD. Its presence does not violate the minimal-HUD requirement.

### 4.4 Player aircraft visual

Combat uses the approved aircraft asset:

```text
assets/runtime/aircraft/german-fighter.png
```

The rendered aircraft:

- has height equal to `8% of viewport short side`;
- derives its width from the source asset aspect ratio;
- points toward the top of the screen;
- preserves its aspect ratio;
- is not cropped, deformed, or rotated;
- has no animation frames in the MVP.

If the aircraft asset fails to load:

- Combat remains playable;
- a solid light-grey triangle pointing upward replaces the image;
- the fallback uses the same rendered bounds and collision geometry as the approved aircraft visual;
- no broken-image marker is displayed;
- gameplay behaviour does not change.

`viewport short side` is the smaller of viewport width and viewport height.

### 4.5 Combat render order

Combat uses this render order from lowest to highest:

```text
solid black background
Basic Drones
player projectiles
player aircraft
Hull Integrity Bar
global utility controls
blocking Overlay
```

Render order does not change hitboxes, collision detection, damage, destruction, or mission resolution.

## 5. Aircraft control

### 5.1 Control modes

The aircraft supports exactly two mutually exclusive movement-control modes:

1. `Mouse Movement`.
2. `Keyboard Movement`.

Only one mode may process movement input at a time.

`Mouse Movement` is enabled by default.

Pressing `F` must fully toggle the active control mode:

- with `Mouse Movement` active, keyboard movement input is ignored;
- with `Keyboard Movement` active, mouse movement input is ignored;
- pressing `F` again restores the other mode.

### 5.2 Mouse Movement

- The cursor represents the aircraft's target position.
- While the aircraft has not reached that target, it must move toward the cursor using its own movement speed.
- The aircraft must not teleport or snap to the cursor.
- Movement toward the cursor must use the acceleration-based movement model defined below.
- When the aircraft reaches the cursor target, acceleration toward the target stops, velocity decreases using deceleration, and the aircraft stops.

### 5.3 Keyboard Movement

When `Keyboard Movement` is active, the supported inputs are:

| Action | Inputs |
|---|---|
| Move up | `W` or `Arrow Up` |
| Move left | `A` or `Arrow Left` |
| Move down | `S` or `Arrow Down` |
| Move right | `D` or `Arrow Right` |

- Diagonal movement must be supported.
- The movement input vector must be normalized.
- Diagonal input must not produce a higher movement speed than movement along one axis.

### 5.4 Initial aircraft and mouse-target state

When Combat begins:

```text
aircraft center X = 50% of viewport width
aircraft center Y = 80% of viewport height
aircraft velocity = 0
mouse target = aircraft initial center
```

- The complete rendered aircraft sprite must be inside the approved `Movement Bounds`.
- The aircraft must not begin moving merely because Combat opened with `Mouse Movement` active.
- The mouse target updates after the first pointer movement inside the Combat viewport.
- Pointer movement outside the Combat viewport does not create a new mouse target.

## 6. Aircraft movement model

- Aircraft movement must be acceleration-based.
- Movement must update velocity before position; direct position movement from input is not allowed.
- The movement configuration must expose independently tunable values for:
  - maximum speed;
  - acceleration;
  - deceleration.
- Aircraft velocity must not exceed the configured maximum speed.
- The aircraft must be constrained to the visible gameplay area.
- The agreed movement boundary margin is one configurable gameplay value:

```text
movementMargin = 3% of viewport short side
```

- The same `movementMargin` applies to all four viewport edges.
- The complete rendered aircraft sprite, not only its collision hitbox or centre point, must remain inside these bounds.
- The MVP movement defaults are:

```text
maximumSpeed = 45% of viewport short side per second
timeToMaximumSpeed = 0.25 s
timeToStopFromMaximumSpeed = 0.20 s
targetTolerance = 0.5% of viewport short side
```

`viewport short side` is the smaller of viewport width and viewport height.

For `Mouse Movement`:

```text
brakingDistance = velocity^2 / (2 * deceleration)
```

- Outside `brakingDistance`, the aircraft accelerates toward the cursor target.
- Inside `brakingDistance`, the aircraft decelerates.
- Inside `targetTolerance`, residual movement is resolved and velocity becomes `0`.
- Resolving residual error inside `targetTolerance` is not considered teleportation.

Acceleration and deceleration are derived from the approved maximum speed and time values. All movement values must remain configurable without changing movement logic.

## 7. Enemy movement

- The global movement direction of enemies must be from the top of the screen toward the bottom of the screen.
- This downward movement rule also applies to enemies that enter from the left or right side of the screen.
- Relative to enemy movement, the player aircraft therefore appears to progress upward through the combat space.
- MVP enemies do not shoot and have no ranged attack.
- Enemy projectiles must not be implemented for the MVP.

### 7.1 Aircraft–enemy contact collision

The approved MVP Hull values are:

```text
Player maximum Hull Integrity = 100
Basic Drone maximum Hull Integrity = 3
```

When the player aircraft collides with an active `Basic Drone`:

```text
Player Hull Integrity = Player Hull Integrity - 25
Enemy Hull Integrity = Enemy Hull Integrity - 25
```

- Damage to both objects is resolved as one atomic collision event.
- Neither object receives priority based on collision-callback order.
- If either object's `Hull Integrity <= 0`, it immediately enters its corresponding defeat or `Destroyed` state.
- Contact damage is fixed for the MVP and is not randomized.
- Because a `Basic Drone` has `3` maximum Hull Integrity, any valid contact collision destroys it.
- Collision damage is applied before the drone is removed.
- The player receives the approved `0.5 s` contact-damage cooldown.
- The destroyed drone receives no cooldown and no overlap resolution.

### 7.2 Enemy type

The MVP contains one enemy type: `Basic Drone`.

- Maximum Hull Integrity: `3`.
- It has no ranged attack.
- It has no armour, abilities, or alternate combat states.
- Its only way to damage the player is contact collision.
- Movement speed: `12% of viewport height per second`.
- Movement speed is constant and is the same on both segments of a side-entry trajectory.
- The rendered `Basic Drone` is a square with side length equal to `4% of viewport short side`.
- It is rendered as a solid `danger` (`#D96767`) square with no outline, texture, image asset, animation, or rotation.
- Its collision hitbox matches the full rendered square.

### 7.3 Spawn schedule and group size

Enemy groups spawn on this fixed schedule:

```text
0 s      Regular group
10 s     Regular group
20 s     Regular group
...      Regular group every 10 s
100 s    Final regular group
110 s    Final group
```

- Each regular group contains `3 Basic Drones`.
- The final group contains `5 Basic Drones`.
- The mission therefore schedules `38 Basic Drones` in total.
- No enemies spawn after the final group.

### 7.4 Entry-region selection

Each `Basic Drone` independently selects one of these entry regions with equal probability:

```text
Top Entry:              1/3
Upper-left Side Entry:  1/3
Upper-right Side Entry: 1/3
```

At spawn time, the drone's entire hitbox must be outside the visible `Combat Screen`.

Spawn placement uses no additional hidden offset:

- for `Top Entry`, the bottom edge of the hitbox touches the top viewport boundary;
- for `Upper-left Side Entry`, the right edge of the hitbox touches the left viewport boundary;
- for `Upper-right Side Entry`, the left edge of the hitbox touches the right viewport boundary.

The drone therefore remains fully outside the visible area at creation and begins entering on its first positive movement update.

For `Top Entry`:

- the hitbox starts above the top boundary;
- horizontal position is selected randomly so the complete hitbox remains within the viewport width;
- after entering, the drone moves straight down.

For `Upper-left Side Entry`:

- the hitbox starts beyond the left boundary;
- vertical position is selected randomly so the complete hitbox remains within the upper half of the viewport;
- the drone moves in a straight line toward one fixed waypoint selected randomly inside the central upper zone;
- after reaching the waypoint, it moves straight down.

For `Upper-right Side Entry`, the same rules apply mirrored from the right boundary.

The central upper waypoint zone is:

```text
Horizontal: 40%-60% of viewport width
Vertical:   20%-40% of viewport height
```

- A side-entry waypoint is selected once at spawn and does not change.
- Drones do not target or pursue the player aircraft.
- Trajectories use straight segments, not curves.
- Enemy movement has no acceleration or turn physics.
- After reaching its waypoint, a side-entry drone's global movement remains downward.
- All drones in one group are created at the same mission-time instant.
- Each drone independently selects its entry region, valid spawn coordinate, and, for side entry, waypoint.
- Random overlap between spawned drones is permitted and does not trigger repositioning or separation.
- No entry indicator, spawn warning, spawn protection, fade-in, or entry animation is displayed.
- The drone hitbox is active from creation, including while the drone is still fully outside the viewport.

### 7.5 Off-screen resolution

- Each enemy starts with `hasEnteredVisibleArea = false`.
- An enemy must not be resolved as `Escaped` while it is still entering for the first time from outside the viewport.
- When any part of its hitbox first enters the visible gameplay area, `hasEnteredVisibleArea` becomes `true` and remains true.
- After `hasEnteredVisibleArea = true`, an enemy whose entire hitbox exits through the top, bottom, left, or right boundary enters `Escaped` and is removed from active Combat.
- An `Escaped` enemy does not return, is not counted as `Destroyed`, and causes no damage, failure, or reward penalty.
- Exit through the bottom is the expected normal path. Exit through another boundary is defensive edge-case handling, not an additional intended trajectory.

### 7.6 Contact-damage cooldown

- After a valid contact collision, the player aircraft receives a `0.5 s` cooldown against further contact damage.
- During this cooldown, collision with the same or another `Basic Drone` must not cause additional contact damage to the player.
- A `Basic Drone` colliding with the player during this cooldown still receives `25` damage and is destroyed.
- Such a collision does not restart or extend the player's existing cooldown.
- The cooldown does not block movement, automatic player fire, or damage from player projectiles.
- The cooldown is not general invulnerability.

### 7.7 Collision response

- Contact collision does not cause knockback, momentum transfer, stun, forced loss of control, or overlap resolution.
- The `Basic Drone` is destroyed and removed after collision damage is applied.
- The player aircraft retains its current movement velocity, subject to normal movement input and `Movement Bounds`.

## 8. Weapon and projectile system

### 8.1 Primary Weapon

- The player aircraft has one `Primary Weapon`.
- The MVP provides two selectable Primary Weapons: `Machine Gun` and `Cannon`.
- The `Primary Weapon` fires automatically while Combat is active.
- It always fires forward, toward the top of the screen.
- Cursor position and aircraft movement direction do not affect its firing direction.
- The player does not use a fire button for the `Primary Weapon`.

The MVP does not include ammunition, reloading, overheating, manual aiming, or secondary weapons.

The default equipped Primary Weapon is `Machine Gun`.

The approved weapon values are:

| Weapon | Damage | Fire rate | Shot interval | Hits to destroy Basic Drone |
|---|---:|---:|---:|---:|
| `Machine Gun` | `1` | `6 shots/s` | approximately `0.167 s` | `3` |
| `Cannon` | `3` | `2 shots/s` | `0.5 s` | `1` |

- Both weapons use the same projectile speed, projectile lifetime, and hitbox rules.
- Both weapons fire from one central muzzle point.
- Neither weapon has spread or randomized damage.
The approved shared projectile values are:

```text
projectileSpeed = 100% of viewport height per second
maximumLifetime = 2 s
```

A projectile is removed on the first applicable condition: valid hit, leaving the `Combat Screen`, or reaching `maximumLifetime`.

All weapon and projectile values must be configurable without changing weapon or projectile behaviour logic.

### 8.2 Fire rate

The interval between shots is defined as:

```text
shotInterval = 1 / fireRate
```

- `fireRate` represents shots per second.
- The first projectile is created immediately when active Combat begins.
- The firing timer does not advance while Combat is paused.
- Resuming Combat must not create a batch of shots for intervals elapsed during the pause.

### 8.3 Projectile behaviour

Each player projectile must have independently configurable:

```text
damage
speed
hitbox
```

A player projectile:

- is created at a defined muzzle point in front of the player aircraft;
- uses a muzzle point positioned relative to the aircraft sprite, not absolute screen coordinates;
- travels directly toward the top of the screen;
- moves at its configured constant speed;
- does not accelerate, home, or change trajectory;
- is removed after leaving the `Combat Screen` bounds;
- is removed after its first valid collision with an enemy;
- cannot penetrate multiple enemies;
- does not cause area damage.

Projectile geometry is:

```text
width = 0.5% of viewport short side
height = 1.5% of viewport short side
hitbox = full rendered projectile bounds
projectile horizontal center = aircraft horizontal center
projectile bottom edge = aircraft top edge
```

The projectile is rendered as a solid `text-primary` (`#F1F5F7`) rectangle with no outline, trail, glow, particle effect, or animation. `Machine Gun` and `Cannon` use the same projectile visual.

- A projectile is fully in front of the aircraft rather than partially overlapping its sprite at creation.
- It is visible and collision-active immediately when created.
- The MVP has no muzzle flash or randomized muzzle offset.
- A projectile is considered outside the `Combat Screen` only when its complete rendered bounds have left the viewport. A partially visible projectile remains active.

### 8.4 Projectile hit and damage

On the first valid collision between a player projectile and an enemy hitbox:

```text
enemy Hull Integrity = enemy Hull Integrity - projectile damage
```

For the MVP:

```text
finalDamage = projectileDamage
```

- The projectile is removed after applying damage.
- One projectile can damage only one enemy and can apply damage only once.
- The MVP has no armour, resistances, critical hits, random damage range, distance modifiers, weak points, damage types, minimum-damage rule, or difficulty multiplier.

### 8.5 Enemy destruction

When an enemy's `Hull Integrity <= 0`, it immediately enters the `Destroyed` state.

An enemy in the `Destroyed` state:

- no longer moves;
- no longer attacks;
- no longer participates in collision detection;
- cannot receive further damage;
- is removed from active Combat;
- is counted as destroyed exactly once.

Visual destruction effects must not delay the gameplay-state transition or the destruction count.

For MVP visual feedback, a destroyed enemy displays a white flash for exactly `100 ms` and then disappears. The gameplay-state transition to `Destroyed` occurs immediately; the flash is presentation only and must not retain a collision hitbox.

### 8.5.1 Damage feedback

Damage is applied to gameplay state immediately. Visual feedback is presentation-only and must not delay damage, destruction, defeat, collision removal, or mission resolution.

When a projectile damages a `Basic Drone` without destroying it:

- the drone flashes white for exactly `50 ms` and then returns to `danger`;
- its hitbox remains active because the drone remains alive;
- it continues its approved gameplay behaviour;
- no particle effect, glow, screen shake, or sound is produced.

When any valid contact collision reduces player Hull Integrity:

- the aircraft flashes `danger` for exactly `100 ms`;
- Hull Integrity and the Hull Integrity Bar update immediately in the same frame;
- no knockback, screen shake, particle effect, or sound is produced.

During the player's `0.5 s` contact-damage cooldown, a collision that does not reduce player Hull Integrity must not replay the aircraft damage flash. The colliding drone still receives `25` damage and, because this destroys a `Basic Drone`, uses the approved `100 ms` destruction flash.

While `God Mode` is enabled, incoming damage events do not reduce player Hull Integrity and therefore do not display the aircraft damage flash. Enemy contact damage and enemy destruction feedback remain unchanged.

When player Hull Integrity reaches `0`, defeat resolves immediately. Opening the Defeat `Mission Result Overlay` must not wait for the aircraft damage flash to finish.

### 8.6 Player aircraft collision geometry

The player aircraft collision hitbox is centered on the rendered aircraft sprite and uses:

```text
hitbox width = 60% of rendered sprite width
hitbox height = 70% of rendered sprite height
```

### 8.7 Enemy–enemy collision

- `Basic Drones` do not collide with one another.
- Their hitboxes may overlap without damage, displacement, trajectory changes, or separation behaviour.

## 9. Mission lifecycle

### 9.1 Mission type and objective

- The MVP mission type is `Interception`.
- The objective is to resolve the incoming enemy wave while the player aircraft remains operational.
- The superseded condition "survive for 120 seconds" must not be used.

### 9.2 Timeline and spawning cutoff

```text
0 s       Combat begins
0-110 s   Enemy groups spawn
110 s     Final enemy group is spawned
after     No new enemies spawn
```

- `110 s` identifies the spawn time of the final enemy group; it is not a fixed mission-end time.
- Combat may continue beyond `120 s` while enemies from the final group remain active.

### 9.3 Enemy escape

`Enemy escape` is the canonical term for an enemy leaving the battlefield through the bottom of the `Combat Screen`.

- An enemy that passes completely beyond the bottom boundary enters the resolved `Escaped` state and is removed from active Combat.
- `Enemy escape` does not damage the player or base.
- `Enemy escape` does not cause mission failure or reduce the mission reward in the MVP.
- An enemy in the `Escaped` state must not return to Combat or be counted as destroyed.

### 9.4 Mission success

The mission succeeds when all of the following are true:

1. The final enemy group has spawned.
2. No new enemy groups remain scheduled.
3. Every spawned enemy is resolved as either `Destroyed` or `Escaped`.
4. The player aircraft has `Hull Integrity > 0`.

Mission success is evaluated as soon as the final active enemy becomes `Destroyed` or `Escaped`; it does not wait for a fixed `120 s` endpoint.

On mission success:

- the aircraft retains its current Hull Integrity;
- the player receives exactly `+1 Credit`;
- the reward must be granted exactly once;
- the `Mission Result Overlay` displays only:
  - `Mission Complete`;
  - `Reward: 1 Credit`;
  - `Continue`;
- selecting `Continue` returns the player to `Operations`;
- no `Retry` action is available.

### 9.5 Player defeat

- If player `Hull Integrity <= 0`, Combat immediately ends as player defeat.
- Mission success must not be granted after player defeat, including if the last enemy is resolved during the same update.
- Player defeat has priority over mission success when both conditions would otherwise be detected together.
- Player defeat grants no mission reward.
- The MVP does not permanently destroy or remove the player aircraft after defeat.
- On defeat, the aircraft is recovered with exactly `25 Hull Integrity`, regardless of how far below `0` the damaging event reduced it.
- Emergency recovery is automatic and costs `0 Credits`.
- Defeat must not restore the aircraft to its pre-mission Hull Integrity or to maximum Hull Integrity.
- The `Mission Result Overlay` displays only:
  - `Mission Failed`;
  - `Reward: 0 Credits`;
  - `Continue`;
- selecting `Continue` returns the player to `Operations`;
- no `Retry` action is available.

## 10. Pause and player interruption

- A global `Pause Button` is visible in the upper-right corner of the `Combat Screen`.
- Combat must support pausing through `P` or `Esc`.
- Selecting the `Pause Button`, pressing `P`, or pressing `Esc` opens the same `Pause Overlay`.
- Pausing must stop active combat and display the `Pause Overlay`.
- The `Pause Overlay` must provide `Resume` and `Return to Base` actions.
- The `Pause Overlay` displays the title `Paused`.
- While the `Pause Overlay` is open, pressing `P` or `Esc` has the same result as selecting `Resume`.
- Selecting `Return to Base` does not open an additional confirmation overlay.
- Selecting `Return to Base` resolves the mission as `Aborted`.
- An `Aborted` mission grants no reward.
- The aircraft retains its current Hull Integrity; emergency recovery is not applied.
- All active enemies, projectiles, spawn schedules, and mission timers are discarded.
- The `Mission Result Overlay` is not displayed for an `Aborted` mission.
- `Mission Result Overlay` does not close through `Esc` or outside interaction; the player must select `Continue`.
- The player returns directly to `Operations`.

### 10.1 Settings integration

- A global `Settings Button` is visible in the upper-right corner of the `Combat Screen`.
- The `Settings Button` can open Settings only while Combat is active, running, and no blocking Overlay is open.
- Selecting it automatically pauses Combat and opens the blocking `Settings Overlay`.
- The MVP `Settings Overlay` contains only:
  - `Mouse Movement Enabled`;
  - `Close`.
- The Overlay uses the same composition and component implementation as Base Settings.
- `Mouse Movement Enabled` is backed by the single shared-session Settings value; Combat must not keep an independent authoritative copy.
- `Mouse Movement Enabled` reflects and controls the active movement-control mode.
- Changing it updates shared session state immediately; there is no `Save`, `Apply`, or `Reset` action.
- Changing it to enabled selects `Mouse Movement` for use when Combat resumes and disables `Keyboard Movement`.
- Changing it to disabled selects `Keyboard Movement` for use when Combat resumes and disables `Mouse Movement`.
- Pressing `F` while Combat is active, running, and no blocking Overlay is open updates the setting to match the newly active mode.
- Pressing `F` while any blocking Overlay is open is ignored.
- Selecting `Close` or pressing `Esc` closes Settings and resumes Combat unless a browser safety pause was latched while Settings was open. If latched, closing Settings opens `Pause Overlay` and requires explicit `Resume`.
- Clicking outside `Settings Overlay` does not close it.
- The `Pause Button` and `Settings Button` are global utility controls and are not part of the Combat HUD.
- The `Pause Overlay` and `Settings Overlay` cannot be open simultaneously.
- While either blocking overlay is open, attempting to open the other has no effect until the current overlay is closed.
- While Combat is already paused or any blocking Overlay is open, a command to open Settings is ignored.

### 10.2 Combat UI keyboard and accessible state

- `Pause Button` and `Settings Button` participate in sequential keyboard focus.
- Moving focus between utility controls with `Tab` or `Shift+Tab` does not pause Combat.
- `Enter` or `Space` activates a focused utility Button with the same behaviour as pointer activation.
- Opening any Combat blocking Overlay moves focus to its approved initial control and traps sequential focus until it closes.
- While a blocking Overlay is open, movement, control-mode, and utility shortcuts are ignored except the key explicitly approved for that Overlay's operation or closing behaviour.
- The Hull Integrity Bar exposes progress semantics with minimum `0`, maximum `100`, and current Hull Integrity without displaying a numeric value.
- Combat does not claim non-visual gameplay accessibility and does not add screen-reader narration of real-time Combat events.

## 11. Debug Mode

### 11.1 Availability and activation

- During MVP development, Debug Mode must be available through `F1`.
- Debug Mode is enabled only when `DEV_MODE = true`.
- When `DEV_MODE = false`, `F1` must not open Debug Mode and debug UI must not be displayed.
- During running Combat with no blocking Overlay, `F1` pauses Combat and opens `Debug Overlay`.
- While `Pause Overlay` is open, `F1` replaces it with `Debug Overlay` without resuming Combat; both Overlays are never open simultaneously.
- While Settings or Mission Result is open, `F1` is ignored.
- While Debug is open, `F1` closes it using the approved pause-state restoration rules.
- Pressing `Esc` while `Debug Overlay` is open also closes it.

### 11.2 Pause-state preservation

- Opening the `Debug Overlay` during running Combat automatically pauses Combat.
- Aircraft movement, automatic fire, enemies, projectiles, spawn schedules, and mission time stop while the overlay is open.
- Debug actions remain interactive while Combat is paused.
- Closing the overlay resumes Combat only if Combat was running immediately before the overlay opened.
- If Debug replaced `Pause Overlay`, closing Debug reopens `Pause Overlay` and preserves paused state.
- Closing through `F1` or `Esc` follows the same pause-state restoration rules.
- A browser safety pause latched while `Debug Overlay` is open overrides automatic restoration: closing Debug opens `Pause Overlay` and requires explicit `Resume`.

### 11.3 Debug actions

The MVP `Debug Overlay` provides only:

- `God Mode: On/Off`;
- `Set Hull: 25`;
- `Set Hull: 100`;
- `Spawn Standard Enemy`;
- `Spawn Final Group`;
- `Win Mission`;
- `Lose Mission`;
- `Close`.

### 11.4 God Mode and Hull controls

- While `God Mode` is enabled, player Hull Integrity is always equal to maximum Hull Integrity.
- Damage and collision events may still be processed, but they must not reduce player Hull Integrity.
- `Set Hull: 25` and `Set Hull: 100` are disabled while `God Mode` is enabled.
- Disabling `God Mode` leaves player Hull Integrity at maximum.
- `Lose Mission` disables `God Mode` before invoking the normal defeat flow.
- With `God Mode` disabled, `Set Hull: 25` and `Set Hull: 100` change Hull immediately without invoking damage effects.

### 11.5 Spawn controls

- `Spawn Standard Enemy` immediately creates one `Basic Drone` at a valid top-edge spawn position.
- `Spawn Final Group` may be used only once per mission.
- It immediately spawns the final group in addition to all enemies already active on screen.
- It does not remove, replace, or resolve existing enemies.
- It cancels all remaining scheduled spawns and sets `finalGroupSpawned = true`.
- It does not change the current mission time to `110 s`.
- After use, `Spawn Final Group` becomes disabled.

### 11.6 Forced mission results

- `Win Mission` invokes the normal success flow, including the one-time `+1 Credit` reward.
- `Lose Mission` invokes the normal defeat flow, including emergency recovery to `25 Hull Integrity`.
- Debug commands must reuse normal success and defeat resolution; they must not implement duplicate result logic.

### 11.7 Debug observability

While open, the `Debug Overlay` displays only:

```text
Mission Time
Player Hull
Active Enemies
Destroyed Enemies
Escaped Enemies
Final Group Spawned: Yes/No
```

These values do not appear in the normal Combat HUD.

## 12. Browser lifecycle

### 12.1 Supported platform

- The MVP supports desktop browsers only.
- Keyboard and mouse are required.
- Touch controls, mobile layout, and mobile orientation changes are out of scope.

### 12.2 Focus loss and hidden tab

- If the browser window loses focus or the tab becomes hidden during Combat, Combat automatically pauses.
- Mission time, spawning, movement, firing, and projectile simulation stop.
- Returning focus does not resume Combat automatically.
- The `Pause Overlay` is displayed and the player must select `Resume`.
- If `Settings Overlay` or `Debug Overlay` is already open, it remains open and a browser safety pause is latched. Closing that Overlay opens `Pause Overlay` instead of resuming Combat.
- If `Pause Overlay` is already open, no additional Overlay or pause state is created.
- Focus or visibility changes after the mission has resolved do not modify `Mission Result Overlay`, mission result, reward, or shared session state.

### 12.3 Viewport resize

- Resizing the viewport during Combat automatically pauses Combat.
- The gameplay area is recalculated for the new viewport.
- Player and active enemy positions are reprojected proportionally into the resized gameplay area.
- The player aircraft is then clamped inside its recalculated `Movement Bounds`.
- Damage and configured movement speeds are not modified by resize.
- Combat does not resume automatically; the player must select `Resume`.
- If `Settings Overlay` or `Debug Overlay` is already open, it remains open and a browser safety pause is latched. Closing that Overlay opens `Pause Overlay` instead of resuming Combat.
- If `Pause Overlay` is already open, resize does not create another Overlay.
- If `Mission Result Overlay` is open, resize reflows presentation only and does not modify the resolved mission or reward.
- Repeated resize events for the same effective viewport dimensions must not repeat gameplay-state reprojection.

### 12.4 Browser-event idempotency

- Repeated focus, visibility, or resize events must not create multiple `Pause Overlays` or multiple browser safety pause states.
- These events must not change Credits, Hull Integrity, Primary Weapon, Pilot, Settings, mission result, or reward.
- These events must not restart Combat, recreate a Combat Screen, or duplicate runtime entities, schedules, handlers, or resolution logic.

### 12.5 Page refresh

- The MVP has no persistent save or in-progress mission recovery.
- Refresh discards the entire current session and active mission without granting a reward.
- Refresh initializes a new session with:

```text
Credits = 1
Aircraft Hull Integrity = 100
Selected weapon = default weapon
Mission available = true
```

- After initialization, the player returns to `Operations`.

The default weapon is `Machine Gun`.

### 12.6 Recovery non-requirements

The MVP does not implement Combat autosave, mission resume, crash recovery, reconnect flow, save migration, or partial-state recovery.

Refresh or repeated initialization must not grant duplicate rewards or preserve a partially resolved mission state.

### 12.7 Prepared assets

- Combat uses the aircraft image prepared by the bounded Boot preload or its stable approved fallback.
- Entering Combat and resizing the viewport do not initiate another application-level request for the aircraft, fonts, or icons.
- Combat does not display a loading Overlay, spinner, progress bar, skeleton, or delayed visual replacement.

## 13. Scope control

No unresolved Combat behaviour remains in the approved MVP scope. Any behaviour not defined by this document must not be invented during implementation and requires a new product decision.

## 14. Performance budget and verification gate

### 14.1 Core rule

Every new runtime system must remain within the approved performance budget. Performance work must be performed continuously; features must not be accumulated with the intention of optimizing the game only afterward.

### 14.2 Runtime budget

```text
Target frame rate: 60 FPS
Frame-time budget: 16.7 ms
Minimum acceptable sustained frame rate: 50 FPS
```

- An isolated short frame-time spike may occur.
- Sustained performance below `50 FPS` during the representative MVP mission is not acceptable.
- Reducing gameplay speed must not be used to conceal a performance regression.

### 14.3 Reference performance device

The minimum reference profile is a 2020-era upper-budget configuration represented by `Lenovo IdeaPad 3 15IIL05 (81WE002JUS-class)`:

```text
CPU: Intel Core i3-1005G1, 2 cores / 4 threads, 1.2-3.4 GHz
GPU: integrated Intel UHD Graphics, shared memory
RAM: 8 GB DDR4
Display: 1366 x 768 at 60 Hz
OS: Windows 10 64-bit
Power: connected to AC power; normal/balanced power mode
```

This is an intentionally conservative test target: a non-gaming entry-level notebook platform with an upper-budget memory configuration. The classification is a product benchmark choice, not a claim that this exact model represented the statistical market average.

Performance acceptance must be tested at native `1366 x 768` in the latest stable Google Chrome and Microsoft Edge available for Windows 10 at test time, with the game in the foreground and non-essential extensions disabled.

Reference sources:

- [Lenovo IdeaPad 3 15IIL05 configuration 81WE002JUS](https://www.lenovo.com/us/outletus/en/p/laptops/ideapad/ideapad-300/ideapad-3-gen-5-15-inch-intel/81we002jus)
- [Lenovo IdeaPad 3 15IIL05 platform specification](https://psref.lenovo.com/syspool/Sys/PDF/IdeaPad/IdeaPad_3_15IIL05/IdeaPad_3_15IIL05_Spec.html)
- [Intel Core i3-1005G1 specification](https://www.intel.com/content/www/us/en/products/sku/196588/intel-core-i31005g1-processor-4m-cache-up-to-3-40-ghz/specifications.html)

The i3-1005G1 was launched in `Q3 2019`, and Lenovo support material for the IdeaPad 3 15IIL05 was originally published in March 2020; this places the selected platform in the intended 2020 notebook generation.

### 14.4 Representative performance scenario

Performance verification must cover a complete mission with:

- spawning through `110 s`;
- all `38 Basic Drones` scheduled;
- continuous `Machine Gun` fire;
- normal movement and contact collisions;
- mission resolution after the final enemy becomes `Destroyed` or `Escaped`.

### 14.5 Memory and lifecycle requirements

- Active entity counts must decrease when enemies and projectiles are removed.
- Completed or aborted missions must not retain obsolete enemies, projectiles, timers, spawn schedules, or event handlers.
- Five consecutive missions in one browser session must not show persistent memory growth caused by retained Combat state.

### 14.6 Implementation constraints

- Individual enemies and projectiles must not use separate DOM elements as the primary rendering path.
- Per-frame processing must not include inactive entities.
- Enemy and projectile cleanup is mandatory.
- Object pooling is permitted but is not required until profiling demonstrates a relevant allocation or garbage-collection problem.
- This specification does not select an engine, framework, or renderer.

### 14.7 Verification cadence

The representative performance scenario must be rerun:

1. after adding or materially changing any runtime Combat system;
2. after materially changing enemy count, projectile count, visual effects, collision detection, or rendering;
3. before declaring a playable milestone complete;
4. before handing a build to external testers.

Each check must record at minimum:

```text
build identifier
browser and version
viewport resolution
test device
average FPS
minimum sustained FPS
observed frame-time spikes
memory before mission
memory after five missions
```

If the check is missing or the approved budget is violated, the affected system or milestone is not complete.

## 15. Acceptance criteria for resolved scope

### AC-001 — Full-screen combat area

**Given** the player enters the `Combat Screen`,  
**when** the screen is displayed,  
**then** the combat gameplay area occupies the full available viewport and is not restricted to a narrow arcade playfield.

### AC-002 — MVP background

**Given** the `Combat Screen` is displayed,  
**when** no overlay obscures it,  
**then** the background is solid black and contains no terrain, tiles, texture, image, animation, parallax, weather, or environmental objects.

### AC-003 — Minimal combat HUD

**Given** the player aircraft is visible,  
**when** combat is active,  
**then** a horizontal `Hull Integrity` bar without a numeric value is displayed directly below the aircraft and no excluded HUD elements are shown.

### AC-004 — Mouse Movement

**Given** `Mouse Movement` is active,  
**when** the cursor is away from the aircraft,  
**then** the aircraft accelerates toward the cursor using its configured movement limits and does not teleport.

### AC-005 — Mouse target reached

**Given** `Mouse Movement` is active,  
**when** the aircraft reaches the cursor target,  
**then** it decelerates until it stops at the target.

### AC-006 — Exclusive control modes

**Given** either movement-control mode is active,  
**when** the player presses `F`,  
**then** the other mode becomes active and movement input from the inactive mode is ignored.

### AC-007 — Normalized keyboard movement

**Given** `Keyboard Movement` is active,  
**when** the player holds inputs for two axes simultaneously,  
**then** the aircraft moves diagonally without exceeding its configured maximum speed.

### AC-008 — Movement bounds

**Given** the aircraft approaches any gameplay-area edge,  
**when** movement would cross the agreed boundary,  
**then** the complete rendered sprite remains within the visible area with a margin equal to `3% of viewport short side` from every edge.

### AC-009 — Enemy global direction

**Given** an enemy enters from the top, left, or right side,  
**when** it moves through the combat space,  
**then** its global movement includes progression from the top of the screen toward the bottom.

### AC-010 — Defeat trigger

**Given** the player aircraft receives damage,  
**when** its `Hull Integrity` reaches `0`,  
**then** the active combat ends as a player defeat.

### AC-011 — Contact damage

**Given** the player aircraft and an active `Basic Drone` have no contact-damage cooldown,  
**when** their hitboxes collide,  
**then** both objects receive exactly `25` damage as one collision event, the `Basic Drone` enters `Destroyed`, and the player aircraft receives the contact-damage cooldown.

### AC-012 — Contact-damage cooldown

**Given** a valid aircraft–enemy contact collision has been resolved,  
**when** the player collides with the same or another `Basic Drone` during the next `0.5 s`,  
**then** no additional contact damage is applied to the player, the drone still receives `25` damage and is destroyed, and the existing cooldown is not restarted or extended.

### AC-013 — Collision response

**Given** the player aircraft collides with a `Basic Drone`,  
**when** collision damage is resolved,  
**then** the drone is destroyed and removed without knockback, stun, momentum transfer, overlap resolution, or forced change to player velocity.

### AC-014 — Basic Drone durability

**Given** a `Basic Drone` has full Hull Integrity,  
**when** it receives a total of `3` damage,  
**then** it enters the `Destroyed` state.

### AC-015 — Regular spawn schedule

**Given** the mission is active and the final group has not been forced through Debug Mode,  
**when** mission time reaches `0, 10, 20, ..., 100 s`,  
**then** one regular group of exactly `3 Basic Drones` spawns.

### AC-016 — Scheduled final group

**Given** the mission reaches `110 s`,  
**when** the final scheduled spawn is processed,  
**then** exactly `5 Basic Drones` spawn and no later enemy spawn remains scheduled.

### AC-017 — Side-entry trajectory

**Given** a `Basic Drone` selects a left or right side-entry region,  
**when** it spawns,  
**then** its full hitbox begins outside that side boundary, it travels in a straight line to one fixed waypoint inside the `40%-60% × 20%-40%` central upper zone, and then proceeds straight downward without pursuing the player.

### AC-018 — Off-screen enemy resolution

**Given** an enemy has entered the visible gameplay area at least once,  
**when** its entire hitbox later exits through any viewport boundary,  
**then** it enters `Escaped`, is removed from active Combat, does not return, and causes no damage, failure, or reward penalty.

### AC-019 — Automatic Primary Weapon fire

**Given** active Combat has begun,  
**when** the player provides no firing input,  
**then** the `Primary Weapon` immediately creates its first projectile and continues firing toward the top of the screen at its configured `fireRate`.

### AC-020 — Firing during pause

**Given** Combat is paused,  
**when** one or more firing intervals elapse,  
**then** no projectiles are created and resuming Combat does not create shots for those elapsed intervals.

### AC-021 — Projectile removal outside bounds

**Given** a player projectile has not hit an enemy,  
**when** its complete rendered bounds leave the `Combat Screen`,  
**then** it is removed from active Combat.

### AC-022 — Projectile lifetime

**Given** a projectile has neither hit an enemy nor left the `Combat Screen`,  
**when** its lifetime reaches `2 s`,  
**then** it is removed from active Combat.

### AC-023 — Projectile hit

**Given** a player projectile collides with a valid enemy hitbox,  
**when** the collision is resolved,  
**then** the enemy loses exactly the projectile's configured `damage`, the projectile is removed, and it cannot damage another enemy.

### AC-024 — Enemy destruction

**Given** an enemy's `Hull Integrity` is reduced to `0` or below,  
**when** the damaging hit is resolved,  
**then** the enemy immediately enters `Destroyed`, stops all gameplay behaviour and collisions, is counted exactly once, displays a white flash without a hitbox for `100 ms`, and disappears.

### AC-025 — Machine Gun damage profile

**Given** a full-Hull `Basic Drone` receives only `Machine Gun` hits,  
**when** the third projectile hits,  
**then** the drone is destroyed, while either of the first two hits alone is insufficient.

### AC-026 — Cannon damage profile

**Given** a full-Hull `Basic Drone` is hit by one `Cannon` projectile,  
**when** its `3` damage is applied,  
**then** the drone is destroyed.

### AC-027 — Approved fire rates

**Given** Combat is running continuously,  
**when** the equipped weapon automatically fires,  
**then** the `Machine Gun` fires at `6 shots/s` and the `Cannon` fires at `2 shots/s`.

### AC-028 — Final enemy group

**Given** Combat has reached `110 s`,  
**when** the final enemy group is spawned,  
**then** no additional enemy groups are scheduled or spawned during that mission.

### AC-029 — Enemy escape

**Given** an active enemy reaches the bottom of the `Combat Screen`,  
**when** its hitbox passes completely beyond the bottom boundary,  
**then** it enters `Escaped`, is removed from active Combat, does not return, and causes no damage, failure, or reward penalty.

### AC-030 — Mission duration

**Given** one or more active enemies remain after `120 s`,  
**when** the player aircraft remains operational,  
**then** Combat continues until every remaining enemy becomes `Destroyed` or `Escaped`.

### AC-031 — Mission success

**Given** the final enemy group has spawned and the player has `Hull Integrity > 0`,  
**when** the final active enemy becomes `Destroyed` or `Escaped`,  
**then** the mission immediately ends in success.

### AC-032 — Defeat priority

**Given** player defeat and mission success could be detected during the same update,  
**when** player `Hull Integrity <= 0`,  
**then** the mission ends in defeat and success is not granted.

### AC-033 — Emergency recovery after defeat

**Given** the mission ends in player defeat,  
**when** defeat resolution is applied,  
**then** the player receives no mission reward, pays no recovery cost, retains the aircraft, and its Hull Integrity is set to exactly `25`.

### AC-034 — Success resolution

**Given** the mission-success conditions are satisfied,  
**when** success is resolved,  
**then** the aircraft retains its current Hull Integrity, exactly `1 Credit` is granted once, and the `Mission Result Overlay` displays `Mission Complete`, `Reward: 1 Credit`, and `Continue` only.

### AC-035 — Defeat result

**Given** player defeat has been resolved,  
**when** the `Mission Result Overlay` opens,  
**then** it displays `Mission Failed`, `Reward: 0 Credits`, and `Continue` only, with no `Retry` action.

### AC-036 — Continue from result

**Given** the `Mission Result Overlay` is open after success or defeat,  
**when** the player selects `Continue`,  
**then** the player returns to `Operations` without applying the result or reward a second time.

### AC-037 — Return to Base

**Given** the `Pause Overlay` is open during active Combat,  
**when** the player selects `Return to Base`,  
**then** the mission becomes `Aborted`, no reward or emergency recovery is applied, current aircraft Hull Integrity is retained, active Combat state is discarded, and the player returns directly to `Operations` without another confirmation or a `Mission Result Overlay`.

### AC-038 — Settings integration

**Given** Combat is running,  
**when** the player selects the upper-right `Settings Button`,  
**then** Combat pauses, the shared `Settings Overlay` opens with `Mouse Movement Enabled` and `Close` only, changing the setting immediately updates shared session state and the mutually exclusive control mode, and selecting `Close` or pressing `Esc` resumes Combat unless a browser safety pause was latched.

### AC-039 — Open Debug Overlay

**Given** `DEV_MODE = true` and Combat is running,  
**when** the player presses `F1`,  
**then** Combat pauses and the `Debug Overlay` opens with its approved actions and observability values.

### AC-040 — Preserve prior pause state

**Given** `DEV_MODE = true` and `Pause Overlay` is open,  
**when** the player presses `F1` and later closes `Debug Overlay`,  
**then** Debug temporarily replaces Pause, both are never open simultaneously, and closing Debug reopens `Pause Overlay` without resuming Combat.

### AC-041 — God Mode

**Given** `God Mode` is enabled,  
**when** the player receives any amount of damage,  
**then** player Hull Integrity remains equal to maximum Hull Integrity.

### AC-042 — Debug final group

**Given** the final group has not yet spawned and other enemies may be active,  
**when** `Spawn Final Group` is selected,  
**then** existing enemies remain, the final group spawns immediately, future scheduled spawns are cancelled, mission time is unchanged, `finalGroupSpawned` becomes true, and the action becomes disabled.

### AC-043 — Debug forced result

**Given** the `Debug Overlay` is open,  
**when** `Win Mission` or `Lose Mission` is selected,  
**then** the corresponding normal mission-resolution flow is invoked without duplicating result or reward processing.

### AC-044 — Focus loss

**Given** Combat is running,  
**when** the browser loses focus or the tab becomes hidden,  
**then** Combat pauses and remains paused after focus returns until the player selects `Resume`.

### AC-045 — Viewport resize

**Given** Combat is running,  
**when** the viewport is resized,  
**then** Combat pauses, gameplay positions are proportionally reprojected, the aircraft is clamped inside recalculated `Movement Bounds`, and manual `Resume` is required.

### AC-046 — Refresh reset

**Given** any base or Combat state is active,  
**when** the page is refreshed,  
**then** the previous session is discarded without reward and a new session opens in `Operations` with `1 Credit`, `100` aircraft Hull Integrity, the default weapon, and the mission available.

### AC-047 — Representative performance scenario

**Given** the representative MVP mission runs on the approved reference device at native `1366 x 768` in the required Chrome and Edge test environments,  
**when** the complete mission is executed with continuous `Machine Gun` fire,  
**then** it targets `60 FPS`, does not remain below `50 FPS`, and its verification results are recorded.

### AC-048 — Repeated mission cleanup

**Given** five missions are completed or aborted in one browser session,  
**when** memory and active runtime objects are inspected,  
**then** no obsolete Combat entities, timers, schedules, or handlers remain and Combat state does not cause persistent memory growth.

### AC-049 — Collision geometry

**Given** Combat entities are rendered,  
**when** collision hitboxes are created,  
**then** the `Basic Drone` is a `4% viewport-short-side` square with a matching hitbox, and the player hitbox is centered at `60%` of rendered aircraft width and `70%` of rendered aircraft height.

### AC-050 — Projectile geometry

**Given** either Primary Weapon creates a projectile,  
**when** the projectile is rendered and collision-enabled,  
**then** its horizontal center matches the aircraft center, its bottom edge matches the aircraft top edge, it measures `0.5% × 1.5%` of viewport short side, and uses its full rendered bounds as its hitbox.

### AC-051 — Enemy–enemy overlap

**Given** two or more `Basic Drones` overlap,  
**when** their hitboxes intersect,  
**then** they cause no damage, displacement, trajectory change, or separation response.

### AC-052 — Utility controls and overlay exclusivity

**Given** Combat is visible,  
**when** the player selects `Pause Button`, presses `P`, or presses `Esc`,  
**then** the same `Pause Overlay` opens; and while either `Pause Overlay` or `Settings Overlay` is open, the other cannot open until the current overlay closes.

### AC-053 — Player aircraft rendering

**Given** Combat renders the player aircraft,  
**when** the viewport is initialized or resized,  
**then** `german-fighter.png` renders pointing upward at `8% of viewport short side` in height, preserves its aspect ratio, and is not cropped, deformed, rotated, or animated.

### AC-054 — Basic Drone presentation

**Given** a `Basic Drone` is active,  
**when** it is rendered,  
**then** it appears as a solid `danger` square without outline, texture, image asset, animation, rotation, or health bar.

### AC-055 — Projectile presentation

**Given** either Primary Weapon creates a projectile,  
**when** it is rendered,  
**then** it appears as the same solid `text-primary` rectangle without outline, trail, glow, particle effect, or animation.

### AC-056 — Aircraft visual fallback

**Given** `german-fighter.png` fails to load,  
**when** Combat initializes,  
**then** a solid light-grey upward triangle uses the approved aircraft rendered bounds and collision geometry, Combat remains playable, and no broken-image marker appears.

### AC-057 — Combat Hull bar geometry

**Given** the player aircraft is rendered,  
**when** the Hull Integrity bar is positioned or the viewport is resized,  
**then** the bar is horizontally centred below the aircraft, has width equal to `65%` of rendered aircraft width, height `0.5rem`, gap equal to `1% of viewport short side`, retains the current Hull ratio, and does not affect collision or Movement Bounds.

### AC-058 — Non-destroying enemy-hit feedback

**Given** a projectile damages a `Basic Drone` without reducing its Hull Integrity to `0` or below,  
**when** the hit is resolved,  
**then** damage is applied immediately, the active drone flashes white for exactly `50 ms`, returns to `danger`, retains its hitbox and gameplay behaviour, and produces no particles, glow, screen shake, or sound.

### AC-059 — Player contact-damage feedback

**Given** a valid aircraft–enemy contact collision reduces player Hull Integrity,  
**when** the collision is resolved,  
**then** Hull Integrity and its Bar update in the same frame, the aircraft flashes `danger` for exactly `100 ms`, and no knockback, screen shake, particles, or sound is produced.

### AC-060 — Damage feedback during contact cooldown

**Given** the player's contact-damage cooldown is active,  
**when** another `Basic Drone` collides with the aircraft,  
**then** player Hull Integrity is unchanged, the aircraft damage flash is not replayed, and the drone still receives `25` damage and uses the approved destruction feedback.

### AC-061 — Damage feedback during God Mode

**Given** `God Mode` is enabled,  
**when** the aircraft receives an incoming damage event,  
**then** player Hull Integrity remains at maximum and the aircraft damage flash is not displayed, while enemy contact damage and destruction feedback remain unchanged.

### AC-062 — Immediate defeat presentation

**Given** valid damage reduces player Hull Integrity to `0`,  
**when** defeat is resolved,  
**then** the Defeat `Mission Result Overlay` opens without waiting for the aircraft damage flash to finish.

### AC-063 — Settings unavailable while blocked or paused

**Given** Combat is paused or any blocking Overlay is open,  
**when** the player attempts to open `Settings Overlay`,  
**then** the command is ignored and the current pause or Overlay state is unchanged.

### AC-064 — Settings shortcut synchronization

**Given** Combat is active, running, and no blocking Overlay is open,  
**when** the player presses `F`,  
**then** the mutually exclusive control mode changes and the single shared-session `Mouse Movement Enabled` value changes to match it.

### AC-065 — Blocking Overlay ignores control-mode shortcut

**Given** any Combat blocking Overlay is open,  
**when** the player presses `F`,  
**then** the control mode and `Mouse Movement Enabled` remain unchanged.

### AC-066 — Browser safety pause during Combat Overlay

**Given** `Settings Overlay` or `Debug Overlay` is open during Combat,  
**when** the browser loses focus, the tab becomes hidden, or the viewport is resized,  
**then** the current Overlay remains open, Combat remains paused, and closing that Overlay opens one `Pause Overlay` instead of resuming Combat.

### AC-067 — Browser event during Pause Overlay

**Given** `Pause Overlay` is already open,  
**when** focus, visibility, or viewport-size events occur one or more times,  
**then** no additional blocking Overlay or duplicate pause state is created and explicit `Resume` remains required.

### AC-068 — Browser event after mission resolution

**Given** `Mission Result Overlay` is open,  
**when** the browser loses focus, the tab becomes hidden, or the viewport is resized,  
**then** the Overlay remains the required continuation point and the mission result, reward, and shared session state are not applied or changed again.

### AC-069 — Browser-event idempotency

**Given** repeated focus, visibility, or resize events occur during one Combat state,  
**when** they are processed,  
**then** they do not duplicate Pause Overlays, safety-pause state, entity reprojection for unchanged dimensions, Combat runtime objects, or result processing.

### AC-070 — Initial Combat aircraft state

**Given** Combat begins,  
**when** the player aircraft is initialized,  
**then** its center is at `50%` viewport width and `80%` viewport height, its velocity is `0`, its complete sprite is inside `Movement Bounds`, and its initial mouse target equals its center.

### AC-071 — Initial mouse-target activation

**Given** Combat began with `Mouse Movement` active and no pointer movement has occurred inside the Combat viewport,  
**when** movement updates run,  
**then** the aircraft remains at rest; pointer movement inside the viewport updates the target, while pointer movement outside does not.

### AC-072 — Exact enemy entry placement

**Given** a `Basic Drone` is created for top, left, or right entry,  
**when** its spawn position is assigned,  
**then** its complete hitbox is outside the visible area with its nearest edge touching the corresponding viewport boundary and no additional hidden offset.

### AC-073 — Valid spawn-axis range

**Given** a drone receives a random spawn coordinate,  
**when** it uses top or side entry,  
**then** its complete hitbox fits respectively within the viewport width or within the viewport's upper half on the non-entry axis.

### AC-074 — Simultaneous independent group spawn

**Given** an enemy group reaches its scheduled spawn time,  
**when** its drones are created,  
**then** all are created at that mission-time instant and independently select valid entry data, while overlap causes no repositioning or separation.

### AC-075 — Enemy entry presentation

**Given** a newly created drone is fully outside the viewport,  
**when** it begins moving into view,  
**then** its hitbox is already active, its visible portion appears naturally across the boundary, and no marker, warning, protection, fade, or entry animation is added.

### AC-076 — Projectile muzzle placement

**Given** the Primary Weapon fires,  
**when** a projectile is created,  
**then** its horizontal center matches the aircraft center, its bottom edge matches the aircraft top edge, it is immediately visible and collision-active, and no muzzle flash or randomized offset is produced.

### AC-077 — Projectile viewport exit

**Given** a projectile is crossing a viewport boundary without hitting an enemy or reaching its lifetime,  
**when** any part remains visible,  
**then** it remains active and is removed only after its complete rendered bounds leave the viewport.

### AC-078 — Combat render order

**Given** Combat objects overlap visually,  
**when** they are rendered,  
**then** they follow the approved background–drone–projectile–aircraft–Hull Bar–utility–Overlay order without changing collision or damage resolution.

### AC-079 — Combat utility keyboard operation

**Given** Combat is active and no blocking Overlay is open,  
**when** keyboard focus reaches Pause or Settings and the player presses `Enter` or `Space`,  
**then** the same pause or Settings flow occurs as with pointer activation, while moving focus with `Tab` alone does not pause Combat.

### AC-080 — Combat Overlay focus

**Given** a Combat blocking Overlay opens,  
**when** keyboard focus is assigned and the player navigates with `Tab` or `Shift+Tab`,  
**then** focus starts on the approved initial control, remains inside the Overlay, and gameplay shortcuts are suppressed except its explicitly approved close or operation shortcut.

### AC-081 — Combat Hull progress semantics

**Given** player Hull Integrity changes,  
**when** the Hull Integrity Bar updates,  
**then** its accessible progress value updates immediately between minimum `0` and maximum `100` without adding a visible number.

### AC-082 — Combat uses prepared assets

**Given** bounded Boot preload has completed,  
**when** Combat opens or resizes,  
**then** it uses the prepared aircraft asset or stable fallback and prepared UI assets without another loading state, repeated application request, or late visual replacement.

## 16. Readiness verdict

**PRODUCT SCOPE READY.**

The cross-document master and final technical audits passed on `2026-08-20`. No unresolved S0–S2 Combat product or technical behaviour remains. Combat implementation is authorized through explicitly assigned feature slices. Performance verification remains a recurring completion gate during implementation.

# MVP Base and Pre-Combat Specification v0.1

**Product:** Shmup  
**Scope:** Base Navigation and pre-Combat MVP flow  
**Status:** READY FOR IMPLEMENTATION  

## 1. Purpose

This document defines the MVP product behaviour for `Base Navigation`, `Operations Screen`, `Mission Details Overlay`, `Hangar Screen`, `Weapon Selection Overlay`, and `Repair`, including their shared state and transition into the `Combat Screen`.

Behaviour not defined here must not be invented during implementation and requires a product decision.

All Base and pre-Combat UI must comply with `MVP_DESIGN_SYSTEM_SPEC_v0.1.md`. The feature requirements in this document define product behaviour; the Design System specification defines shared visual primitives, composition rules, and implementation governance.

## 2. Canonical terminology

- `Base Screen` — a strategic-level screen accessible through `Base Navigation`.
- `Operations Screen` — the Base Screen used to view and select the available mission.
- `Hangar Screen` — the Base Screen used to inspect and configure the aircraft.
- `Base Navigation` — the persistent navigation between Base Screens.
- `Mission Details Overlay` — the blocking overlay opened from the selected mission point.
- `Weapon Selection Overlay` — the blocking overlay used to select the Primary Weapon.
- `Settings Overlay` — the global blocking utility overlay.

Do not use `Operational Screen` as a synonym for `Operations Screen`.

## 3. Base Navigation

### 3.1 Base Screens

The MVP contains exactly two Base Screens:

1. `Operations Screen`.
2. `Hangar Screen`.

The `Combat Screen` is not a Base Screen and does not use `Base Navigation`.

### 3.2 Layout

- `Base Navigation` is a persistent vertical panel on the left side of every Base Screen.
- Base Screen content occupies the remaining viewport area.
- `Base Navigation` is not displayed on the `Combat Screen`.

### 3.3 Navigation items

The navigation items appear in this fixed order:

1. `Operations`.
2. `Hangar`.

Each item has:

- a simple icon;
- a text label;
- an active state when its corresponding screen is current.

Future sections such as Research, Engineering, or Personnel must not appear as disabled placeholders.

### 3.4 Navigation behaviour

- Selecting an inactive navigation item opens its corresponding Base Screen.
- Selecting the active navigation item does nothing and must not reload or reset the screen.
- Navigation does not change Credits, Aircraft Hull Integrity, equipped Primary Weapon, or Pilot.
- Base Screen transition animation is not included in the MVP.
- A new session or page refresh opens the `Operations Screen`.

### 3.5 Blocking overlays

While `Mission Details Overlay`, `Weapon Selection Overlay`, or `Settings Overlay` is open:

- `Base Navigation` remains visible;
- `Base Navigation` is non-interactive;
- the player cannot change Base Screen until the blocking overlay closes.

### 3.6 Global Settings

- A global `Settings Button` is visible in the upper-right corner of every Base Screen.
- `Settings Button` is not a `Base Navigation` item.
- Selecting it opens the blocking `Settings Overlay`.
- The MVP `Settings Overlay` contains only:
  - `Mouse Movement Enabled`;
  - `Close`.
- `Mouse Movement Enabled` is a canonical Checkbox backed by the single shared-session Settings value.
- Changing the Checkbox updates shared session state immediately; there is no `Save`, `Apply`, or `Reset` action.
- Selecting `Close` or pressing `Esc` closes `Settings Overlay` without changing the current Base Screen.
- Clicking outside `Settings Overlay` does not close it.
- The setting is retained during the current session.
- Pressing `F` on a Base Screen or while any Base blocking Overlay is open has no Settings or control-mode effect.
- Page refresh restores:

```text
Mouse Movement Enabled = true
```

### 3.7 Negative requirements

The MVP `Base Navigation` does not include:

- `Combat`;
- Settings as a navigation item;
- unavailable future sections;
- notification badges;
- counters;
- tooltips;
- nested menus;
- collapse or expand behaviour;
- transition animation;
- keyboard shortcuts.

### 3.8 Responsive layout contract

- The minimum supported viewport is `1280 × 600` CSS pixels.
- At and above the minimum supported viewport, Base Screens and blocking overlays must remain fully usable without clipped required controls or horizontal page scrolling.
- Layout dimensions, spacing, and typography must scale responsively within explicit minimum and maximum bounds.
- Implementations may use relative CSS units and bounded fluid sizing such as `%`, `vw`, `vh`, `rem`, and `clamp()`.
- Percentage-only sizing is not required and must not be used where it would make text or interactive controls illegibly small or excessively large.
- Behaviour below `1280 × 600` is outside the MVP support contract and must not drive a separate mobile or compact layout.
- The MVP does not include mobile, touch, portrait, or orientation-change layouts.

## 4. Operations Screen

### 4.1 Purpose

The `Operations Screen` is used only to select and start the available mission. It is not used to inspect or configure the aircraft.

### 4.2 Layout

The content area contains only:

- a strategic-map background image;
- one active mission point;
- a compact `Credits Panel`;
- the global `Settings Button`.

If the background asset fails to load, the screen displays a solid dark fallback while keeping the mission point and `Credits Panel` functional.

The implementation must load the runtime background asset from:

```text
assets/runtime/backgrounds/operations-background.webp
```

The JPEG under `assets/source/backgrounds/` is source material and must not be loaded by the game at runtime.

### 4.3 Credits Panel

- The `Credits Panel` is positioned in the upper-left corner of the content area.
- It displays only:

```text
Credits: <current value>
```

- Credits are represented as a non-negative integer.
- The MVP has no currency animation, income breakdown, or forecast.
- After mission success, the displayed value updates when the player returns to `Operations Screen`.
- Defeat and `Aborted` do not change Credits.

### 4.4 Mission point

The MVP displays exactly one active mission point:

- canonical mission type: `Interception`;
- always available on the `Operations Screen`;
- configured using viewport-relative coordinates;
- initial position:

```text
x = 50% of content width
y = 50% of content height
```

The mission point contains:

- a simple marker;
- the short label `Interception`;
- an interactive hover state;
- an interactive pressed state.

The mission point has no locked, completed, or expired state in the MVP.

### 4.5 Interaction

Selecting the mission point:

- opens the blocking `Mission Details Overlay`;
- does not change the current Base Screen navigation state;
- leaves the map, `Credits Panel`, and `Base Navigation` visible beneath the overlay;
- makes every underlying element non-interactive.

`Start Mission` exists only inside the `Mission Details Overlay`; it is not displayed directly on the `Operations Screen`.

### 4.6 Return behaviour

After mission Success, Defeat, or `Aborted`:

- the player returns to the `Operations Screen`;
- the mission point is available again;
- the point starts a new instance of the same `Interception` mission;
- enemies, timers, and runtime state from the previous mission are not restored.

### 4.7 Negative requirements

The `Operations Screen` does not display:

- aircraft;
- Hull Integrity;
- equipped weapon;
- Pilot;
- Repair;
- Hangar shortcut;
- `Open Hangar`;
- mission-objective text;
- enemy information;
- score;
- mission history;
- multiple missions;
- map pan or zoom;
- map scrolling;
- animated map effects.

## 5. Mission Details Overlay

### 5.1 Purpose

The `Mission Details Overlay` asks only whether the player wants to start the available `Interception` mission now.

### 5.2 Content and action order

The overlay displays exactly:

```text
Interception

Resolve the incoming enemy wave.

Reward: 1 Credit

[Start Mission] [Cancel]
```

`Start Mission` is the left action. `Cancel` is the right action.

### 5.3 Aircraft selection

- The MVP has only one aircraft, so the overlay does not display an aircraft selector.
- The current aircraft and equipped Primary Weapon are used automatically.
- Aircraft selection must not be added until more than one aircraft is available.

### 5.4 Opening and closing

- Selecting the mission point opens the overlay.
- The overlay blocks all interaction with the underlying `Operations Screen`.
- Clicking outside the overlay does not close it.
- Selecting `Cancel` or pressing `Esc` closes it and returns to the unchanged `Operations Screen`.
- Underlying `Base Navigation` and `Settings Button` remain visible but non-interactive.

### 5.5 Start Mission

- `Start Mission` is always available.
- It does not spend Credits.
- It does not require maximum Hull Integrity.
- It uses the current Hull Integrity, Pilot, and equipped Primary Weapon.
- It creates one new runtime instance of the `Interception` mission.
- It closes Base UI and opens the `Combat Screen`.
- The action becomes non-interactive immediately after selection to prevent duplicate mission creation.

### 5.6 Initialization failure

If Combat initialization fails:

- the `Combat Screen` does not open;
- no active mission instance remains;
- Credits, Hull Integrity, and equipped Primary Weapon remain unchanged;
- the overlay remains open;
- `Start Mission` becomes interactive again;
- the overlay displays `Unable to start mission.`

### 5.7 Negative requirements

The overlay does not include:

- aircraft selection;
- `Open Hangar`;
- Repair;
- Pilot;
- equipped Primary Weapon;
- Hull Integrity;
- enemy list;
- mission duration;
- difficulty;
- optional objectives;
- intelligence;
- multiple rewards;
- an additional confirmation after `Start Mission`.

## 6. Hangar Screen

### 6.1 Purpose

The `Hangar Screen` is used only to inspect aircraft state, view the Pilot, select the Primary Weapon, and perform Repair. A mission cannot be started from the Hangar.

### 6.2 Composition

- The Hangar background fills the Base Screen content area.
- `Aircraft Configuration Panel` is positioned immediately to the right of `Base Navigation`.
- The aircraft image is centered in the remaining content area.
- The global `Settings Button` remains in the upper-right corner.

### 6.3 Aircraft Configuration Panel

The panel displays content in this exact order:

```text
German Fighter

Pilot
<current pilot name>

Hull Integrity
[visual bar]
<current> / 100

Primary Weapon
<Machine Gun or Cannon>
[Change Weapon]

Repair
Credits: <current value>
Cost: 1 Credit
[Repair]
```

- The Repair section is displayed only when the aircraft is damaged.
- Exact Repair availability and action behaviour are defined in the Repair section of this specification.

### 6.4 Aircraft visual

- The approved `German Fighter` image is used.
- It scales while preserving its aspect ratio.
- It must not overlap `Aircraft Configuration Panel`, `Base Navigation`, or `Settings Button`.
- The aircraft visual has no rotation, drag, zoom, or animation.
- If the asset fails to load, a neutral placeholder labelled `German Fighter` is displayed while UI remains functional.

The implementation must load the aircraft asset from:

```text
assets/runtime/aircraft/german-fighter.png
```

The `Hangar Screen` must load its runtime background asset from:

```text
assets/runtime/backgrounds/hangar-background.webp
```

The JPEG under `assets/source/backgrounds/` is source material and must not be loaded by the game at runtime.

### 6.5 Navigation behaviour

- Entering the Hangar does not change aircraft state.
- Navigation between Operations and Hangar retains Credits, Hull Integrity, Pilot, and equipped Primary Weapon.
- Returning from Hangar to Operations does not open `Mission Details Overlay` automatically.

### 6.6 Actions

The Hangar provides only two product actions:

- `Change Weapon`;
- `Repair`, when available.

`Change Weapon` opens the blocking `Weapon Selection Overlay`.

### 6.7 Negative requirements

The Hangar does not include:

- `Launch`;
- `Start Mission`;
- mission point;
- mission details;
- aircraft selector;
- aircraft speed;
- aircraft upgrades;
- modules;
- secondary weapon;
- ammunition;
- aircraft rotation;
- multiple configuration panels;
- real national military symbols.

## 7. Weapon Selection Overlay

### 7.1 Purpose

The blocking `Weapon Selection Overlay` allows the player to select exactly one of the two available Primary Weapons: `Machine Gun` or `Cannon`. It is part of the Hangar flow and is not a separate Screen.

### 7.2 Content

```text
Select Primary Weapon

○ Machine Gun
  High fire rate, low damage.
  Damage: 1
  Fire Rate: 6 shots/s
  Destroys Basic Drone: 3 hits

○ Cannon
  High damage, lower fire rate.
  Damage: 3
  Fire Rate: 2 shots/s
  Destroys Basic Drone: 1 hit

[Confirm] [Cancel]
```

`Confirm` is the left action. `Cancel` is the right action.

### 7.3 Initial state

- The currently equipped weapon is selected when the overlay opens.
- The MVP default equipped weapon is `Machine Gun`.
- Both weapons are always displayed and available.
- The MVP has no weapon purchase, unlock, or ownership state.

### 7.4 Selection behaviour

- Selecting a weapon option changes only the pending selection.
- The equipped weapon does not change before `Confirm`.
- Exactly one weapon can be selected at a time.
- `Confirm` equips the selected weapon, closes the overlay, and immediately updates `Aircraft Configuration Panel`.
- Confirming the already equipped weapon makes no state change and closes the overlay.

### 7.5 Cancel behaviour

- `Cancel` or `Esc` closes the overlay and discards the pending selection.
- Cancel does not change the equipped weapon.
- Clicking outside the overlay does not close it.

### 7.6 State persistence

The equipped weapon:

- persists during Operations–Hangar navigation;
- is used by the next Combat mission;
- persists after Success, Defeat, and `Aborted`;
- resets to `Machine Gun` after page refresh because the MVP has no Save.

### 7.7 Negative requirements

The overlay does not display:

- DPS;
- projectile speed;
- overall weapon rating;
- `Best Choice`;
- coloured ranking;
- armour penetration;
- range;
- ammunition;
- price;
- upgrades;
- unavailable weapons;
- enemy comparison beyond hits required to destroy a `Basic Drone`.

## 8. Repair

### 8.1 Availability

- Repair exists only in the `Hangar Screen`.
- The Repair section is visible only when `currentHullIntegrity < 100`.
- At full Hull Integrity, the entire Repair section is hidden rather than disabled.

### 8.2 Display and enabled state

For a damaged aircraft, the section displays:

```text
Repair

Credits: <current value>
Cost: 1 Credit

[Repair]
```

- With `Credits >= 1`, `Repair` is enabled.
- With `Credits = 0`, `Repair` is disabled.
- No separate `Insufficient Credits` message is displayed because current Credits and Cost provide the required explanation.

### 8.3 Repair action

An enabled Repair action applies atomically:

```text
Credits -= 1
currentHullIntegrity = 100
```

After success:

- Hull bar and `100 / 100` update;
- displayed Credits update;
- the Repair section disappears;
- `Aircraft Configuration Panel` remains visible.

### 8.4 Repeated-action protection

- The button becomes non-interactive immediately after selection.
- Repeated input cannot spend another Credit.
- One Repair action spends exactly `1 Credit`.

### 8.5 Failure safety

If Repair cannot complete:

- Credits are not spent;
- Hull Integrity does not change;
- the Repair section remains visible;
- the button returns to the correct enabled or disabled state;
- no partially applied Repair state may remain.

### 8.6 Related behaviour

- Repair is not required before `Start Mission`.
- A mission may start with any Hull Integrity above `0`.
- Emergency recovery to `25` after Defeat prevents a repair-related soft lock.
- Repair is not automatic after Success, Defeat, or `Aborted`.
- Repair does not change the equipped weapon or Pilot.
- Page refresh resets the session to `Credits = 1` and Hull Integrity `100`.

### 8.7 Negative requirements

The MVP Repair does not include:

- confirmation overlay;
- partial Repair;
- Repair animation;
- Repair duration;
- multiple prices;
- price formula;
- Repair materials;
- automatic Repair;
- Repair outside the Hangar;
- spending a Credit at full Hull Integrity;
- negative Credits.

## 9. Shared Session State and Integration

### 9.1 Initial session state

A new session or page refresh creates:

```text
Current Screen = Operations
Credits = 1
Aircraft = German Fighter
Hull Integrity = 100
Primary Weapon = Machine Gun
Mouse Movement Enabled = true
Mission Available = true
Active Mission = none
```

### 9.2 Pilot

One Pilot is selected with equal probability when the session is created from this fixed list:

```text
Олександр Коваленко
Іван Петренко
Марія Бондар
Андрій Шевченко
Олена Мельник
Наталія Ткаченко
```

- Navigation does not change the Pilot.
- A new Pilot can be selected only when a new session is created.
- The Pilot has no nation label, stats, traits, bonuses, or progression.

### 9.3 State ownership

- Credits, Hull Integrity, Pilot, equipped Primary Weapon, and Settings use one shared session state.
- Screens and overlays read or modify this state only through the actions defined in this specification.
- Screens and overlays must not maintain independent authoritative copies of these values.

### 9.4 Mission start

`Start Mission` provides Combat with:

```text
Aircraft
current Hull Integrity
equipped Primary Weapon
Pilot
Mouse Movement Enabled
```

While `Active Mission` exists:

- a second mission cannot start;
- Base Screens are unavailable;
- Base state cannot be changed through Base UI.

### 9.5 Mission result integration

#### Success

```text
Credits += 1
Hull Integrity = Combat result Hull Integrity
Primary Weapon retained
Pilot retained
Active Mission = none
Continue returns to Operations
```

#### Defeat

```text
Credits unchanged
Hull Integrity = 25
Primary Weapon retained
Pilot retained
Active Mission = none
Continue returns to Operations
```

#### Aborted

```text
Credits unchanged
Hull Integrity = current Combat Hull Integrity
Primary Weapon retained
Pilot retained
Active Mission = none
Return directly to Operations
```

Each mission result must be applied exactly once.

### 9.6 Blocking overlay rule

At most one Base blocking overlay can be open:

- `Mission Details Overlay`;
- `Weapon Selection Overlay`;
- `Settings Overlay`.

While one is open:

- the underlying screen remains visible;
- underlying actions and `Base Navigation` are blocked;
- commands to open another blocking overlay are ignored.

### 9.7 Session reset

Refreshing from any Screen or overlay:

- discards the entire current session;
- grants no reward;
- does not retain Repair or weapon-selection changes;
- does not restore an active mission;
- creates the initial session state again;
- opens the `Operations Screen`.

The MVP has no Save, autosave, or persistence between sessions.

### 9.8 Browser lifecycle in Base

- Focus loss or a hidden tab does not change the current Base Screen, open blocking Overlay, or shared session state.
- Returning focus continues from the same Base state. Base does not open `Pause Overlay` because no gameplay simulation is active.
- At viewport sizes of at least `1280 × 600` CSS pixels, resize reflows the current Screen and open Overlay through the approved responsive rules without closing, reloading, or recreating them.
- Resize must not repeat asset loading solely because dimensions changed.
- If a Base blocking Overlay is open during resize, it remains open and retains its blocking and keyboard-focus containment behaviour.
- Below `1280 × 600`, layout usability is outside the support contract. No mobile layout or unsupported-size warning is added for the MVP.
- Moving below the minimum size must not mutate shared session state; returning to a supported size restores the approved responsive layout.
- Repeated focus, visibility, and resize events must not change Credits, Hull Integrity, Primary Weapon, Pilot, Settings, mission availability, or reward; reopen a Screen; or duplicate a blocking Overlay.

### 9.9 Base keyboard and focus behaviour

- Base UI uses the canonical native controls and keyboard behaviour defined by the Design System.
- Sequential focus order is Base Navigation (`Operations`, then `Hangar`), current Screen actions in visual order, then `Settings Button`.
- Operations Screen includes `Mission Point` as its Screen action.
- Hangar Screen includes `Change Weapon`, then visible enabled `Repair`; disabled Repair is skipped; Settings follows.
- After navigation to Operations or Hangar, programmatic focus moves to the new Screen heading using `tabindex="-1"`.
- Closing a Base Overlay restores focus to its still-existing opener.
- Starting Combat does not restore focus to `Mission Point` because the Base context is removed.
- Every Base Screen and Overlay must pass the approved keyboard-only audit.

### 9.10 Prepared assets

- Operations and Hangar use only the runtime assets prepared by the bounded Boot preload or their stable approved fallbacks.
- Base navigation, Overlay opening, and viewport resize do not initiate another application-level request for those assets.
- Base Screens do not display a loading Overlay, spinner, progress bar, skeleton, or delayed visual replacement.

## 10. Acceptance Criteria

### AC-001 — Initial Base state

**Given** a new session is created,  
**when** initialization completes,  
**then** `Operations Screen` opens with `1 Credit`, `German Fighter` at `100` Hull Integrity, `Machine Gun` equipped, Mouse Movement enabled, one available mission, no active mission, and one Pilot selected from the approved list.

### AC-002 — Base Navigation contents

**Given** either Base Screen is open,  
**when** `Base Navigation` is displayed,  
**then** it appears vertically on the left with `Operations` followed by `Hangar`, each with an icon and text label, and no future navigation placeholders.

### AC-003 — Active navigation item

**Given** a Base Screen is open,  
**when** its active navigation item is selected,  
**then** the screen and shared state are not reloaded, reset, or changed.

### AC-004 — Base Screen transition

**Given** no blocking overlay is open,  
**when** the player selects the inactive Base navigation item,  
**then** the corresponding Base Screen opens without changing Credits, Hull Integrity, Pilot, equipped Primary Weapon, or Settings.

### AC-005 — Navigation blocked by overlay

**Given** a blocking Base overlay is open,  
**when** the player attempts to use `Base Navigation`,  
**then** no navigation occurs and the current overlay remains open.

### AC-006 — Global Settings

**Given** a Base Screen is open with no blocking overlay,  
**when** the player selects the upper-right `Settings Button`,  
**then** the blocking `Settings Overlay` opens with `Mouse Movement Enabled` and `Close` only.

**Given** `Settings Overlay` is open,  
**when** the player selects `Close` or presses `Esc`,  
**then** the Overlay closes without changing the current Base Screen or the selected setting.

**Given** `Settings Overlay` is open,  
**when** the player clicks outside it,  
**then** the Overlay remains open.

### AC-007 — Operations content

**Given** the `Operations Screen` is open,  
**when** its content renders,  
**then** it displays the strategic-map background, one `Interception` mission point at `50% × 50%` of content area, `Credits Panel` in the upper-left, and `Settings Button` in the upper-right.

### AC-008 — Operations background fallback

**Given** the strategic-map background fails to load,  
**when** Operations renders,  
**then** a solid dark fallback is displayed while the mission point, Credits, navigation, and Settings remain functional.

### AC-009 — Mission point interaction

**Given** the mission point is available,  
**when** the player selects it,  
**then** `Mission Details Overlay` opens, Operations remains the current Base Screen, and all underlying actions become non-interactive.

### AC-010 — Mission Details content and order

**Given** `Mission Details Overlay` is open,  
**when** it renders,  
**then** it displays `Interception`, `Resolve the incoming enemy wave.`, `Reward: 1 Credit`, `Start Mission` on the left, and `Cancel` on the right, with no aircraft selector or `Open Hangar` action.

### AC-011 — Cancel Mission Details

**Given** `Mission Details Overlay` is open,  
**when** the player selects `Cancel` or presses `Esc`,  
**then** the overlay closes and the unchanged `Operations Screen` remains open.

### AC-012 — Outside click on Mission Details

**Given** `Mission Details Overlay` is open,  
**when** the player clicks outside it,  
**then** the overlay remains open.

### AC-013 — Start Mission

**Given** no mission is active and `Mission Details Overlay` is open,  
**when** the player selects `Start Mission`,  
**then** the action immediately disables, exactly one mission instance receives the current aircraft, Hull Integrity, weapon, Pilot, and Mouse Movement setting, Base UI closes, and Combat opens without spending Credits.

### AC-014 — Combat initialization failure

**Given** `Start Mission` has been selected,  
**when** Combat initialization fails,  
**then** no active mission remains, Base state is unchanged, Mission Details remains open, `Start Mission` is enabled again, and `Unable to start mission.` is displayed.

### AC-015 — Hangar composition

**Given** the `Hangar Screen` is open,  
**when** it renders,  
**then** it displays the Hangar background, `Aircraft Configuration Panel` immediately right of navigation, centered German Fighter visual in the remaining area, and `Settings Button` in the upper-right.

### AC-016 — Hangar panel content

**Given** the Hangar is open,  
**when** `Aircraft Configuration Panel` renders,  
**then** it displays German Fighter, current Pilot, Hull bar and numeric Hull, equipped Primary Weapon and `Change Weapon`, followed by Repair content only when damaged.

### AC-017 — Aircraft visual fallback

**Given** the German Fighter image fails to load,  
**when** the Hangar renders,  
**then** a neutral `German Fighter` placeholder appears and all Hangar UI remains functional.

### AC-018 — No mission launch from Hangar

**Given** the Hangar is open,  
**when** available actions are inspected,  
**then** no `Launch`, `Start Mission`, mission point, or `Open Hangar` action is present.

### AC-019 — Open Weapon Selection

**Given** no blocking overlay is open in Hangar,  
**when** the player selects `Change Weapon`,  
**then** the blocking `Weapon Selection Overlay` opens with the currently equipped weapon selected.

### AC-020 — Weapon options and values

**Given** `Weapon Selection Overlay` is open,  
**when** it renders,  
**then** it displays Machine Gun at `1 damage / 6 shots/s / 3 Basic Drone hits` and Cannon at `3 damage / 2 shots/s / 1 Basic Drone hit`, with `Confirm` left and `Cancel` right.

### AC-021 — Pending weapon selection

**Given** `Weapon Selection Overlay` is open,  
**when** the player selects the weapon that is not currently equipped,  
**then** only the pending selection changes and the equipped weapon remains unchanged until `Confirm`.

### AC-022 — Confirm weapon selection

**Given** a weapon is selected in the overlay,  
**when** the player selects `Confirm`,  
**then** that weapon becomes equipped, the overlay closes, and the Hangar panel updates immediately.

### AC-023 — Cancel weapon selection

**Given** pending weapon selection differs from the equipped weapon,  
**when** the player selects `Cancel` or presses `Esc`,  
**then** the overlay closes and the equipped weapon remains unchanged.

### AC-024 — Outside click on Weapon Selection

**Given** `Weapon Selection Overlay` is open,  
**when** the player clicks outside it,  
**then** the overlay remains open.

### AC-025 — Repair hidden at full Hull

**Given** aircraft Hull Integrity is `100`,  
**when** the Hangar panel renders,  
**then** the entire Repair section is hidden and no Repair action can spend Credits.

### AC-026 — Repair enabled

**Given** aircraft Hull Integrity is below `100` and Credits are at least `1`,  
**when** the Repair section renders,  
**then** it displays current Credits, `Cost: 1 Credit`, and an enabled `Repair` action.

### AC-027 — Repair disabled without Credits

**Given** aircraft Hull Integrity is below `100` and Credits equal `0`,  
**when** the Repair section renders,  
**then** `Repair` is visible but disabled and no separate insufficient-Credits message is shown.

### AC-028 — Successful Repair

**Given** Repair is enabled,  
**when** the player selects it once,  
**then** exactly `1 Credit` is spent, Hull Integrity becomes `100`, displayed values update, and the Repair section disappears as one atomic result.

### AC-029 — Repeated Repair protection

**Given** Repair has been selected,  
**when** repeated input occurs before the action completes,  
**then** no additional Credit is spent and no second Repair is applied.

### AC-030 — Repair failure safety

**Given** an enabled Repair action is attempted,  
**when** the operation cannot complete,  
**then** neither Credits nor Hull Integrity changes, no partial state remains, and the button returns to its correct availability state.

### AC-031 — Damaged mission start

**Given** aircraft Hull Integrity is above `0` but below `100`,  
**when** the player starts the mission without Repair,  
**then** Combat receives the current damaged Hull Integrity and mission start is not blocked.

### AC-032 — Success integration

**Given** Combat resolves in Success,  
**when** the player continues to Operations,  
**then** exactly `1 Credit` is added once, Combat result Hull is retained, weapon and Pilot are retained, no active mission remains, and the mission point is available again.

### AC-033 — Defeat integration

**Given** Combat resolves in Defeat,  
**when** the player continues to Operations,  
**then** Credits are unchanged, Hull Integrity is `25`, weapon and Pilot are retained, no active mission remains, and the mission point is available again.

### AC-034 — Aborted integration

**Given** the player returns to Base through the Combat pause flow,  
**when** the mission becomes `Aborted`,  
**then** Credits are unchanged, current Combat Hull is retained, weapon and Pilot are retained, active mission state is discarded, and Operations opens directly.

### AC-035 — Single active mission

**Given** an active mission exists,  
**when** another mission-start command is attempted,  
**then** no second mission is created and Base state cannot be modified through Base UI.

### AC-036 — Single blocking overlay

**Given** one Base blocking overlay is open,  
**when** a command attempts to open another,  
**then** the command is ignored and the current overlay remains the only open blocking overlay.

### AC-037 — Session state consistency

**Given** Credits, Hull, Pilot, weapon, or Settings changes through an approved action,  
**when** the player navigates to another Base Screen,  
**then** every screen displays the same updated shared-session value without divergence.

### AC-038 — Refresh reset

**Given** any Base Screen, overlay, or mission state exists,  
**when** the page is refreshed,  
**then** the previous session is discarded without reward and a new session opens in Operations with the complete approved initial state and a newly selected Pilot.

### AC-039 — Settings state

**Given** the player changes `Mouse Movement Enabled` during a session,  
**when** the player navigates between Base Screens or starts Combat,  
**then** the selected value is retained and passed to Combat; after page refresh it resets to enabled.

### AC-040 — Pilot stability

**Given** a Pilot has been selected for the current session,  
**when** the player navigates, changes weapon, Repairs, or completes a mission,  
**then** the Pilot does not change until a new session is created.

### AC-041 — Minimum supported viewport

**Given** the browser viewport is `1280 × 600` CSS pixels,  
**when** the player opens either Base Screen and each blocking overlay,  
**then** every required control remains visible and usable without horizontal page scrolling.

### AC-042 — Bounded responsive scaling

**Given** the viewport is at or above the minimum supported size,  
**when** its dimensions change,  
**then** layout spacing, component dimensions, and typography scale within defined minimum and maximum bounds without overlap or loss of required content.

### AC-043 — Runtime assets

**Given** the approved runtime assets are present,  
**when** the player opens `Operations Screen` or `Hangar Screen`,  
**then** the game loads the corresponding WebP background from `assets/runtime/backgrounds/` and loads the Hangar aircraft from `assets/runtime/aircraft/german-fighter.png`; it does not load JPEG files from `assets/source/backgrounds/`.

### AC-044 — Immediate shared Settings update

**Given** the Base `Settings Overlay` is open,  
**when** the player changes `Mouse Movement Enabled`,  
**then** the single shared-session value updates immediately without `Save`, `Apply`, or `Reset`, and no independent Base copy is created.

### AC-045 — Base ignores control-mode shortcut

**Given** a Base Screen or Base blocking Overlay is visible,  
**when** the player presses `F`,  
**then** `Mouse Movement Enabled` remains unchanged and no control-mode action occurs.

### AC-046 — Base focus and visibility continuity

**Given** a Base Screen with or without a blocking Overlay is visible,  
**when** the browser loses focus or the tab becomes hidden and later returns,  
**then** the same Screen, Overlay, and shared session state remain and no `Pause Overlay` is created.

### AC-047 — Base resize continuity

**Given** a Base Screen or Base blocking Overlay is visible at a supported viewport size,  
**when** the viewport dimensions change,  
**then** the existing UI reflows without closing or recreating the Screen or Overlay, repeating asset loads solely because of resize, or changing shared session state.

### AC-048 — Below-minimum viewport recovery

**Given** the viewport becomes smaller than `1280 × 600`,  
**when** it later returns to a supported size,  
**then** the approved responsive layout is restored with the same current Screen, open Overlay, and shared session state, without a mobile layout or unsupported-size warning.

### AC-049 — Base sequential focus order

**Given** no blocking Overlay is open on a Base Screen,  
**when** the player navigates with `Tab` and `Shift+Tab`,  
**then** focus follows the approved Navigation–Screen actions–Settings order, visibly indicates focus, and skips disabled Repair.

### AC-050 — Weapon Selection keyboard operation

**Given** `Weapon Selection Overlay` opens,  
**when** the player uses only the keyboard,  
**then** focus starts on the equipped Weapon Option, arrow keys or `Space` change pending radio selection, `Tab` reaches `Confirm` and `Cancel`, and only `Confirm` equips the pending weapon.

### AC-051 — Base Overlay focus restoration

**Given** a Base blocking Overlay was opened by a control that remains present,  
**when** the Overlay closes without a Screen transition,  
**then** focus returns to that opening control and does not move to underlying content while the Overlay is open.

### AC-052 — Base Screen transition focus

**Given** Base Navigation or a result flow opens Operations or Hangar,  
**when** the new Screen becomes current,  
**then** programmatic focus moves to its heading without placing the heading in sequential Tab order.

### AC-053 — Base uses prepared assets

**Given** bounded Boot preload has completed,  
**when** Operations or Hangar opens or resizes,  
**then** it uses each prepared runtime asset or its stable fallback without another loading state, repeated application request, or late visual replacement.

## 11. Scope and Readiness

The final consistency review passed on `2026-08-20`. No unresolved S0–S2 product or Design System behaviour remains inside the approved Base and pre-Combat MVP scope.

**PRODUCT SCOPE READY**

The final cross-document technical audit passed on `2026-08-20`. Base and pre-Combat implementation is authorized through explicitly assigned feature slices.

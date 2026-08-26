# MVP Canonical Glossary v0.1

**Product:** Shmup  
**Scope:** Canonical terminology for the complete MVP  
**Status:** READY  

## 1. Usage rules

- Terms in this glossary are canonical in requirements, UI copy, implementation names, tests, and handoff tasks.
- UI text keeps the exact capitalization specified by the feature or Design System document.
- An implementation agent must not introduce a synonym when a canonical term exists.
- A missing or conflicting term is a specification blocker, not permission to invent vocabulary.

## 2. Application and navigation

| Canonical term | Meaning | Do not use as a synonym |
|---|---|---|
| `Boot View` | Technical loading state before the first session opens | Title Screen, Main Menu, Loading Screen as a navigation destination |
| `Screen` | Full application context | page, view, scene when referring to product UI |
| `Base Screen` | Strategic Screen accessible through Base Navigation | menu screen |
| `Operations Screen` | Base Screen containing the available mission | Operational Screen, map screen |
| `Hangar Screen` | Base Screen for aircraft inspection, weapon selection, and Repair | garage, workshop |
| `Combat Screen` | Active real-time gameplay Screen | Flight Screen, Mission Screen, Battle Screen |
| `Base Navigation` | Persistent navigation between Operations and Hangar | main menu, sidebar menu |
| `Overlay` | Blocking UI layer above the current Screen | popup, modal, dialog unless naming a technical primitive |
| `Settings Overlay` | Global Overlay containing Mouse Movement Enabled and Close | options menu |
| `Pause Overlay` | Combat Overlay containing Resume and Return to Base | pause screen |
| `Mission Result Overlay` | Result Overlay after Success or Defeat | end screen, game-over screen |
| `Debug Overlay` | Development-only Combat observability and control Overlay | cheat menu |

## 3. Mission lifecycle

| Canonical term | Meaning | Do not use as a synonym |
|---|---|---|
| `Mission` | Strategic activity selected before Combat | Combat Screen |
| `Interception` | The only MVP mission type | level, sortie as a formal type |
| `Mission Point` | Static Operations control that opens Mission Details | mission icon, map marker as a component name |
| `Mission Details Overlay` | Pre-Combat confirmation Overlay | mission screen |
| `Active Mission` | The single Mission instance currently in Combat | active level |
| `Success` | Mission result after the final group has spawned and every enemy is Destroyed or Escaped while the aircraft remains operational | win state in formal requirements |
| `Defeat` | Mission result when player Hull Integrity reaches `0`; it has priority over Success | death, game over |
| `Aborted` | Mission result from Return to Base during active Combat | surrender, cancel after Combat starts |
| `Return to Base` | Pause action that resolves the Mission as Aborted and opens Operations | quit mission |
| `Continue` | Required action from Mission Result Overlay to Operations | retry |

## 4. Aircraft, economy, and configuration

| Canonical term | Meaning | Do not use as a synonym |
|---|---|---|
| `Aircraft` | Player-controlled combat vehicle | ship, character |
| `German Fighter` | The only MVP Aircraft | plane as a formal entity name |
| `Hull Integrity` | Aircraft durability in the range `0–100` | health, HP, hit points |
| `Hull Integrity Bar` | Visual and semantic progress indicator for Hull Integrity | health bar |
| `Repair` | Hangar action that spends `1 Credit` and restores Hull Integrity to `100` | heal, restore action |
| `Emergency recovery` | Automatic free post-Defeat recovery to exactly `25 Hull Integrity` | free Repair, full Repair |
| `Credit` / `Credits` | The only MVP currency | money, coins |
| `Pilot` | Session-selected identity with no MVP stats or progression | character class |
| `Primary Weapon` | The single equipped automatic weapon slot | main gun when naming the slot |
| `Machine Gun` | Primary Weapon with damage `1` and fire rate `6 shots/s` | MG in product requirements |
| `Cannon` | Primary Weapon with damage `3` and fire rate `2 shots/s` | heavy gun |
| `Weapon Selection Overlay` | Hangar Overlay for pending and confirmed Primary Weapon selection | loadout screen |

## 5. Combat entities and states

| Canonical term | Meaning | Do not use as a synonym |
|---|---|---|
| `Basic Drone` | The only MVP enemy type with `3 Hull Integrity` and no ranged attack | mob, alien, fighter |
| `player projectile` | Entity created automatically by the equipped Primary Weapon | bullet when naming the entity |
| `Destroyed` | Resolved enemy state caused by Hull Integrity reaching `0` or below | killed, dead in formal state logic |
| `Escaped` | Resolved enemy state after a previously visible enemy fully leaves the viewport | despawned |
| `Enemy escape` | Expected enemy resolution through the bottom of Combat | leak when naming the mechanic |
| `contact damage` | Atomic aircraft–Basic Drone collision damage | ram damage |
| `contact-damage cooldown` | Player-only `0.5 s` protection from repeated contact damage | invulnerability, i-frames |
| `Movement Bounds` | Viewport area inside the approved equal edge margin that contains the complete aircraft sprite | playfield bounds |
| `viewport short side` | Smaller of viewport width and viewport height | screen size |
| `final group` | Five Basic Drones spawned at `110 s` or through Debug | boss wave, final wave when naming the data state |

## 6. Controls and state

| Canonical term | Meaning | Do not use as a synonym |
|---|---|---|
| `Mouse Movement` | Control mode in which the aircraft accelerates toward the mouse target | mouse follow mode |
| `Keyboard Movement` | Control mode using WASD or arrow keys | key mode |
| `Mouse Movement Enabled` | Single shared-session boolean selecting Mouse Movement when true | mouse control toggle as a state key |
| `shared session state` | One authoritative in-memory state for the current page-load session | save data, profile |
| `Settings` | Global current-session configuration system | preferences |
| `Debug Mode` | Development-only capability available when `DEV_MODE = true` | cheat mode |
| `God Mode` | Debug state keeping player Hull Integrity at maximum | invincibility mode |
| `browser safety pause` | Latched manual-Resume requirement caused by focus loss, hidden tab, or resize during Combat | auto-pause state as an implementation-specific synonym |

## 7. Design and delivery

| Canonical term | Meaning | Do not use as a synonym |
|---|---|---|
| `Design Token` | Approved shared visual value | magic value |
| `primitive` | Lowest reusable UI building block | atom in normative requirements |
| `reusable component` | Approved composition reused by Screens or Overlays | widget |
| `runtime asset` | Approved file under `assets/runtime/` requested by the application | source asset |
| `source asset` | Editable reference material under `assets/source/`, never loaded at runtime | runtime image |
| `fallback` | Stable approved substitute for a failed or timed-out runtime asset | placeholder when a specific fallback is defined |
| `production build` | Client-only optimized static artifact with Debug Mode disabled | release server |
| `reference device` | Approved Lenovo IdeaPad 3 15IIL05-class performance target | minimum hardware as a statistical market claim |

## 8. Explicitly absent concepts

The MVP has no Title Screen, Main Menu, Save, autosave, Retry, backend, account, progression, enemy fire, secondary weapon, ammunition, terrain, audio, mobile controls, or mobile layout. These terms must not appear as implemented MVP systems.

## 9. Approved v0.2 terminology overrides

The entries above remain correct for the accepted v0.1 baseline. For work governed by `SHMUP_V0.2_TACTICAL_COMBAT_FOUNDATION_SPECIFICATION.md`, the following terms replace conflicting v0.1 meanings.

| Canonical term | v0.2 meaning | Supersedes for v0.2 |
|---|---|---|
| `Interception Mission` | One of three authored campaign Missions: Interception 01, 02, or 03 | single Interception only |
| `Evacuation` | Only voluntary active-mission exit; confirmation followed by an irreversible five-second survival commitment | `Return to Base`, `Aborted` |
| `Evacuated` | Terminal non-completion result retaining the current Hull and 50% of floored net combat reward | `Aborted` result |
| `Combat Countdown` | Time remaining until the final scheduled enemy arrival; remains at `00:00` until result or Evacuation replacement | `final group` UI inference |
| `missionInProgress` | Persisted active-mission marker used as exactly-once refresh/crash Defeat authority | session-only active Mission |
| `campaign state` | Versioned persisted run data: Pilot, Credits, Hull, weapon, mission progression, run status, and active-mission marker | `shared session state` as durable authority |
| `New Game` | Confirmed atomic replacement of campaign state after Game Over or save-data failure; user Settings remain | fresh page-load session |
| `Game Over` | Persisted terminal run state when Defeat Repair cannot be paid | Mission Result Overlay synonym |
| `Repair` | Automatic full restoration to `100` Hull after Defeat for exactly `8 Credits`, when affordable | 1-Credit Hangar Repair and emergency recovery |
| `Machine Gun` | Primary Weapon with damage `1` and fire rate `5 shots/s` | v0.1 `6 shots/s` |
| `Cannon` | Primary Weapon with damage `3` and fire rate `1.5 shots/s` | v0.1 `2 shots/s` |
| `Basic Drone` | Regular formation/contact enemy with no ranged attack | only enemy type |
| `Ranged Drone` | Regular area-denial enemy firing fixed-trajectory projectiles | v0.1 absence of enemy fire |
| `Hunter Drone` | Direct-steering kamikaze interceptor that locks one committed attack direction | generic homing or missile |
| `Elite Drone` | One authored Mission 03 mini-boss alternating Armoured and Vulnerable phases | generic boss framework |
| `Armoured` | Elite phase in which player hits deal zero but consume the projectile | shield bubble |
| `Vulnerable` | Elite phase in which the exposed Core receives normal player-weapon damage | colour-only weak state |
| `enemy projectile` | Single-hit Ranged or Elite attack entity governed by the v0.2 projectile lifecycle | implemented-v0.1 concept |
| `contact-damage cooldown` | Per Aircraft/Basic-or-Ranged pair cooldown of `0.75 s`; it grants no immunity from other damage | v0.1 global/player-only `0.5 s` wording |

Progression, persistence, enemy fire, and Game Over remain absent from the v0.1 baseline but are approved scope for this bounded v0.2 Epic.

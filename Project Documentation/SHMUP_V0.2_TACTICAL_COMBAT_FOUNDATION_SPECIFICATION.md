# Shmup v0.2 Tactical Combat Foundation Specification

**Product:** Shmup
**Version scope:** v0.2
**Document type:** canonical post-MVP Epic product specification
**Decision owner:** Product Owner
**Prepared:** 2026-08-25
**Mission 01 staging decision:** 2026-08-31
**Mission 02 staging and alternative-outcome decisions:** 2026-09-02
**Repository baseline audited:** `91f2aa29f2783c90af584d95720453a1eabc8c3e`
**Status:** **APPROVED — V02-WI-05 READY FOR BOUNDED HANDOFF; MISSION 03 STAGING BOUNDED AS NOT READY**

## 1. Purpose and authority

This document defines the complete product contract for `Shmup v0.2 Tactical Combat Foundation`. It converts the approved v0.2 decisions into testable requirements without authorizing implementation or creating an implementation handoff.

**FACT:** The completed MVP remains the technical and behavioural baseline unless this document explicitly supersedes an MVP rule.

**DECISION:** For this Epic, the newest approved v0.2 decisions in this document take priority over the MVP documents for the behaviour they explicitly replace. Unaffected MVP rules and the repository architecture, code, verification, Design System, governance, narrative, and delivery constraints remain authoritative.

**REQUIREMENT:** If this document and an unaffected canonical source conflict, implementation must stop and report the conflict. An implementation agent must not choose a convenient interpretation.

### 1.1 Canonical sources audited

The preparation audit covered:

- `MVP_MASTER_DESIGN_DOCUMENT_v0.1.md`;
- `MVP_COMBAT_SPEC_v0.1.md`;
- `MVP_BASE_AND_PRECOMBAT_SPEC_v0.1.md`;
- `MVP_GLOSSARY_v0.1.md`;
- `MVP_TECHNICAL_FOUNDATION_v0.1.md`;
- `MVP_REPOSITORY_ARCHITECTURE_v0.1.md`;
- `MVP_CODE_PRINCIPLES_v0.1.md`;
- `MVP_IMPLEMENTATION_SLICES_v0.1.md`;
- `MVP_DESIGN_SYSTEM_SPEC_v0.1.md`;
- `MVP_DEEPSEEK_GOVERNANCE_AND_SKILL_ROUTING_v0.1.md` and repository `AGENTS.md`;
- `MVP_TRACEABILITY_MATRIX_v0.1.md`;
- `MVP_VERIFICATION_AND_QUALITY_GATES_v0.1.md`;
- `MVP_NARRATIVE_RULES_v1.0.md`;
- `MVP_FINAL_TECHNICAL_AUDIT_v0.1.md`;
- `MVP_DELIVERY_SPEC_v0.1.md`;
- `POST_MVP_ENEMY_TYPES_EPIC_READINESS_v0.1.md`.

The legacy `MVP_IMPLEMENTATION_SLICES_v0.1.md` describes completed MVP Slices `S01`–`S14`. It does not define the implementation sequence for this Epic.

## 2. Product outcome and design principle

**DECISION V02-DEC-001 — Fair and readable, not easy**

Shmup does not aim to be easy. Combat must be understandable, logical, readable, and fair. Difficulty must come from threat recognition, target priority, positioning, risk management, loadout choice, authored timing, and simultaneous tactical demands.

**REQUIREMENTS:**

- The game must communicate hazards early enough for a skilled player to make a meaningful response.
- The game must not guarantee success merely because the player understood the rules.
- The game must not become a bullet hell.
- Difficulty must not be created primarily through enemy or projectile spam.
- Each authored enemy must have a tactical purpose.
- Every approved combination must leave at least one practically reachable avoidance route under the supported viewport and starting loadouts.

### 2.1 Player outcome

The player learns and then combines four threat vocabularies across three authored `Interception Missions`, makes meaningful weapon and evacuation choices, accepts financial consequences for failure, and can replay completed missions without losing campaign progress.

## 3. Scope

### 3.1 IN scope

- three authored `Interception Missions`;
- `Basic Drone`, `Ranged Drone`, `Hunter Drone`, and one `Elite Drone`;
- typed enemy definitions and mission compositions for approved v0.2 consumers only;
- deterministic Encounter Grammar and authored timelines;
- enemy projectiles for Ranged and Elite attacks;
- v0.2 player-weapon tuning for Machine Gun and Cannon;
- single-hit projectile lifecycle;
- regular contact-collision rules and the Hunter kamikaze exception;
- per-enemy combat rewards and escape penalties;
- mission completion rewards, Repair cost, `Evacuation`, `Defeat`, and `Game Over`;
- three mission points, unlock progression, and replay;
- versioned local persistence using Dexie as an IndexedDB adapter;
- Combat Countdown, Evacuation UI, result UX, and Game Over Screen;
- browser lifecycle rules for hidden tabs, refresh, and close;
- v0.2 Debug and observability additions;
- the five approved enemy sprite roles and runtime asset mappings after asset acceptance;
- proportional automated, browser, visual, lifecycle, cleanup, and performance verification.

### 3.2 OUT OF SCOPE

- additional regular enemies, a second Elite, or a generic boss framework;
- other mission types or procedural encounters;
- dynamic difficulty or reactive spawn adaptation;
- a second Aircraft;
- new Primary Weapons, upgrades, research, production, buildings, personnel, loot, alien loot, or additional currencies;
- difficulty selector, boss skill trees, campaign narrative expansion, live operations, analytics, backend, cloud save, account sync, or multiplayer;
- active-Combat serialization or resume after restart;
- anti-farming systems, diminishing returns, fuel, replay limits, or cooldowns;
- audio, screen shake, hit-stop, damage numbers, score, minimap, wave counter, DPS meter, or enemy HP numbers;
- piercing, ricochet, chain damage, splash damage, or area damage;
- a universal content engine, ECS, behaviour graph, plugin system, or speculative LEGO framework for future enemies.

## 4. Canonical terminology

| Term                   | Definition                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| `Interception Mission` | The only v0.2 mission type. The player resolves an authored incoming enemy attack.                              |
| `Encounter`            | One authored tactical composition with fixed timing, composition, entry, and formation data.                    |
| `Combat Countdown`     | Time remaining until the last scheduled enemy arrival. It is not time until mission success.                    |
| `Enemy escape`         | A regular enemy passes completely beyond the bottom boundary and becomes `Escaped`.                             |
| `Evacuation`           | The only voluntary exit from an active mission; it requires confirmation and a five-second survival commitment. |
| `Combat rewards`       | Pending per-enemy rewards earned during the current mission before escape penalties and result rules.           |
| `Completion reward`    | Mission-specific reward granted only on `Success`.                                                              |
| `Armoured`             | Elite phase in which incoming player damage is zero.                                                            |
| `Vulnerable`           | Elite phase in which the exposed Core can receive damage.                                                       |
| `Game Over`            | Terminal state of the current persisted run when a Defeat cannot be repaired.                                   |
| `Mission in progress`  | Persisted marker set before accepted Combat begins and cleared only by atomic terminal-result commitment.       |

Do not use `Abort` or `Return to Base` as a separate active-mission result in v0.2. Do not use `Ranger` for `Ranged Drone`.

## 5. Non-negotiable technical foundation

**FACT:** v0.2 retains the approved technical architecture.

**REQUIREMENTS:**

- Domain and authoritative Combat behaviour remain deterministic TypeScript.
- Combat advances at fixed `1/60 s` steps under the existing step-cap rule.
- The application owns the single Shared Session State and `CombatSimulationState`.
- Phaser remains a lazy-loaded renderer/input adapter. React owns Screens, Overlays, and HUD composition.
- Deterministic Combat randomness uses approved seeded streams; authoritative code must not use `Math.random()`.
- Content definitions contain typed data, units, closed identifiers, and validation. They do not contain callbacks or framework objects.
- Dexie is a persistence adapter, not state authority.
- Mission Result commitment is atomic and idempotent.
- No second store, global event bus, Phaser Registry authority, or React gameplay authority is permitted.
- Runtime assets must be addressed through the central asset catalogue. `assets/source/` must not ship or be imported at runtime.

## 6. Mission availability, unlock, and replay

### 6.1 Initial state

**REQUIREMENTS:**

- A New Game starts with only `Interception 01` unlocked.
- `Interception 02` and `Interception 03` are visible but locked.
- A locked Mission Point is not launchable and communicates its locked state without colour alone.
- Exactly one Active Mission may exist.

### 6.2 Progression

- First `Success` on `Interception 01` unlocks `Interception 02`.
- First `Success` on `Interception 02` unlocks `Interception 03`.
- `Success` on `Interception 03` marks it completed and does not unlock speculative content.
- `Evacuation` and `Defeat` do not complete the mission and do not unlock the next mission.
- Completed missions remain replayable.
- Replay uses the same authored timeline, balance, rewards, penalties, and result rules.
- Repeated Success must not duplicate an unlock or corrupt completion state.

## 7. Encounter Grammar

### 7.1 Grammar

**DECISION V02-DEC-002:** Missions use `Introduce → Reinforce → Combine → Test`.

**REQUIREMENTS:**

- `Introduce` presents a new threat in isolation or with minimal interference.
- `Reinforce` repeats the same counterplay in a changed authored geometry.
- `Combine` overlaps already introduced threats.
- `Test` requires recognition and prioritisation without adding an unintroduced mechanic.
- Composition, overlap, positioning, and timing create difficulty; filler enemies do not.
- Entry side, formation, delays, and timestamps are authored content.

**DECISION V02-DEC-022:** Runtime-ready encounters use the smallest explicit
typed `Arrival Group` contract required by their approved staging. An Arrival
Group contains a non-negative fixed-step-aligned offset from the Encounter time
and one or more ordered enemy members. Each member owns its Enemy Type and one
typed `Spawn Placement`:

- `Top Placement` stores a normalized horizontal fraction in `[0, 1]` inside
  the current Aircraft horizontal engagement band;
- `Seeded Side Placement` stores the exact ordered side pair
  `upper-left, upper-right` and a normalized viewport-height fraction.

The Encounter composition and per-role totals are derived from its Arrival
Groups; they are not duplicated as a second runtime authority. Stable Encounter,
Arrival Group, and member order define deterministic creation order when several
members share one fixed step. Content contains data only: it does not contain
spawn callbacks, Phaser objects, or hidden formation algorithms.

This contract is introduced by the Mission 01 staging approved in §8.1.1 and
reused without a new placement type or formation DSL by the Mission 02 staging
approved in §8.2.1. The qualitative Mission 03 rows remain non-runtime product
input until their owning Work Item receives separately approved numeric staging.
The implementation must not invent Mission 03 values or generalize a formation
DSL while implementing Mission 02.

### 7.2 No Reactive Spawn Cheating

**DECISION V02-DEC-003:** Enemy spawns do not react to the current Aircraft position.

**REQUIREMENTS:**

- Spawn time, composition, entry region, and formation are resolved from authored mission data and approved deterministic RNG only.
- The Encounter system must not move or delay a spawn because of the player's current position, Hull, weapon, score, or performance.
- A Hunter may target the Aircraft after it exists; this is enemy behaviour, not spawn cheating.
- Ranged projectiles may aim at the Aircraft position at firing time; this does not alter authored spawn data.

### 7.3 Mission resolution

`Interception` resolves the enemy attack. A mission succeeds when:

1. the final scheduled enemy has arrived;
2. no scheduled encounters remain;
3. every spawned regular enemy is `Destroyed` or `Escaped` and the Elite, if present, is `Destroyed`;
4. Aircraft Hull is greater than `0`.

The Combat Countdown reaching `00:00` does not itself grant Success. Defeat has priority if Success and Defeat would otherwise resolve in the same authoritative step.

## 8. Authored mission timelines

Times are Mission Clock times. `+Ns` means an authored delay from the encounter's first arrival. A fixed seed controls only explicitly random variants such as left/right entry; it does not change timestamps or composition.

### 8.1 Interception 01 — Contact

**Player outcome:** recognise all three regular enemy roles separately, then resolve a simple combined test.
**Final scheduled arrival:** `03:10`.

|    Time | Composition                   | Entry and timing                            | Purpose           |
| ------: | ----------------------------- | ------------------------------------------- | ----------------- |
| `00:10` | 4 Basic                       | wide Top Entry formation                    | introduce Basic   |
| `00:55` | 2 Basic + 1 Ranged            | Ranged enters `+2 s`, centred behind Basics | introduce Ranged  |
| `01:40` | 1 Hunter                      | authored upper-left or upper-right          | introduce Hunter  |
| `02:20` | 3 Basic + 1 Hunter            | Hunter enters `+3 s`                        | movement conflict |
| `03:10` | 3 Basic + 1 Ranged + 1 Hunter | authored stagger; not one simultaneous blob | combined test     |

**Totals:** 12 Basic, 2 Ranged, 3 Hunter.
**Maximum combat reward:** 22 Credits.
**Maximum Success payout:** 30 Credits.

#### 8.1.1 Exact Arrival Groups and Spawn Placements

**DECISION V02-DEC-021:** Mission 01 uses the following exact runtime staging.
Every Top fraction is measured inside the current Aircraft horizontal engagement
band. Every Hunter Side Placement uses viewport `Y = 20% VH`. `+N s` is an
Arrival Group offset from the Encounter time.

| Encounter | Offset | Ordered members and Spawn Placements |
|---|---:|---|
| `interception-01-e1` | `+0 s` | Basic Top `0.20`; Basic Top `0.40`; Basic Top `0.60`; Basic Top `0.80` |
| `interception-01-e2` | `+0 s` | Basic Top `0.40`; Basic Top `0.60` |
| `interception-01-e2` | `+2 s` | Ranged Top `0.50` |
| `interception-01-e3` | `+0 s` | Hunter Seeded Side `upper-left, upper-right`, `Y = 0.20 VH` |
| `interception-01-e4` | `+0 s` | Basic Top `0.25`; Basic Top `0.50`; Basic Top `0.75` |
| `interception-01-e4` | `+3 s` | Hunter Seeded Side `upper-left, upper-right`, `Y = 0.20 VH` |
| `interception-01-e5` | `+0 s` | Basic Top `0.20`; Ranged Top `0.40`; Basic Top `0.60`; Basic Top `0.80`; Hunter Seeded Side `upper-left, upper-right`, `Y = 0.20 VH` |

The `03:10` Encounter is a simultaneous creation step with four separate Top
lanes plus one Side Entry. Its stagger is spatial, not a positive time offset:
the final scheduled enemy is created at exactly `03:10`, so the approved final
arrival and Combat Countdown remain unchanged.

For each seeded Hunter member, the Mission 01 plan consumes exactly one
`mission-data` `nextInt(2)` draw in Encounter/member order. Draw `0` maps to
`upper-left`; draw `1` maps to `upper-right`. The three Mission 01 draws therefore
belong, in order, to `e3`, `e4`, and `e5`. Every Top Placement consumes zero RNG
draws. Selection is resolved from authored mission data and the Mission seed
before active Combat and never reads current Aircraft or performance state.

**DECISION V02-DEC-018:** Top fractions are normalized inside the Aircraft
engagement band rather than the raw viewport. Effective resize preserves each
normalized Top fraction and each Side Placement's normalized `Y`; it does not
reroll entry data. Every enemy starts fully outside its selected boundary with
the nearest edge of its complete authoritative bounds touching that boundary and
with no additional hidden offset.

### 8.2 Interception 02 — Pressure

**Player outcome:** read simultaneous threats and choose target priority.
**Final scheduled arrival:** `04:20`.

|    Time | Composition                   | Entry and timing                        | Purpose                 |
| ------: | ----------------------------- | --------------------------------------- | ----------------------- |
| `00:10` | 3 Basic                       | offset Top Entry formation              | warm-up                 |
| `00:50` | 3 Basic + 1 Ranged            | Basics screen the Ranged                | priority                |
| `01:40` | 2 Basic + 2 Ranged            | two separated authored firing lanes     | cross-pressure          |
| `02:30` | 4 Basic                       | front group plus delayed authored flank | spatial awareness       |
| `03:20` | 1 Basic + 1 Ranged + 1 Hunter | authored stagger                        | displacement under fire |
| `04:20` | 2 Basic + 1 Hunter            | asymmetric entry                        | closing pressure        |

**Totals:** 15 Basic, 4 Ranged, 2 Hunter.
**Maximum combat reward:** 27 Credits.
**Maximum Success payout:** 39 Credits.

#### 8.2.1 Exact Arrival Groups and Spawn Placements

**DECISION V02-DEC-026 (2026-09-02):** Mission 02 reuses the bounded
`Arrival Group` and `Spawn Placement` contract from §7.1 without adding fixed
side placements, a formation DSL, or hidden runtime geometry. Every Top fraction
is measured inside the current Aircraft horizontal engagement band. A Seeded
Side member resolves from the exact ordered pair `upper-left, upper-right` at
the authored viewport-height fraction.

| Encounter | Offset | Ordered members and Spawn Placements |
|---|---:|---|
| `interception-02-e1` | `+0 s` | Basic Top `0.15`; Basic Top `0.45`; Basic Top `0.75` |
| `interception-02-e2` | `+0 s` | Basic Top `0.25`; Basic Top `0.50`; Basic Top `0.75` |
| `interception-02-e2` | `+2 s` | Ranged Top `0.50` |
| `interception-02-e3` | `+0 s` | Basic Top `0.20`; Ranged Top `0.30`; Ranged Top `0.70`; Basic Top `0.80` |
| `interception-02-e4` | `+0 s` | Basic Top `0.25`; Basic Top `0.50`; Basic Top `0.75` |
| `interception-02-e4` | `+2 s` | Basic Seeded Side `upper-left, upper-right`, `Y = 0.25 VH` |
| `interception-02-e5` | `+0 s` | Basic Top `0.25` |
| `interception-02-e5` | `+1 s` | Ranged Top `0.55` |
| `interception-02-e5` | `+2 s` | Hunter Seeded Side `upper-left, upper-right`, `Y = 0.20 VH` |
| `interception-02-e6` | `+0 s` | Basic Top `0.35`; Basic Top `0.65`; Hunter Seeded Side `upper-left, upper-right`, `Y = 0.20 VH` |

Mission 02 consumes exactly three `mission-data` `nextInt(2)` draws in
Encounter/Arrival Group/member order: the delayed e4 Basic, the e5 Hunter, and
the e6 Hunter. Draw `0` maps to `upper-left`; draw `1` maps to `upper-right`.
Every Top Placement consumes zero RNG draws. Selection is resolved from authored
mission data and the Mission seed before active Combat and never reads Aircraft,
Hull, weapon, score, or performance state.

Every e6 member is created on the single `04:20` fixed step. Mission 02 has no
positive Arrival Group offset after that step; its Combat Countdown therefore
reaches `00:00` exactly when the complete final group is created.

### 8.3 Interception 03 — Breakthrough

**Player outcome:** resolve sustained combined pressure, use a recovery window, then defeat the Elite.
**Final scheduled arrival and Combat Countdown `00:00`:** `05:20`, when the Elite arrives.

|    Time | Composition                   | Entry and timing                        | Purpose                     |
| ------: | ----------------------------- | --------------------------------------- | --------------------------- |
| `00:10` | 3 Basic + 1 Ranged            | screened formation                      | immediate pressure          |
| `00:55` | 3 Basic                       | flank-oriented authored geometry        | positioning                 |
| `01:35` | 2 Basic + 1 Ranged + 1 Hunter | Hunter delayed                          | flush                       |
| `02:20` | 2 Basic + 2 Ranged            | split firing lanes                      | area denial                 |
| `03:10` | 1 Basic + 1 Hunter            | aggressive interruption                 | mobility                    |
| `03:55` | 2 Basic                       | simple formation                        | intentional recovery window |
| `04:35` | 1 Hunter                      | authored upper-left or upper-right      | pre-Elite disruption        |
| `05:20` | 1 Elite                       | enters and remains in upper combat zone | mini-boss test              |

**Totals:** 13 Basic, 4 Ranged, 3 Hunter, 1 Elite.
**Maximum combat reward:** 35 Credits.
**Maximum Success payout:** 51 Credits.

## 9. Enemy Vocabulary and tuning

All speed units are viewport-relative and evaluated in simulation seconds. `VH/s` means percentage of viewport height per second; `VW/s` means percentage of viewport width per second.

| Parameter                 |             Basic |           Ranged |                                Hunter |
| ------------------------- | ----------------: | ---------------: | ------------------------------------: |
| Hull                      |                 3 |                4 |                                     3 |
| Base movement             | 12% VH/s downward | 9% VH/s downward | 18% VH/s approach; 26% VH/s committed |
| Contact damage            |                15 |               15 |                                    35 |
| Player-destruction reward |                +1 |               +2 |                                    +2 |
| Bottom escape penalty     |                -1 |               -2 |                                    -2 |

### 9.1 Basic Drone

- Role: formation pressure, spatial obstruction, and basic collision threat.
- Movement: authored Top/Side Entry followed by regular downward travel under existing deterministic geometry rules.
- Attack: none.
- Counterplay: align fire, choose safe space, and avoid contact.
- Its authoritative AABB equals its complete configured rectangular rendered
  bounds. Spawn placement, first visibility, collision, and escape use those
  same bounds rather than the superseded v0.1 square or an alpha-pixel mask.

### 9.2 Ranged Drone

- Role: ranged pressure and area denial.
- The Ranged becomes authoritative and its first-shot timer begins when its complete simulation-owned visual bounds first enter the visible viewport. Renderer completion, texture availability, and fallback selection do not affect this time.
- First shot occurs after exactly `180` running fixed steps (`3.0 s`).
- After each actual shot, the next interval is selected uniformly as an integer
  count of `60–180` fixed steps inclusive through
  `60 + rangedFireStream.nextInt(121)`. A Ranged destroyed before its next shot
  consumes no further attack draw.
- Each Ranged owns an independent `ranged-fire` stream derived from the Mission
  seed with its stable zero-based mission-member ordinal. One Ranged's lifetime,
  firing, or destruction therefore cannot shift another Ranged's cadence.
- Aim uses Aircraft position at the authoritative firing instant.
- After launch, trajectory is fixed. The projectile does not home.
- Projectile speed is `24% VH/s`.
- Projectile damage is `12`.
- Each shot creates one projectile from the central lower muzzle: the
  projectile's horizontal centre matches the Ranged centre and its top edge
  touches the Ranged's bottom edge. It is immediately visible and
  collision-active.
- The Ranged projectile is a solid horizontal `danger` rectangle whose complete
  bounds are `1.2% × 0.6%` of viewport short side. Its AABB equals those complete
  rendered bounds. The horizontal silhouette distinguishes it from the vertical
  player projectile without relying on colour alone.
- It has no artificial lifetime. It is removed on its first valid Aircraft hit
  or after its complete bounds leave the viewport.
- Counterplay: recognise weapon structures, prioritise the platform, and move out of the projected firing line.
- Its authoritative AABB equals its complete configured rectangular rendered
  bounds. Spawn placement, activation, collision, and escape use those same
  bounds rather than an alpha-pixel mask.

### 9.3 Hunter Drone

- Role: kamikaze interceptor that punishes static positioning.
- The Hunter becomes authoritative and begins `Approach` when its complete simulation-owned visual bounds first enter the visible viewport.
- During `Approach`, it steers directly towards the Aircraft's current authoritative centre at `18% VH/s`. It does not predict future Aircraft position or use lead interception.
- It enters `Committed Attack Run` on the first of:
  - vertical distance to Aircraft is at most `35%` of viewport height;
  - `2.0 s` has elapsed since targeting approach began.
- At commitment, direction is fixed and speed becomes `26% VH/s`.
- It does not track the Aircraft after commitment.
- Successful contact deals `35` Hull damage and destroys the Hunter.
- A Hunter destroyed through kamikaze contact grants `0 Credits`.
- A missed Hunter continues downwards and may become `Escaped`, applying `-2 Credits`.
- Counterplay: provoke commitment, displace, or destroy before contact.
- Its authoritative AABB equals its complete configured rectangular rendered
  bounds. Spawn placement, activation, collision, and escape use those same
  bounds rather than an alpha-pixel mask.
- For the approved Mission 01 Seeded Side Placement, the Hunter's complete
  bounds start outside the selected left/right boundary at `20% VH`, with the
  nearest edge touching the boundary. It travels horizontally inward at
  `18% VH/s` until its complete bounds are inside the viewport. Only that
  authoritative step begins `Approach`, targeting, and the `2.0 s` commitment
  timer. Partial visibility does not begin those timers.

### 9.4 Elite Drone

**Role:** first mini-boss and a phase-based threat. It is one authored enemy, not a generic Elite system.

#### Movement

- The Elite enters from above at the authored Mission 03 time and moves to a fixed anchor whose centre is `50% VW, 20% VH`.
- It is not attack-active or phase-active during entry. It becomes active when its centre first reaches the anchor, starts in `Armoured`, and starts all initial phase and attack timers in that same authoritative simulation step.
- The Elite remains around the upper-combat anchor and does not travel downwards to escape.
- Horizontal speed is `12% VW/s`.
- Every `1.5–3.5 s`, a dedicated deterministic RNG stream selects left or right.
- At a horizontal boundary, direction is forced inward.
- Aircraft position does not influence horizontal direction selection.

#### Hull and phase cycle

- Maximum Hull is `60`.
- The cycle is fixed: `Armoured 12 s → Vulnerable 6 s → repeat` until destroyed.
- During `Armoured`, incoming player damage is `0`; the projectile is consumed and a short local deflection flash communicates the valid blocked hit.
- During `Vulnerable`, the exposed Core receives normal projectile damage.
- Phase change must be readable from geometry, not colour alone.

#### Armoured attacks

- Two alien cannons fire one projectile each every `1.5 s`.
- The first cannon pair fires `1.5 s` after Elite activation and later pairs use the same fixed cadence.
- Their trajectories are exactly `-6°` and `+6°` from vertical.
- Projectile speed is `20% VH/s`.
- Each projectile deals `10` Hull damage.
- No shield bubble, full-craft damage flash, homing, or dense bullet pattern is used.

#### Vulnerable attacks

- The Core launches one homing core every `2.5 s`.
- A newly entered Vulnerable phase starts a new Core timer; its first homing Core may launch only after the full `2.5 s` interval.
- At most two homing cores may be active simultaneously.
- Speed is `12% VH/s`.
- Maximum turning rate is `60°/s`.
- Lifetime is `6.0 s`; expiry destroys the projectile without damage.
- Each hit deals `20` Hull damage.

## 10. Player weapons and projectile lifecycle

| Primary Weapon | Damage |   Fire rate | Projectile speed |
| -------------- | -----: | ----------: | ---------------: |
| Machine Gun    |      1 |   5 shots/s |         55% VH/s |
| Cannon         |      3 | 1.5 shots/s |         45% VH/s |

Unaffected MVP rules remain: one equipped Primary Weapon, automatic straight-up fire, no ammo, manual aim, secondary weapon, or reload mechanic.

**Single-hit lifecycle:**

- Machine Gun, Cannon, Ranged, Elite cannon, and Elite homing-core projectiles can damage at most one valid target.
- A projectile is destroyed immediately after its first valid hit, including a blocked hit on an Armoured Elite.
- A projectile is destroyed when completely outside the approved viewport boundary or when its explicit lifetime ends.
- Ranged projectiles have no explicit lifetime; Elite homing Cores retain their
  approved `6.0 s` lifetime. Absence of a Ranged lifetime must not be replaced
  by the player-projectile `2.0 s` value.
- Projectiles do not pierce, ricochet, chain, splash, penetrate, or deal area damage.

## 11. Collision rules

### 11.1 Regular enemies

- A Basic or Ranged collision damages the Aircraft by that enemy's `contact damage`.
- Basic and Ranged do not receive collision Hull damage.
- Collision must not become a profitable attack strategy.
- Minimum positional separation may resolve overlap; it is collision correction, not gameplay knockback.
- No stun, momentum impulse, or gameplay knockback is added.
- The same Aircraft/enemy pair can apply contact damage at most once per `0.75 s`.
- The pair cooldown does not grant immunity from projectiles or another enemy.
- Enemies do not collide with one another.

### 11.2 Hunter exception

Hunter contact follows §9.3. It damages the Aircraft, destroys the Hunter, and grants no reward. The regular pair cooldown does not convert Hunter contact into persistent overlap.

### 11.3 Collision ordering

Defeat has priority over Success and Evacuation completion within the same authoritative simulation step. Duplicate collisions or callbacks must not commit more than one result or reward.

## 12. Economy

| Parameter                            | Credits |
| ------------------------------------ | ------: |
| Starting Credits                     |      12 |
| Basic destroyed by player            |      +1 |
| Basic escaped                        |      -1 |
| Ranged destroyed by player           |      +2 |
| Ranged escaped                       |      -2 |
| Hunter destroyed by player           |      +2 |
| Hunter destroyed by kamikaze contact |       0 |
| Hunter escaped after miss            |      -2 |
| Elite destroyed                      |      +8 |
| Interception 01 completion           |      +8 |
| Interception 02 completion           |     +12 |
| Interception 03 completion           |     +16 |
| Full Repair after Defeat             |       8 |

### 12.1 Pending mission economy

- Combat rewards and escape penalties remain pending during Combat.
- Pending amounts do not mutate persistent Credits.
- Credits are integers and must never be negative.

### 12.2 Success

```text
netCombat = max(0, combatRewards - escapePenalties)
successPayout = netCombat + missionCompletionReward
```

The payout, mission completion, unlock, retained Hull, and cleared `missionInProgress` marker commit in one coherent transaction before the result is presented.

### 12.3 Evacuation

```text
netCombat = max(0, combatRewards - escapePenalties)
evacuationPayout = floor(netCombat * 0.5)
completionReward = 0
```

Evacuation does not complete or unlock a mission. Enemies still active when Evacuation succeeds are neither `Escaped` nor additional penalties.
The payout, retained current Aircraft Hull, unchanged completion/unlock state, and cleared `missionInProgress` marker commit atomically before the result is presented.

### 12.4 Defeat and Repair

- Defeat commits `0` mission reward; all pending combat economy is discarded.
- If persistent Credits are at least `8`, exactly `8` Credits are deducted and Hull becomes `100`.
- If Credits are below `8`, no partial deduction occurs and the run enters `Game Over`.
- Escape penalties can reduce only the current mission's combat contribution to zero. They cannot debit the existing persistent Credit balance.

### 12.5 Replay consequence

Completed missions can be replayed and can earn their normal rewards. No anti-farming mechanic is added in v0.2. This is an accepted playtest risk, not an implementation gap.

## 13. Mission states and transitions

### 13.1 Main flow

```text
Operations
→ Mission Details Overlay
→ Mission start transaction
→ Combat / Active
   ├─ Pause Overlay
   ├─ Settings Overlay
   ├─ Evacuation Confirmation
   ├─ Evacuation Countdown
   ├─ Success Exit Sequence
   ├─ Evacuation Exit Sequence
   └─ Defeat
→ terminal result commitment
→ Mission Result Overlay or Game Over Screen
→ Operations or New Game
```

### 13.2 Mission start transaction

Before Combat becomes active:

1. validate the selected unlocked mission and current loadout;
2. create the immutable Mission Snapshot and Combat seed/streams;
3. persist `missionInProgress` with the mission identity;
4. only after the persistence write succeeds, enter active Combat.

If this write fails, Combat does not start and the existing mission-initialization failure UX applies. No reward or progression changes.

### 13.3 Success

When Success conditions are met:

1. input, automatic fire, damage, collision, projectiles, and further simulation results stop;
2. the result is committed atomically;
3. over exactly `0.5 s` of deterministic exit-sequence time, Aircraft centre X
   moves linearly from its resolved position to `50% VW` while centre Y remains
   fixed;
4. Aircraft then flies straight upwards at `60% VH/s` with no player control;
5. after its complete rendered bounds leave the upper viewport boundary,
   `Mission Result Overlay` opens;
6. `Continue` returns to Operations.

No special enemy fade is required because all enemies are already resolved.
The committed result cannot be altered during this sequence. Resize reprojects
the current exit geometry without restarting either phase; input, automatic
fire, damage, collision, projectiles, spawning, and RNG remain disabled.

### 13.4 Evacuation

`Evacuate` is available during active regular Combat and the Elite encounter. It is a gameplay action, not a free navigation action.

1. Selecting `Evacuate` pauses Combat and opens `Evacuation Confirmation`.
2. The Overlay states that 50% of net earned combat rewards are retained and completion reward/unlock is lost.
3. `Cancel` closes the Overlay and restores the exact prior pause state. An Evacuation Confirmation opened from active Combat resumes only when no browser-safety or other blocking pause remains; one opened from Pause returns to Pause.
4. Confirming resumes Combat and begins an irreversible `5.0 s` / `300`-step Evacuation Countdown.
5. The normal Combat Countdown is replaced by `EVACUATION 00:05`. Displayed seconds equal `ceil(max(0, remainingSteps) / 60)`, and completion occurs on the exact zero step.
6. During countdown, normal controls, automatic fire, damage, enemy behaviour, projectiles, and scheduled encounters continue.
7. If Hull reaches `0` before completion, result is `Defeat`.
8. If Aircraft remains operational at `00:00`, result becomes `Evacuated` immediately.
9. After resolution, input, fire, damage, collisions, and spawns are disabled.
10. Active enemies and enemy projectiles become gameplay-inactive immediately and fade out over exactly `0.5 s`.
11. Over the same exact `0.5 s`, Aircraft centre X moves linearly to `50% VW` while centre Y remains fixed.
12. Aircraft then flies straight upwards at `60% VH/s` with no player control. After its complete rendered bounds leave the upper viewport boundary, the Evacuation result opens.

Evacuation cannot be cancelled after confirmation. `Return to Base` does not exist as an instant-abort path. A Pause action that exposes `Evacuate` must invoke the same confirmation and five-second flow.

**DECISION V02-DEC-027 (2026-09-02):** Confirmation changes the eligible
terminal set. From the confirmation step onward, ordinary Success is suppressed
even if every enemy resolves during the five-second commitment. Only Defeat can
resolve before countdown completion; an operational Aircraft resolves as
Evacuated on the zero step. Scheduled encounters, enemy behaviour, controls,
automatic fire, damage, projectiles, and economy observation continue normally
until one of those two results resolves. This makes the confirmation statement
that completion reward and unlock are lost truthful and irreversible.

Pause, Settings, hidden-tab, and focus-loss safety remain available during the
commitment and stop the Countdown together with all authoritative Combat time.
Returning focus never resumes automatically. After confirmation, `Evacuate` is
not offered again and no Cancel or `Return to Base` action can bypass the
commitment.

**DECISION V02-DEC-028 (2026-09-02):** Successful Evacuation freezes one
immutable result, disables gameplay, starts the enemy/projectile fade and
Aircraft centring concurrently, and then uses the same bounded upward speed as
Success. Resize reprojects the current fade/centring/upward phase without
restarting it. The committed result cannot change during the exit.

### 13.5 Defeat

- Hull `<= 0` ends Combat immediately.
- Defeat has no aircraft centre-and-exit sequence.
- Economy and Repair/Game Over rules in §12.4 commit atomically.
- If Repair succeeds, `Mission Result Overlay` presents the failure and cost; `Continue` returns to Operations.
- If Repair cannot be paid, the application opens the `Game Over Screen`.

### 13.6 Game Over and New Game

The Game Over Screen is a terminal Screen for the current run:

```text
GAME OVER

The aircraft cannot be repaired.
The current operation is over.

[New Game]
```

- Selecting `New Game` opens a blocking confirmation: `Start a new game? Current run progress will be reset.`
- `Cancel` returns to Game Over.
- Confirming deletes/replaces campaign state through an atomic operation, creates a new Pilot, restores Starting Credits and Hull, selects the default weapon, unlocks only Interception 01, and opens Operations.
- New Game does not reset persisted user Settings.
- Game Over does not silently delete campaign data.

### 13.7 Terminal commitment and save recovery

**DECISION V02-DEC-029 (2026-09-02):** Success, Evacuated, Defeat, and Game
Over use one terminal commitment boundary. The Mission Snapshot's exact durable
attempt identity and one frozen immutable result/economy payload flow through an
exactly-once atomic campaign transaction. Result presentation, Evacuation or
Success exit, affordable-Repair failure result, and Game Over navigation may
continue only after that transaction reports `committed`.

If the terminal write fails or rejects, Combat remains terminal and frozen and
the blocking Overlay is exactly:

```text
Save Error

Mission result could not be saved. Combat remains paused.

[Retry Save]
```

`Retry Save` is single-flight and retries the same frozen payload. It must not
resume gameplay, recalculate economy, create another result, or start an exit.
Repeated failure remains Save Error. If retry becomes inert because durable
campaign authority changed, the blocking Overlay becomes exactly:

```text
Save Conflict

Campaign data changed in another session. Reload to continue.

[Reload]
```

Reload is browser navigation only. Neither Overlay closes through Esc or Scrim.
If a commit completes while a browser-safety manual-resume latch is set, the
only continuation is explicit `Resume`; Return to Base, Settings, Debug, Retry,
or another result action is not exposed. Defeat retains priority over Success
and Evacuation completion on the same authoritative step, and no callback can
commit a second terminal result.

## 14. Persistence and browser lifecycle

### 14.1 Dexie foundation

**DECISION V02-DEC-004:** Use exactly pinned `dexie@4.4.5` as the versioned IndexedDB persistence adapter. The implementing Work Item must update both `package.json` and `package-lock.json`, record the dependency in the Technical Foundation, and pass the repository dependency/lockfile gates.

Persisted campaign data contains at least:

- numeric `schemaVersion`;
- `runStatus: active | gameOver` or an equivalent closed discriminant;
- Credits;
- Pilot identity;
- Aircraft Hull;
- equipped Primary Weapon;
- unlocked mission IDs;
- completed mission IDs;
- `missionInProgress` mission identity or `null`.

User Settings are persisted separately from campaign state. New Game does not reset `Mouse Movement Enabled`.

### 14.2 Write and recovery rules

- Mission start and terminal result are coherent transactions.
- UI and Phaser callbacks do not mutate persisted state directly.
- Repeated initialization or result callbacks must not duplicate rewards, costs, unlocks, Pilots, or runs.
- Persisted input is untrusted and must be validated before use.
- Supported older schema versions migrate deterministically before the run opens.
- A migration or validation failure must not silently create a New Game or overwrite the unreadable data.
- The application shows:

```text
SAVE DATA ERROR

Saved game data could not be loaded.

[Start New Game]
```

- Debug diagnostics record the validation/migration cause without exposing secrets.
- Selecting `Start New Game` uses the destructive confirmation before replacing campaign state.

### 14.3 Refresh or close during active mission

- The persisted `missionInProgress` marker is the recovery authority.
- A refresh, close, crash, or next startup that finds `missionInProgress` resolves that mission exactly once as Defeat.
- Normal `0 reward`, Repair, and Game Over rules apply.
- Active Combat entities and exact mid-mission state are not restored.
- Refresh must not become a free abort or duplicate a terminal result.

### 14.4 Hidden tab and focus loss

- When the browser loses focus or the tab becomes hidden, simulation, Mission Clock, Combat Countdown, Evacuation Countdown, movement, firing, projectiles, RNG consumption, and spawning pause.
- Returning focus does not resume Combat automatically.
- The player sees a paused state and must select `Resume`.
- Existing blocking Overlay and safety-pause precedence from the MVP remain.
- Repeated lifecycle events are idempotent.

Unaffected MVP resize/reprojection, supported desktop-browser, keyboard/mouse, and below-minimum viewport recovery rules remain authoritative.

## 15. Combat HUD and result UX

### 15.1 Persistent Combat UI

The Combat Screen shows only:

- non-numeric `Hull Integrity Bar` beneath the Aircraft;
- `Combat Countdown`;
- `Pause Button`;
- `Settings Button`;
- `Evacuate` action while the mission is active;
- `Evacuation Countdown` only after confirmation.

`Pause Button` and `Settings Button` remain utility controls, not Combat HUD data.

### 15.2 Combat Countdown

- The Countdown is horizontally centred at the top of the viewport with the
  canonical `space-4` top offset.
- Its displayed whole seconds are
  `ceil(max(0, finalArrivalTimeSeconds - missionTimeSeconds))`, formatted as
  `MM:SS`. It therefore never displays `00:00` before the exact final Arrival
  Group step.
- It displays time until the final scheduled enemy arrival.
- It reaches `00:00` at `03:10`, `04:20`, and `05:20` for Missions 01–03 respectively.
- At `00:00`, it remains visible at `00:00` until a terminal result resolves or Evacuation replaces it. It must not imply Success while enemies remain.
- During Evacuation it is replaced, not shown beside the Evacuation Countdown.

### 15.3 Critical Hull

- While Hull is below `25`, the Hull Bar fill uses the canonical `danger`
  presentation; at `25` it does not.
- `CRITICAL HULL` appears directly below the Combat Countdown for exactly
  `2.0 s` once per Mission Instance. It appears immediately on Combat entry when
  starting Hull is below `25`, otherwise on the first transition from `≥25` to
  `<25`.
- The message does not repeat while Hull remains below the threshold, after
  later healing, or after a resize. A new Mission Instance owns a new one-time
  latch.
- No full-screen flash, persistent vignette, siren, audio, or numeric Hull is added.

### 15.4 Mission Result Overlay

Success shows:

- `MISSION COMPLETE`;
- Destroyed and Escaped counts;
- Combat rewards;
- Completion reward;
- Escape penalties;
- total Credits earned;
- newly unlocked mission, only when one was newly unlocked;
- `Continue`.

Evacuation shows:

- `EVACUATED`;
- Destroyed and Escaped counts frozen at successful Evacuation;
- net earned rewards and `Retained 50%`;
- total Credits earned;
- `Mission not completed`;
- `Continue`.

Defeat after affordable Repair shows:

- `MISSION FAILED`;
- `Mission reward 0`;
- `Repair cost -8 Credits`;
- `Continue`.

The result does not show duration, score, DPS, wave number, enemy HP, or speculative statistics. Result presentation reads committed state and is not the mutation owner.

## 16. Enemy visual and asset requirements

### 16.1 Shared production contract

**DECISION (2026-08-28):** `V02-DEC-015–017` reuse bounded Boot preparation for enemy assets, define role-specific procedural fallbacks, and separate WI-01 asset-layer evidence from WI-07 final three-mission traversal acceptance.

- Exactly five enemy gameplay sprites are required:
  - `basic-drone.png`;
  - `ranged-drone.png`;
  - `hunter-drone.png`;
  - `elite-drone-armoured.png`;
  - `elite-drone-vulnerable.png`.
- Approved full-resolution originals live under `assets/source/enemies/` and never ship or load at runtime.
- Prepared runtime files live under `assets/runtime/enemies/` and use lossless PNG with real alpha transparency, no baked background, no ground shadow, and no surrounding UI/text.
- View is exact top-down orthographic; craft is centred, fully visible, and oriented nose-down towards the player.
- Role recognition must work at approved gameplay scale, in grayscale, and without text, glow, or colour-only coding.
- Lighting, rendering quality, tone, and restrained dark metallic palette form one coherent set.
- Runtime scale and complete rendered bounds are presentation/content values and must be verified at the minimum supported viewport in `V02-WI-01`. Authoritative gameplay hitbox mapping is verified by the Work Item that introduces each enemy's simulation consumer: regular enemies in `V02-WI-04` and Elite in `V02-WI-06`.
- Assets must be registered in the central runtime catalogue and added to the existing bounded Boot preload. The approved manifest therefore grows from twelve to seventeen entries. All five enemy image requests start in parallel with the existing non-critical runtime assets, use the same `5 s` deadline, and are requested no more than once per page load by application loading logic.
- Each enemy asset is fixed as prepared or fallback for the complete page-load session when the Boot preload settles or reaches its deadline. A late completion is inert. Combat consumes the prepared result and must not issue a second request, introduce another loading state, or replace a fallback later.
- The five-file enemy runtime pack must not exceed `450,000 bytes`. The complete runtime asset manifest must remain within the existing `2 MiB` on-disk budget; the v0.2 decision does not relax that budget.

### 16.2 Regular family

Basic, Ranged, and Hunter are human-made modern/near-future military UAVs from the same manufacturing ecosystem. They share materials, panel language, sensor logic, and engine treatment. They must not use alien/hybrid geometry.

- Basic: wide, short, simple, swept-wing silhouette; no prominent guns; approximately `1.7–1.9:1` width-to-length visual ratio.
- Ranged: heavier/wider gun platform; two weapon housings alter the silhouette; approximately `1.2×` Basic footprint; must not be a recoloured Basic.
- Hunter: narrow, elongated, pointed, propulsion-focused interceptor; approximately `0.8×` Basic footprint; must remain an aircraft, not a missile.

### 16.3 Elite family

- Elite is a distinct alien/hybrid engineered machine, not an organic creature or enlarged regular drone.
- Silhouette is broad manta/flattened diamond with two integrated cannon structures and a dominant central housing.
- Target footprint is approximately `2.3–2.6×` Basic.
- Armoured and Vulnerable sprites depict the same craft, framing, outer silhouette, weapons, materials, and lighting.
- Vulnerable geometry visibly retracts connected armour plates and exposes a centred engineered Core.
- The Core uses one restrained pale-cyan accent. Geometry, not the accent, communicates vulnerability.
- No shield bubble, large bloom, aura, lightning, beams, decorative neon, or biological elements.

### 16.4 Current asset audit

**FACT (2026-08-25):** Five approved full-resolution RGBA PNG files were recovered. Basic, Ranged, and Hunter were regenerated as one human-made military UAV family. Elite Armoured and Elite Vulnerable were not changed.

Automated preparation checks confirm that every file contains real transparent pixels. A colour sheet, grayscale sheet, and approximate gameplay-scale sheet were generated for the five-sprite acceptance pass. Basic, Ranged, and Hunter now differ through silhouette and role geometry rather than colour.

**DECISION (2026-08-25):** The Product Owner visually approved the complete five-sprite set after reviewing the colour, grayscale, and approximate gameplay-scale comparison sheets. `V02-AC-024` is accepted at the product-definition checkpoint. Implementation must still verify actual runtime mapping, scaling, fallback, and production-build asset behaviour under `V02-AC-025`.

**FACT (2026-08-26):** The approved originals are preserved under `assets/source/enemies/`. Deterministic downscaling produced the five runtime PNGs without generative redraw: Basic `192×101`, Ranged `224×163`, Hunter `114×192`, Elite Armoured `214×320`, and Elite Vulnerable `281×320`. All retain alpha. Their combined runtime size is `221,772 bytes`; the complete runtime asset set is `1,800,725 bytes`, within the existing `2 MiB` limit.

**PROVENANCE:** The sprites are Product-Owner-provided and Product-Owner-approved AI-assisted project assets. The exact generator/session chain was not recoverable from the lost chats. This known limitation is recorded in `assets/licenses/enemy-sprites-provenance.md`. These files may be used for local development and evaluation; external distribution remains blocked until the Product Owner confirms the required rights evidence.

### 16.5 Approved procedural fallbacks

An unavailable or timed-out enemy sprite uses a stable procedural fallback with the same configured centre, complete rendered bounds, orientation, and gameplay-scale footprint as its prepared sprite. Fallback selection never changes simulation timing, authoritative bounds, hitbox ownership, or enemy state. The fallback uses existing approved Combat presentation tokens and must remain distinguishable in grayscale through geometry rather than colour alone.

- Basic uses a wide, short swept-wing shape without prominent weapon blocks.
- Ranged uses a wider heavy-platform shape with two visible weapon housings.
- Hunter uses a narrow, elongated pointed-interceptor shape and must not read as a missile.
- Elite Armoured uses the approved large manta/flattened-diamond outer shape with a geometrically closed central housing.
- Elite Vulnerable retains the exact same outer Elite silhouette and weapon placement while exposing a centred geometric Core opening.

The fallback contains no text, shield bubble, glow, aura, lightning, beam, animation, or decorative effect. Existing rendered fallback objects are not replaced if an image completes late.

## 17. Debug and observability

F1 Debug remains development-only and must invoke authoritative commands rather than duplicate gameplay logic.

The v0.2 Debug Overlay must expose:

- Combat seed;
- Mission Clock and Combat Countdown;
- current Encounter ID;
- active enemy count by type;
- Destroyed count by type and cause;
- Escaped count by type;
- pending combat rewards and escape penalties;
- current Elite phase and phase time, when applicable;
- `missionInProgress` and `runStatus`;
- force Success, Defeat, and successful Evacuation through normal resolution;
- set Credits and Hull;
- spawn each approved enemy/Encounter as permitted by deterministic debug commands;
- move Elite to Armoured or Vulnerable through the authoritative phase logic;
- simulate next-start recovery from `missionInProgress` and insufficient-Repair Game Over;
- path-qualified validation or migration failure diagnostics.

Production mode must not expose Debug UI or development seeds/logs outside the approved diagnostics boundary.

## 18. Negative requirements

v0.2 must not:

- become a bullet hell or use entity spam as the primary difficulty source;
- alter authored spawns in reaction to Aircraft position or performance;
- use unseeded randomness in authoritative behaviour;
- permit free instant abort, Evacuation cancellation after confirmation, or automatic resume after focus returns;
- stop scheduled encounters during the five-second Evacuation Countdown;
- count enemies remaining after successful Evacuation as Escaped;
- grant completion/unlock for Evacuation or Defeat;
- commit pending rewards after Defeat;
- grant reward for Hunter kamikaze contact;
- let penalties debit pre-existing persistent Credits or make Credits negative;
- provide free emergency Repair;
- serialize or resume active Combat across restart;
- silently delete/replace corrupted campaign data or Game Over data;
- allow duplicate reward, cost, unlock, Pilot, or result commitment;
- use projectile piercing, splash, ricochet, chain damage, or area damage;
- damage Basic or Ranged through Aircraft collision;
- introduce gameplay knockback, stun, or momentum impulse;
- identify an enemy only by colour or firing effect;
- use alien/hybrid geometry for Basic, Ranged, or Hunter;
- add future mechanics, content fields, generic systems, or disabled placeholders outside §3.1;
- make UI, Phaser, Dexie, or React an authoritative gameplay/economy owner;
- weaken existing architecture, performance, verification, accessibility, asset, narrative, or delivery gates.

## 19. Acceptance criteria

### V02-AC-001 — Initial progression

**Given** a New Game, **when** Operations opens, **then** Interception 01 is unlocked, Interception 02 and 03 are visible and locked, Credits equal 12, Hull equals 100, and no mission is in progress.

### V02-AC-002 — Unlock and replay

**Given** an unlocked mission, **when** it first resolves as Success, **then** it is marked completed and only its defined next mission is unlocked exactly once; replay remains available and uses the same contract.

### V02-AC-003 — Authored timeline determinism

**Given** the same mission, seed, viewport, and command sequence, **when** Combat reaches the final authored time, **then** Encounter IDs, Arrival Group offsets, ordered members, normalized Spawn Placements, entry variants, and RNG-dependent behaviour are identical; Mission 01 consumes its three Hunter side draws exactly in `e3 → e4 → e5` order, Mission 02 consumes its three side draws exactly for `e4 delayed Basic → e5 Hunter → e6 Hunter`, and every Top Placement consumes no draw.

### V02-AC-004 — No Reactive Spawn Cheating

**Given** two runs with different Aircraft positions but the same mission seed, **when** each authored Arrival Group spawns, **then** its time, ordered members, normalized placement values, and seeded side selections are unchanged by Aircraft position, Hull, loadout, score, or performance; the current engagement-band dimensions may only project the already-authored normalized Top fraction.

### V02-AC-005 — Countdown semantics

**Given** active enemies remain after the final scheduled arrival, **when** Combat Countdown reaches `00:00` using the §15.2 ceiling formula, **then** it does so on the exact final Arrival Group step, remains visible at `00:00`, no further Encounter spawns, and Combat continues without granting Success until all required enemies resolve or Evacuation replaces the Countdown.

### V02-AC-006 — Ranged attack

**Given** a Ranged Drone's complete authoritative visual bounds first enter the viewport, **when** `180` running fixed steps elapse, **then** it fires one §9.2 projectile from the central lower muzzle at the Aircraft's current position; renderer/texture completion does not affect activation, each later interval is exactly `60 + nextInt(121)` steps from that Ranged's independent stream, another Ranged cannot shift its cadence, and launched projectiles do not home or inherit the player-projectile lifetime.

### V02-AC-007 — Hunter commitment

**Given** an authored regular Hunter is created at its seeded Side Placement, **when** it enters, **then** it moves horizontally inward at `18% VH/s` and neither targets nor advances its commitment timer until its complete authoritative bounds are inside the viewport; **when** `Approach` begins, it steers directly towards the Aircraft's current centre without predictive lead; **when** either commit condition first occurs, direction locks, speed becomes `26% VH/s`, and later Aircraft movement does not bend the attack run.

### V02-AC-008 — Hunter outcomes

**Given** a committed Hunter, **when** it contacts the Aircraft, **then** it deals 35 damage, becomes Destroyed, and adds 0 Credits; **when** it misses and crosses the bottom boundary, **then** it becomes Escaped and adds a 2-Credit penalty.

### V02-AC-009 — Elite phases

**Given** an Elite enters from above, **when** it reaches its `50% VW, 20% VH` anchor, **then** it becomes active in Armoured and starts its timers; **when** the fixed phase timers advance, **then** it alternates 12 seconds Armoured and 6 seconds Vulnerable; blocked hits deal zero and consume the projectile, while Vulnerable hits deal normal weapon damage.

### V02-AC-010 — Elite attack bounds

**Given** an active Elite encounter, **when** its attacks run, **then** the first cannon pair waits 1.5 seconds, trajectories are exactly `−6°/+6°`, each new Vulnerable phase waits 2.5 seconds before its first Core, all other cadence/speed/damage/active-cap/turn/lifetime values match §9.4, and the approved representative scenario never creates a guaranteed collision.

### V02-AC-011 — Single-hit projectiles

**Given** any approved projectile overlaps more than one valid target in one step, **when** collision resolves in stable order, **then** only the first valid target is affected and the projectile is removed.

### V02-AC-012 — Regular contact cooldown

**Given** Aircraft overlaps one Basic or Ranged enemy continuously, **when** less than 0.75 seconds has passed since that pair's prior contact damage, **then** no second contact damage occurs; other projectile and enemy damage remains active.

### V02-AC-013 — Success economy

**Given** a mission resolves as Success, **when** its result commits, **then** payout equals `max(0, rewards - penalties) + completion`, retained Hull and progression update once, and persistent Credits cannot decrease.

### V02-AC-014 — Evacuation commitment

**Given** Evacuation Confirmation is cancelled, **when** it closes, **then** it restores the exact prior active/Pause state subject to browser-safety blocking; **given** Evacuation is confirmed, **when** its exact `300`-step countdown runs, **then** normal Combat and scheduled encounters continue, Success is suppressed, the action cannot be cancelled or selected again, Pause/Settings/browser-safety stop all authoritative time, and Hull zero resolves Defeat before Evacuation.

### V02-AC-015 — Evacuation result

**Given** Aircraft remains operational at Evacuation `00:00`, **when** the result freezes, **then** payout equals `floor(max(0, rewards - penalties) × 0.5)`, current Hull is retained, no completion/unlock occurs, remaining enemies add no penalties, gameplay stops, enemies/projectiles fade over exactly `0.5 s` while Aircraft centres over exactly `0.5 s`, Aircraft then exits upward at `60% VH/s`, and the committed result appears only after its complete bounds leave the viewport.

### V02-AC-016 — Defeat and Game Over

**Given** Defeat, **when** Credits are at least 8, **then** reward is zero, 8 Credits are deducted, Hull becomes 100, and the failure result opens; **when** Credits are below 8, **then** no partial repair occurs and Game Over opens.

### V02-AC-017 — New Game separation

**Given** Game Over, **when** New Game is explicitly confirmed, **then** campaign state resets atomically while persisted user Settings remain unchanged.

### V02-AC-018 — Active-mission refresh recovery

**Given** `missionInProgress` is persisted and no terminal result committed, **when** the application starts again, **then** the mission resolves exactly once as Defeat and normal Repair/Game Over rules apply without restoring Combat.

### V02-AC-019 — Hidden-tab pause

**Given** active Combat or Evacuation, **when** the tab becomes hidden or focus is lost, **then** all authoritative time, spawning, movement, firing, projectiles, and RNG consumption pause and do not resume until explicit Resume.

### V02-AC-020 — Atomic persistence

**Given** repeated browser callbacks or UI activation, **when** mission start or a terminal result is processed, **then** campaign state contains one coherent before/after version with no duplicate reward, cost, unlock, or Pilot.

### V02-AC-021 — Corrupted save

**Given** validation or migration fails, **when** Boot reads campaign data, **then** the error Screen opens, existing data is not overwritten, diagnostics identify the cause, and only an explicitly confirmed New Game replaces it.

### V02-AC-022 — Minimal Combat UI

**Given** active Combat, **when** no context-specific state applies, **then** only the Hull Bar, Combat Countdown, utility controls, and Evacuate action are visible; when Hull begins below `25` or first crosses below it, the exact one-time Critical Hull behaviour in §15.3 applies; no prohibited counters or metrics are shown.

### V02-AC-023 — Result UX

**Given** Success commits, **when** its exit begins, **then** gameplay and result
mutation remain disabled through the exact centre-and-up sequence in §13.3,
including resize, and the result UI opens only after the Aircraft's complete
bounds leave the viewport; **given** Evacuation commits, **when** its exit
begins, **then** the exact concurrent fade/centring and subsequent upward phase
in §13.4 run without result mutation and the result UI opens only after the
Aircraft's complete bounds leave the viewport; **given** Success, Evacuation, or affordable-Repair
Defeat, **when** committed result UI opens, **then** it shows only the applicable
values in §15.4 and cannot mutate them a second time.

### V02-AC-024 — Enemy visual vocabulary

**Given** approved gameplay scale at the minimum supported viewport, **when** the five sprites are inspected in colour and grayscale, **then** Basic, Ranged, Hunter, Elite Armoured, and Elite Vulnerable are distinguishable by silhouette/geometry, all backgrounds are truly transparent, regular enemies read as one human-made family, and Elite states read as the same alien/hybrid craft.

### V02-AC-025 — Asset runtime contract

**Given** a production build traverses all three missions, **when** asset requests and rendering are inspected, **then** only approved runtime PNGs load through the central catalogue/preload rules, no source/remote image ships, each role maps to the correct asset, and failure uses a stable approved fallback.

### V02-AC-026 — Debug authority

**Given** development Debug is enabled, **when** a forced outcome or phase action is used, **then** the same authoritative transition and persistence rules run; production mode exposes none of the Debug UI.

### V02-AC-027 — Cleanup and repeated missions

**Given** five consecutive missions including Success, Evacuation, and Defeat, **when** each Combat runtime ends, **then** obsolete entities, timers, RNG streams, subscriptions, Phaser resources, and persistence transactions do not remain active or duplicate.

### V02-AC-028 — Representative performance workload

**Given** the densest approved overlapping encounter and Elite attack phase at `1366×768`, **when** the production build is measured through the approved procedure, **then** entity maxima, sustained FPS, frame-time distribution, long tasks, cleanup, and memory evidence meet the existing budgets; proxy evidence is not misreported as physical reference-device validation.

## 20. Verification and traceability requirements

Source-qualified traceability for `V02-AC-001`–`V02-AC-028` is maintained in `MVP_TRACEABILITY_MATRIX_v0.1.md`. Bounded implementation ownership and gate order are maintained in `SHMUP_V0.2_IMPLEMENTATION_SLICES.md`.

### 20.1 Approved representative workloads

All proxy runs use a production build at `1366×768`, the recorded build identifier, fixed simulation step, the canonical mission seed for the scenario, and the same browser/machine for pre-change and post-integration comparison.

**Legacy proxy baseline:** the accepted v0.1 final group of five Basic Drones with continuous Machine Gun fire. Record maximum active enemies, player projectiles, collision pairs, sustained FPS, mean/p95/p99 frame time, repeatable long tasks, post-Combat cleanup, and available heap or allocation/GC evidence.

**Regular v0.2 workload:** the Mission 01 `03:10` encounter with `3 Basic + 1 Ranged + 1 Hunter`, authored stagger preserved, all five enemies concurrently active when reachable, continuous Machine Gun fire, and the fixed Ranged/Hunter RNG path. The measurement records observed maximum active player/enemy projectiles and collision pairs; it must not substitute a smaller hand-authored approximation.

**Elite v0.2 workload:** one active Elite at its approved anchor, one complete Armoured phase followed by one complete Vulnerable phase, continuous Machine Gun fire, both cannon streams active, and the active homing-Core cap reached where the canonical seed permits. The run records the same fields and verifies the cap of two homing Cores.

The pre-change record uses the legacy proxy because v0.2 entities do not exist in the baseline. Post-integration acceptance reruns the unchanged legacy proxy and both v0.2 workloads. A proxy result is never reported as physical reference-device certification.

Implementation acceptance requires:

- deterministic unit tests for content validation, timelines, RNG draw order, attacks, projectiles, collision, economy, transitions, persistence recovery, and idempotency;
- DOM tests for locked mission points, confirmations, countdown replacement, result copy, Game Over, save error, focus trapping, and keyboard operation;
- browser evidence for start/result transactions, hidden-tab pause, refresh-as-Defeat, lazy Combat disposal, assets, and supported viewport behaviour;
- visual human acceptance at real gameplay scale for all five enemy roles and both Elite states;
- pre-change and post-integration performance evidence against the same production-build workload;
- existing `npm run verify`, applicable browser/full gates, architecture checks, asset hygiene, licence, build, and delivery gates;
- physical reference-device validation before external playtest or minimum-system-requirement claims.

No implementation handoff is created by this document.

## 21. Superseded MVP behaviours

| MVP behaviour                                        | v0.2 replacement                                              |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| one Interception mission                             | three authored Interception Missions                          |
| one Basic Drone type                                 | Basic, Ranged, Hunter, and one Elite                          |
| no enemy ranged attacks                              | Ranged and Elite attacks in §9                                |
| fixed MVP group schedule/final group at 110 s        | mission-specific authored timelines and final arrivals        |
| Enemy escape has no penalty                          | per-type escape penalties in §12                              |
| Success always grants exactly +1 Credit              | pending combat economy plus mission completion rewards        |
| Defeat gives free recovery to 25 Hull                | zero reward; paid full Repair or Game Over                    |
| no Game Over                                         | persisted terminal Game Over with confirmed New Game          |
| `Return to Base` gives instant Aborted result        | removed; Evacuation is the only voluntary mission exit        |
| minimal HUD without countdown/evacuation             | minimal v0.2 HUD in §15                                       |
| refresh discards session and creates a fresh session | versioned persistence; active-mission refresh resolves Defeat |
| session-only Settings                                | user Settings persist separately from campaign state          |
| one visible available Mission Point                  | three visible points with locked/available/completed states   |
| MVP collision/contact values                         | v0.2 regular and Hunter collision rules in §11                |
| MVP weapon balance                                   | v0.2 weapon table in §10                                      |

Unaffected MVP control, movement-bound, deterministic AABB, pause/Settings precedence, resize, accessibility, UI-component, performance, architecture, narrative, and delivery rules remain active.

## 22. Decision record

| ID          | Status   | Decision                                            | Consequence                                             |
| ----------- | -------- | --------------------------------------------------- | ------------------------------------------------------- |
| V02-DEC-001 | Approved | Fair/readable but not easy tactical-military Shmup  | difficulty through readable tactical demands, not spam  |
| V02-DEC-002 | Approved | Introduce → Reinforce → Combine → Test              | three authored mission learning curves                  |
| V02-DEC-003 | Approved | No Reactive Spawn Cheating                          | spawns cannot adapt to current player state             |
| V02-DEC-004 | Approved | Dexie versioned persistence foundation              | local campaign persistence without active-Combat resume |
| V02-DEC-005 | Approved | Evacuation retains 50% of floored net combat reward | five-second irreversible risk-management exit           |
| V02-DEC-006 | Approved | paid Repair and true Game Over                      | Defeat has persistent economic stakes                   |
| V02-DEC-007 | Approved | single-hit projectile lifecycle                     | no piercing/splash/ricochet/chain damage                |
| V02-DEC-008 | Approved | regular collision cannot damage enemies             | Hunter remains explicit kamikaze exception              |
| V02-DEC-009 | Approved | direct Hunter steering; no predictive interception   | deterministic readable approach before commitment       |
| V02-DEC-010 | Approved | Elite anchor `50% VW, 20% VH`; timers start on arrival | entry cannot attack or consume phase time                |
| V02-DEC-011 | Approved | exact Elite angles and full initial attack intervals | no approximate or immediate first attacks                |
| V02-DEC-012 | Approved | Countdown remains at `00:00` until replacement/result | no ambiguous terminal-countdown UI                       |
| V02-DEC-013 | Approved | Evacuation restores prior pause state and retains Hull | deterministic cancellation and campaign transaction     |
| V02-DEC-014 | Approved | source/runtime split and `450,000-byte` enemy budget | preserves approved art without relaxing the 2 MiB cap    |
| V02-DEC-015 | Approved | preload five enemy sprites through bounded Boot      | one established `5 s` lifecycle; no second Combat loader |
| V02-DEC-016 | Approved | role-specific procedural enemy fallbacks             | failed images remain readable without invented gameplay  |
| V02-DEC-017 | Approved | split AC-025 implementation and traversal evidence   | WI-01 owns asset contract; WI-07 owns final traversal     |
| V02-DEC-018 | Approved | normalized authored placement and resize projection | no raw-pixel staging or resize rerolls                    |
| V02-DEC-019 | Approved | regular-enemy AABB equals complete rendered bounds  | one authoritative rectangle for entry/collision/escape   |
| V02-DEC-020 | Approved | Hunter enters horizontally before Approach          | targeting and commit timer begin only fully in viewport   |
| V02-DEC-021 | Approved | exact five-Encounter Mission 01 staging              | final arrival remains exactly `03:10`                     |
| V02-DEC-022 | Approved | minimal typed Arrival Groups and Spawn Placements    | no hidden formation logic or generic formation DSL        |
| V02-DEC-023 | Approved | exact Ranged projectile and per-enemy cadence stream | readable geometry and no cross-enemy RNG coupling          |
| V02-DEC-024 | Approved | exact Countdown and Critical Hull presentation       | deterministic display and one warning per Mission Instance |
| V02-DEC-025 | Approved | two-phase deterministic Success exit                 | committed result appears after a bounded readable exit     |
| V02-DEC-026 | Approved | exact six-Encounter Mission 02 staging               | runtime geometry is explicit and final arrival remains `04:20` |
| V02-DEC-027 | Approved | confirmed Evacuation suppresses Success              | the irreversible commitment has only Defeat/Evacuated outcomes |
| V02-DEC-028 | Approved | exact deterministic Evacuation exit                  | fade, centring, upward flight, and resize are unambiguous   |
| V02-DEC-029 | Approved | shared terminal commitment and recovery contract     | all outcomes save exactly once before presentation or exit  |

## 23. Consistency and Definition of Ready audit

### 23.1 Passed areas

The audit found no unresolved S0–S2 product gap for `V02-WI-05` in:

- problem/outcome and player context;
- IN/OUT scope;
- three mission timelines and mission-resolution semantics;
- Enemy Vocabulary, behaviours, counters, and numeric tuning;
- player weapons, projectile lifecycle, and collisions;
- economy formulas, integer rounding, Repair, and Game Over;
- states, transitions, Evacuation commitment, and exit sequences;
- mission unlock/replay;
- Dexie ownership, atomic persistence, refresh/close, corrupted data, and hidden-tab behaviour;
- HUD, result UX, negative requirements, Debug, and observability;
- Design System v0.2 presentation overrides and the bounded WI-04→WI-05
  compatibility-seam removal owner;
- architecture and repository ownership;
- acceptance coverage and required verification types.
- source-qualified v0.2 traceability and bounded Work Item ownership;
- representative regular, Elite, and legacy-proxy performance workloads.

Mission 02 exact Arrival Groups, Spawn Placements, RNG ownership, final arrival,
Evacuation terminal set, countdown, exit geometry, and terminal-save recovery
are now explicit. The WI-04 temporary Defeat/Return-to-Base compatibility seam
has one removal owner in WI-05 and is not an alternate accepted v0.2 path.

**BOUNDED FUTURE GAP:** Mission 03 retains qualitative entry and formation
language without complete numeric regular-enemy Arrival Groups. This does not
block Mission 02 or `V02-WI-05`; it makes the affected runtime portion of
`V02-WI-06` NOT READY until its Product Owner staging decision is recorded.
WI-06 must not infer geometry from Mission 01, Mission 02, or implementation
convenience.

### 23.2 Visual acceptance closure

**FACT:** Basic, Ranged, and Hunter contain real transparent pixels and satisfy the approved regular-enemy family direction in the prepared colour, grayscale, and approximate gameplay-scale comparison sheets. Elite Armoured and Elite Vulnerable remain the approved alien/hybrid state pair.

**DECISION (2026-08-25):** The Product Owner approved the complete visual set without requested corrections.

**AUDIT RESULT:** No S0–S2 product-definition blocker remains. The production-prepared PNGs preserve the approved silhouettes and alpha while meeting the approved pack and complete-manifest budgets. Runtime mapping, exact in-engine scale, fallback behaviour, build inclusion, and performance remain implementation acceptance work governed by `V02-AC-025`, `V02-AC-028`, and the existing verification package; they are not unresolved product decisions.

## 24. Readiness verdict

**APPROVED — V02-WI-05 READY FOR BOUNDED HANDOFF**

The Mission 02 and alternative-outcome product-definition, consistency,
traceability, and Definition of Ready audits have no unresolved S0–S2 blocker. Implementation may
begin only through one separately authorized Work Item handoff at a time,
following `SHMUP_V0.2_IMPLEMENTATION_SLICES.md` and repository governance. This
document does not itself start implementation or authorize the whole Epic as one
unbounded assignment. Mission 03 runtime staging remains subject to the bounded
future gap in §23.1.

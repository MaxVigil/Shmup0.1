# MVP Implementation Slices v0.1

**Product:** Shmup  
**Scope:** Canonical implementation sequence and execution boundaries  
**Status:** APPROVED  
**Decision owner:** Product Owner  
**Approved:** 2026-08-20

## 1. Purpose

This document defines the only canonical implementation-slice structure for the MVP. It sequences already approved requirements; it does not create, replace, weaken, or summarize their product behaviour.

The MVP contains exactly fourteen slices, `S01` through `S14`. A slice is an acceptance boundary and produces one coherent increment. A work item is an execution unit inside a slice and is never an additional slice.

## 2. Execution model

### 2.1 Stable hierarchy

```text
MVP
└── Slice S01–S14
    └── optional Work Item Sxx-WIyy
```

- Slice IDs, names, scope boundaries, and order are stable.
- Compact slices may be assigned to an implementation agent as one complete task.
- A large or high-risk slice may be executed through sequential work items.
- Work-item completion leaves the parent Slice `In Progress`.
- Only slice-level integration, all applicable source-qualified Acceptance Criteria, required gates, and manual evidence can make a Slice `Accepted`.
- A handoff must say `Slice Sxx` or `Work Item Sxx-WIyy within Slice Sxx`. It must never present a work item as a complete slice.

Creating `S15`, renumbering, splitting, merging, or materially changing a slice requires an explicit Product Owner decision and an update to this document. Replanning work items inside an unchanged slice does not change product scope.

### 2.2 Requirement authority

Source specifications and the Traceability Matrix remain authoritative for product behaviour and Acceptance Criteria. The AC mappings below identify primary delivery ownership; they are not rewritten AC text and are not necessarily exclusive. Later integration slices may re-verify earlier criteria.

Technical completion criteria use `Sxx-TC-*`. They are delivery constraints derived from approved technical documents, not new product behaviour and not substitutes for source-qualified AC.

### 2.3 Status model

Each Slice has one status:

- `Not Started`;
- `In Progress`;
- `Accepted`.

An implementation report cannot mark a Slice `Accepted`; acceptance remains a review decision after required evidence is available.

## 3. Canonical slice registry

| ID | Slice | Primary outcome | Size | Dependency | Recommended execution |
|---:|---|---|:---:|---|---|
| S01 | Domain and Content Foundation | Typed Domain/Content foundation, validation, deterministic RNG, geometry, and test fixtures | M | Scaffold | One complete Slice task |
| S02 | Session Store and Application Boot | One initialized session, application-owned state, Pilot selection, and bounded Boot/fatal-startup coordination | L | S01 | Work items permitted |
| S03 | Design System and Application Shell | Approved tokens, assets, primitives, Screen/Overlay shell, responsive and focus foundations | L | S02 | Work items permitted |
| S04 | Base Navigation and Settings | Operations/Hangar navigation, blocking, Settings Overlay, and shared Mouse Movement setting | M | S03 | One complete Slice task preferred |
| S05 | Operations and Mission Details | Operations composition, Mission Point, Interception card, and Start/Cancel interaction | M | S04 | One complete Slice task preferred |
| S06 | Hangar, Weapon Selection and Repair | Aircraft/Pilot/Hull presentation, weapon selection transaction, Repair rules, and Credits transaction | L | S04 | Work items permitted |
| S07 | Mission Boundary and Combat Shell | Mission Snapshot, one accepted start, lazy Combat boundary, canvas/HUD shell, and cleanup contract | L | S02, S03, S05 | Work items permitted |
| S08 | Aircraft Controls and Movement | Fixed-step keyboard/mouse controls, mode switching, movement, and viewport bounds | L | S07 | Work items permitted |
| S09 | Player Weapons and Projectiles | Approved weapons, auto-fire, fire rates, damage, projectile creation, movement, and lifetime | M | S08 | One complete Slice task preferred |
| S10 | Enemy Groups and Movement | Basic Drone content consumption, deterministic schedules, entry geometry, trajectories, and escape | L | S07, S08 | Work items permitted |
| S11 | Collision, Damage and Destruction | Deterministic AABB passes, projectile/contact damage, cooldown, destruction, and approved feedback | L | S09, S10 | Work items permitted |
| S12 | Mission Resolution and Return Loop | Success/Defeat/Aborted, result commitment, reward/Hull effects, recovery, Result Overlay, and repeatable return | L | S06, S11 | Work items permitted |
| S13 | Pause, Debug and Browser Lifecycle | Pause/Settings, development Debug commands, focus/visibility/resize/refresh behaviour, and recovery | L | S12 | Work items permitted |
| S14 | Full-MVP Hardening and Local Delivery | End-to-end, accessibility, cleanup, lazy chunk, performance, reference-device, and localhost production-mode evidence | L | S01–S13 | Work items permitted |

## 4. Slice contracts

### S01 — Domain and Content Foundation

**Outcome:** Framework-independent types and authored MVP content are valid, deterministic, reusable, and ready for application consumers.

**In scope:** canonical IDs and value/state contracts; aircraft, weapons, Basic Drone, Interception, group schedule and Pilot source records; content validation; FNV-1a/Mulberry32 streams and fixed vectors; AABB primitives; deterministic test fixtures; narrow public entry modules.

**Out of scope:** session creation, browser entropy, Pilot selection, application store, Mission Snapshot, gameplay transitions, UI, Phaser, persistence, or speculative future content.

**Primary sources:** Technical Foundation §§3, 8 and `TECH-DEC-002`, `TECH-DEC-011`; Repository Architecture §§5.1–5.2, 6–7, 12; Code Principles §§4–6; authored values from Base and Combat Specifications.

**Technical criteria:**

- `S01-TC-001`: Domain and Content obey their dependency boundaries and have deliberately narrow public surfaces.
- `S01-TC-002`: approved authored values have one canonical typed source and validation rejects invalid catalogues without silent repair.
- `S01-TC-003`: FNV-1a/Mulberry32, range rules, stream independence, and fixed vectors have deterministic tests before any product consumer exists.
- `S01-TC-004`: AABB overlap, separation, and specified edge semantics have pure deterministic tests.
- `S01-TC-005`: production code never imports `test-support`; fixtures do not duplicate the canonical balance catalogue.

**Skill:** `shmup-mvp-cross-system`.  
**Gates:** `npm run verify`.  
**Manual evidence:** none.

### S02 — Session Store and Application Boot

**Outcome:** One page load creates exactly one valid session and reaches Operations through the approved bounded Boot path.

**In scope:** Shared Session Store, named actions/reducers, browser-seed port, deterministic Pilot selection, initial Credits/Hull/weapon/Settings state, initialization idempotency, runtime asset preload coordination, stable fallbacks, Fatal Startup, and composition ownership.

**Out of scope:** full Base presentation beyond the minimum destination shell, Mission start, Combat runtime, persistence, retries beyond Reload, or late asset replacement.

**Primary AC:** `MASTER-AC-001–004`, `MASTER-AC-012–014`; `Base AC-001`, `Base AC-037`, `Base AC-040`, `Base AC-043`.  
**Skill:** `shmup-mvp-cross-system`.  
**Gates:** `npm run verify`, `npm run verify:browser`; Boot evidence required by the source specifications.

### S03 — Design System and Application Shell

**Outcome:** All later Base and Overlay work composes approved reusable primitives instead of inventing local styling or interaction rules.

**In scope:** tokens, IBM Plex Mono, icon/font fallbacks, prepared asset catalogue consumption, mother components, Screen/Overlay shell, responsive rules, focus visibility/trap/return foundations, reduced motion, and controlled component extension.

**Out of scope:** feature-specific product rules, full Operations/Hangar content, Combat simulation, alternative themes, localization, mobile/touch/gamepad, or additional components without an approved consumer.

**Primary AC:** `DS-AC-001–020` at component/foundation level; feature integration is re-verified in later slices.  
**Skill:** relevant Base/cross-system skill; restricted `game-ui-ux` only for a concrete audited question.  
**Gates:** `npm run verify`, `npm run verify:browser`; manual visual, responsive, keyboard, and focus evidence.

### S04 — Base Navigation and Settings

**Outcome:** The player can move consistently between Operations and Hangar and manage the one approved shared setting.

**In scope:** Base Navigation, active state, transition blocking, Settings Overlay, `Mouse Movement Enabled`, responsive/reflow and keyboard/focus behaviour for this surface.

**Out of scope:** mission details/start, Hangar transactions, Combat Settings integration, persistence, rebinding, or additional settings.

**Primary AC:** `Base AC-002–006`, `Base AC-036`, `Base AC-039`, `Base AC-041–042`, `Base AC-044–049`, `Base AC-051–052`; applicable `DS-AC`.  
**Skill:** `shmup-mvp-base-precombat`.  
**Gates:** `npm run verify`, `npm run verify:browser`; manual responsive, keyboard, and focus evidence.

### S05 — Operations and Mission Details

**Outcome:** The player can inspect the repeatable Interception mission and explicitly Start or Cancel it from the approved UI.

**In scope:** Operations layout, static Mission Point, Interception card, Mission Details Overlay, left Start Mission/right Cancel arrangement, blocking and focus behaviour, and emission of one accepted start request to the application boundary.

**Out of scope:** Mission Snapshot construction, lazy Combat import, enemy simulation, additional missions, map movement, or rewards applied from UI.

**Primary AC:** `Base AC-007–014`, `Base AC-031`, `Base AC-035`; applicable `DS-AC`.  
**Skill:** `shmup-mvp-base-precombat`.  
**Gates:** `npm run verify`, `npm run verify:browser`; manual layout, keyboard, focus, and repeated-command evidence.

### S06 — Hangar, Weapon Selection and Repair

**Outcome:** The player can inspect aircraft state, choose one approved weapon transactionally, and perform the approved Repair transaction.

**In scope:** Aircraft/Pilot/Hull display, Machine Gun/Cannon radio selection, pending/confirm/cancel behaviour, Repair availability/cost/effect, Credits transaction, and relevant blocking/focus states.

**Out of scope:** upgrades, inventory, drag-and-drop loadout, multiple slots, full Repair after defeat, additional currencies, or persistence.

**Primary AC:** `Base AC-015–030`, `Base AC-050`; applicable session-consistency and `DS-AC`.  
**Skill:** `shmup-mvp-base-precombat`.  
**Gates:** `npm run verify`, `npm run verify:browser`; manual transaction, layout, keyboard, and focus evidence.

### S07 — Mission Boundary and Combat Shell

**Outcome:** One accepted mission start creates one immutable Mission Snapshot, crosses the lazy Combat boundary, displays the approved shell, and can dispose it cleanly.

**In scope:** Mission Instance ordinal ownership, immutable snapshot, start idempotency, lazy Phaser import, Combat Game/Scene ownership, full viewport black canvas, aircraft/HUD structural placeholders using approved assets/fallbacks, `CombatHudBridge` boundary, and disposal contract.

**Out of scope:** movement, firing, enemies, collision, mission outcome, result commitment, or static Phaser import from Boot/Base.

**Primary AC:** `Combat AC-001–003`, `Combat AC-049–057`, `Combat AC-078`, `Combat AC-081–082`; relevant `MASTER-AC-010`, `MASTER-AC-014`.  
**Skill:** `shmup-mvp-cross-system` plus `shmup-mvp-combat` for the Combat presentation work.  
**Gates:** `npm run verify`, `npm run verify:browser`; manual lazy-boundary, shell, HUD, resize, and cleanup evidence.

### S08 — Aircraft Controls and Movement

**Outcome:** The aircraft responds deterministically to the approved keyboard or pointer-following mode within viewport bounds.

**In scope:** application input commands, fixed-step driver integration, keyboard acceleration/deceleration, pointer following, `F` mode switch, initial mode, bounds, focus-safe routing, and presentation interpolation where specified.

**Out of scope:** rebinding, gamepad/touch, variable-delta authority, physics engine, weapons, enemy interaction, or unapproved control tuning.

**Primary AC:** `Combat AC-004–008`, `Combat AC-045`, `Combat AC-064–065`, `Combat AC-070–071`.  
**Skill:** `shmup-mvp-combat`; restricted `input-systems` only if needed.  
**Gates:** `npm run verify`, `npm run verify:browser`; manual control-feel, mode, focus, and bounds evidence.

### S09 — Player Weapons and Projectiles

**Outcome:** The selected approved weapon auto-fires deterministic projectiles with its canonical timing and damage values.

**In scope:** Machine Gun/Cannon content consumption, auto-fire, fire cadence, projectile creation geometry, movement, bounds/lifetime cleanup, and read-only presentation mapping.

**Out of scope:** enemy hits, damage resolution, additional weapons, ammunition, manual fire binding, upgrades, particles, audio, or pooling without measurement.

**Primary AC:** `Combat AC-019–023`, `Combat AC-025–027`, `Combat AC-050`, `Combat AC-055`, `Combat AC-076–077`.  
**Skill:** `shmup-mvp-combat`.  
**Gates:** `npm run verify`, `npm run verify:browser`; manual cadence/selection and cleanup evidence.

### S10 — Enemy Groups and Movement

**Outcome:** Basic Drones enter through deterministic approved top/side patterns, traverse their simple trajectories, and escape cleanly.

**In scope:** mission RNG consumption, group schedule, final-group spawning data, random approved entry regions, off-screen full-hitbox placement, top-down global motion, side-entry waypoint-to-downward trajectories, stable entity order, and escape.

**Out of scope:** enemy firing, collision/damage, destruction feedback, advanced AI, additional enemies, difficulty scaling, or pathfinding.

**Primary AC:** `Combat AC-009`, `Combat AC-014–018`, `Combat AC-028–030` for schedule/spawn preconditions, `Combat AC-049`, `Combat AC-054`, `Combat AC-072–075`.  
**Skill:** `shmup-mvp-combat`.  
**Gates:** `npm run verify`, `npm run verify:browser`; manual spawn-region, side-entry, ordering, and cleanup evidence.

### S11 — Collision, Damage and Destruction

**Outcome:** Deterministic collision passes apply approved projectile/contact damage and immediate state resolution with minimal feedback.

**In scope:** collision-pass ordering, projectile-to-enemy hits, `Basic Drone Hull Integrity = 3`, weapon damage, contact damage `25/100`, enemy removal on contact, aircraft contact invulnerability cooldown, damage flash, enemy flash/disappearance, and cleanup.

**Out of scope:** knockback, overlap resolution after destroyed-enemy contact, enemy contact cooldown, enemy weapons, damage numbers, hit-stop, shake, particles, audio, or physics plugins.

**Primary AC:** `Combat AC-010–013`, `Combat AC-024`, `Combat AC-051`, `Combat AC-058–062`; `MASTER-AC-007`.  
**Skill:** `shmup-mvp-combat`; restricted `physics-tuning` only for fixed-step/tunnelling analysis.  
**Gates:** `npm run verify`, `npm run verify:browser`; manual feedback, immediate-resolution, and collision-order evidence.

### S12 — Mission Resolution and Return Loop

**Outcome:** Success, Defeat, and Aborted each produce one terminal result, apply it exactly once, return through the approved UI, and allow the next mission.

**In scope:** final-group resolution, Success/Defeat/Aborted, one typed Mission Result, idempotent commit, one-Credit Success reward, Hull persistence, free emergency recovery, no free full Repair, Result Overlay, return to Operations, and repeatability.

**Out of scope:** retry flow, additional rewards/penalties, save system, campaign state, second simultaneous mission, or result mutation from UI/Phaser.

**Primary AC:** `MASTER-AC-005`; `Base AC-032–034`, `Base AC-038`; `Combat AC-010`, `Combat AC-028–036`, `Combat AC-062`, `Combat AC-068`.  
**Skill:** `shmup-mvp-cross-system` plus subsystem skills where behaviour is implemented inside Base or Combat.  
**Gates:** `npm run verify`, `npm run verify:browser`; manual Success/Defeat/Aborted, duplicate-result, and repeat-loop evidence.

### S13 — Pause, Debug and Browser Lifecycle

**Outcome:** Pause, Settings, development Debug commands, and browser lifecycle events preserve authoritative state and approved safety behaviour.

**In scope:** Pause/Settings overlay flow, F1 development activation, God Mode, Spawn Final Group additive behaviour, debug Success/Defeat, production Debug exclusion, focus/visibility safety pause, resize/reflow, refresh reset/recovery, command precedence, and cleanup/idempotency.

**Out of scope:** production cheats, debug persistence, extra diagnostics, save/resume, telemetry, rebinding, or unsupported device controls.

**Primary AC:** `MASTER-AC-008–009`; `Combat AC-037–046`, `Combat AC-052`, `Combat AC-061`, `Combat AC-063–069`, `Combat AC-079–080`, `Combat AC-082`; applicable Base lifecycle AC.  
**Skill:** `shmup-mvp-cross-system` plus `shmup-mvp-combat`; restricted `input-systems` only if needed.  
**Gates:** `npm run verify`, `npm run verify:browser`; mandatory manual lifecycle and development/production Debug evidence.

### S14 — Full-MVP Hardening and Local Delivery

**Outcome:** The complete MVP satisfies cross-system behaviour, accessibility, lifecycle, performance, cleanup, and localhost production-mode requirements with recorded evidence.

**In scope:** complete end-to-end flows, keyboard-only audit, Design System audit, five consecutive missions, lazy Combat chunk inspection, reference-device budgets, cleanup/memory evidence, asset/request boundaries, production Debug exclusion, artifact hygiene, and final regression closure.

**Out of scope:** hosting-provider selection, external deployment, public URL, publication, PR-based release flow, backend, analytics, accounts, telemetry, CDN, audio, new polish/features, or weakening gates to accept failures.

**Primary AC:** `MASTER-AC-006–007`, `MASTER-AC-011`, `MASTER-AC-015–016`; `Combat AC-047–048`; `DELIVERY-AC-001–005`; all earlier source AC as regression coverage where applicable.  
**Skill:** `shmup-mvp-cross-system` plus the relevant subsystem skill for a measured defect; `performance-optimization` only for measured work.  
**Gates:** `npm run verify:all`; every applicable manual, accessibility, performance, cleanup, request, lazy-chunk, and artifact record from the Verification and Delivery specifications.

## 5. Handoff contract

Global execution, communication, review, verification, and commit rules live in `AGENTS.md` and must not be copied into each task. A Slice handoff carries only the variable contract:

```text
Задача: [Slice Sxx — canonical name]
Підсистема: Base / Combat / Cross-system / Build-Tooling
Canonical contract: MVP_IMPLEMENTATION_SLICES_v0.1.md §[slice section]
Explicit additions or overrides: [None unless explicitly approved]
Dependencies: [accepted Slice IDs]
Status: READY FOR IMPLEMENTATION
```

The Slice Registry supplies the outcome, scope, negative scope, primary sources, AC/TC, skill, gates, and manual evidence. The implementation agent resolves those fields from the repository rather than asking the Product Owner to restate them.

A separately assigned Work Item uses:

```text
Задача: Work Item Sxx-WIyy within Slice Sxx — name
Parent criteria advanced: [IDs]
Scope delta: [exact bounded correction or checkpoint]
Still incomplete in parent Slice: [IDs or areas]
Status: READY FOR IMPLEMENTATION
```

Its final report cannot claim the parent Slice is accepted or complete.

## 6. Relay and cost-control protocol

There is no direct communication channel between the implementation agent and the acceptance reviewer. The non-technical Product Owner relays unchanged messages and is never responsible for technical interpretation.

### 6.1 Normal Slice cycle

```text
1. Acceptance reviewer supplies one ready-to-copy Slice handoff.
2. Product Owner relays it unchanged to the implementation agent.
3. Implementation agent completes the whole Slice, including internal Work Items, self-review, gates, and evidence.
4. Implementation agent returns one compact Slice report.
5. Product Owner relays the report unchanged to the acceptance reviewer.
6. Reviewer returns Accepted or one consolidated correction handoff.
7. After acceptance, an authorized agent creates the local Slice commit.
8. Only then is the next Slice assigned.
```

No routine relay is required between internal Work Items. Mandatory intermediate review exists only when the Slice contract explicitly declares a high-risk checkpoint or an S0–S2 blocker appears.

### 6.2 Blocker cycle

The implementation agent does not ask the Product Owner to choose code. It returns one consolidated blocker report containing:

```text
Blocked scope:
Conflicting or missing canonical sources:
Player/product impact:
Technical impact:
Safe independent work completed:
Recommendation:
RELAY TO ACCEPTANCE REVIEWER:
[copyable concise decision request]
```

### 6.3 Acceptance and corrections

- Automated gates do not equal acceptance.
- The reviewer inspects implementation, scope, boundaries, tests, and evidence.
- Review produces one verdict, not a sequence of exploratory questions.
- When correction is required, the reviewer consolidates all findings discoverable in that review into one Work Item handoff.
- The implementation agent fixes that Work Item and returns one revised report.

### 6.4 Commit efficiency

The default history unit is one accepted Slice, including its corrections. Commit is a mechanical post-acceptance operation and must not trigger another design discussion.

The Product Owner has authorized the independent acceptance reviewer to commit an accepted Slice immediately after the `Accepted` verdict and push it to the existing `origin/main` only when the working tree is clean and the push is fast-forward. This authorization does not extend to the implementation agent and never includes another remote or branch, force push, publication, deployment, PR creation, destructive history editing, or unrelated files.

## 7. Current status

| Slice | Status |
|---|---|
| S01 | Accepted |
| S02 | Accepted |
| S03 | Accepted |
| S04 | Accepted |
| S05 | Accepted |
| S06 | Accepted |
| S07 | Accepted |
| S08 | Accepted |
| S09–S14 | Not Started |

Status changes require implementation evidence and review. This document is not an agent-maintained progress log; approved status changes are recorded deliberately rather than rewritten speculatively.

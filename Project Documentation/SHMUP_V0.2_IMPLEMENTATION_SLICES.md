# Shmup v0.2 Tactical Combat Foundation — Implementation Slices

- **Status:** APPROVED — READY FOR SEQUENTIAL DEEPSEEK HANDOFFS
- **Product authority:** `SHMUP_V0.2_TACTICAL_COMBAT_FOUNDATION_SPECIFICATION.md`
- **Traceability:** `MVP_TRACEABILITY_MATRIX_v0.1.md` §8
- **Decision owner:** Product Owner
- **Execution model:** one independently reviewed DeepSeek dialogue per Work Item

## 1. Epic execution contract

Work Items execute strictly in the order below. Only one Work Item may be active. The accepted forty-character revision from the preceding Work Item becomes the next Work Item baseline. A Work Item is complete only after its owned behaviour, tests, required browser evidence, documentation updates, and independent review are accepted.

Every handoff must contain:

- exact canonical repository, branch, and accepted baseline revision;
- one Work Item ID and no later Work Item scope;
- product source sections and owned AC IDs;
- explicit IN/OUT scope and applicable §18 negative requirements;
- exact verification commands and human/browser evidence;
- write-set expectations and forbidden owners;
- protocol-v2 return fields, risks, residuals, and resulting revision.

Common prohibitions:

- no generic enemy, boss, persistence, projectile, or mission framework beyond current consumers;
- no reactive spawn adaptation, difficulty scaling, pooling, ECS, spatial partitioning, backend, telemetry, audio, mobile layout, or speculative content;
- no duplicated product values in UI/Phaser adapters;
- no direct persistence mutation from UI or Phaser;
- no next-Work-Item implementation, opportunistic refactor, or unrelated cleanup;
- no commit, merge, or push outside the explicit handoff authority.

## 2. V02-WI-01 — Runtime enemy asset contract

**Outcome:** all five prepared enemy PNGs have typed central-catalogue identities, bounded Boot preparation, stable role-specific procedural fallbacks, correct role/state mapping, and production request evidence without changing gameplay simulation.

- **Depends on:** accepted v0.1 baseline and this recovery/documentation change.
- **Owned AC:** `V02-AC-024`; asset-layer implementation and bounded-fixture evidence for `V02-AC-025`. Final three-mission traversal evidence for `V02-AC-025` is owned by `V02-WI-07` after `V02-WI-06` makes all consumers available.
- **Primary sources:** Epic §§16, 18, 20; Architecture asset ownership; Master asset/performance boundaries.

IN scope:

- central runtime-catalogue entries for five enemy sprites;
- extension of the existing bounded Boot manifest from twelve to seventeen entries, preserving its `5 s`, non-critical, one-request, per-session fallback, and inert-late-completion rules;
- the five exact procedural fallbacks from Epic §16.5 with the same configured centre, complete rendered bounds, orientation, and gameplay-scale footprint as their prepared sprites;
- exact asset-to-role/state mapping and one-request production evidence;
- asset validation for alpha, dimensions, pack size `≤450,000 bytes`, and complete runtime total `≤2 MiB`;
- gameplay-scale human review at the minimum supported viewport using a bounded presentation fixture or existing Combat path.

OUT scope:

- enemy gameplay state, spawning, damage, attacks, mission data, persistence, and UI redesign;
- regenerating or creatively altering the approved artwork;
- a second Combat loader, post-Boot image request, late fallback swap, or new loading UI;
- runtime import from `assets/source/`.

Acceptance evidence:

- catalogue/unit tests and production browser request/failure tests for the seventeen-entry Boot manifest and all five enemy fallback mappings;
- `npm run verify` and `npm run verify:browser`;
- recorded real-scale colour/grayscale/fallback review;
- exact runtime byte accounting, cold-Boot budget evidence, and clean architecture review;
- bounded-fixture evidence for the asset-layer portion of `V02-AC-025`, explicitly labelled as not yet satisfying the final three-mission traversal precondition.

## 3. V02-WI-02 — Persistent campaign transaction

**Outcome:** campaign state survives reloads through a validated versioned Dexie adapter, while active-mission recovery, Game Over/New Game state, and Settings separation are deterministic and idempotent.

- **Depends on:** accepted `V02-WI-01` revision.
- **Owned AC:** `V02-AC-017–021`.
- **Primary sources:** Epic §§12–14, 18, 20; Technical Foundation dependency rules; Architecture persistence boundaries.

IN scope:

- exactly pinned `dexie@4.4.5`, lockfile update, dependency audit, and Technical Foundation record;
- versioned campaign schema and validation/migration boundary;
- separately persisted user Settings;
- atomic New Game replacement and corrupted-save UX;
- coherent mission-start and terminal-result transaction ports;
- exactly-once active-mission refresh/crash Defeat recovery;
- temporary compatibility adapter needed to keep current v0.1 flows green until later consumers arrive.

OUT scope:

- cloud sync, multiple save slots, mid-Combat restore, account/profile systems, analytics;
- mission unlock UI, new enemies, v0.2 Combat behaviour, or final result presentation.

Acceptance evidence:

- deterministic schema, migration, transaction, retry/idempotency, corruption, refresh, and Settings-separation tests;
- browser evidence across reload and hidden/focused states where applicable;
- `npm ci`, dependency/licence/audit review, and `npm run verify:all`;
- R3 checkpoint review of persistence ownership before dependent Work Items.

## 4. V02-WI-03 — Mission registry and progression

**Outcome:** Operations exposes three validated authored Interception Missions with locked/available/completed states, deterministic schedules, replay, and persisted unlock progression, while current Combat may still use existing Basic-only behaviour until WI-04.

- **Depends on:** accepted `V02-WI-02` revision.
- **Owned AC:** `V02-AC-001–004`.
- **Primary sources:** Epic §§5–8, 13–15, 18, 20.

IN scope:

- typed mission IDs, definitions, rewards, encounter compositions, timings, and content validation;
- all three exact authored schedules and total-count assertions;
- Operations mission points and Mission Details locked/available/completed/replay behaviour;
- persisted completion/unlock consumers and validated mission-start selection;
- deterministic encounter-data ordering with no reads of current Hull, loadout, position, or performance.

OUT scope:

- Ranged/Hunter/Elite simulation, Evacuation, Defeat economy, and full mission result implementation;
- authoring tools, generic encounter grammar DSL, procedural missions, or adaptive spawning.

Acceptance evidence:

- exact schedule/totals/ordering/content tests;
- DOM and keyboard/focus tests for all mission states;
- persistence integration tests for replay and unlock data;
- `npm run verify:all` and Operations visual review.

## 5. V02-WI-04 — Mission 01 regular-combat vertical

**Outcome:** Interception 01 is fully playable and resolvable with Basic, Ranged, and Hunter behaviours, deterministic authored encounters, Countdown, projectiles/collisions, Success economy, minimal HUD, and result UX.

- **Depends on:** accepted `V02-WI-03` revision.
- **Owned AC:** `V02-AC-005–008`, `V02-AC-011–013`, `V02-AC-022–023` for Success.
- **Primary sources:** Epic §§8.1, 9.1–9.3, 10–13.3, 15, 17–20.

IN scope:

- typed regular-enemy state and renderer mapping;
- Ranged authoritative activation, deterministic firing, and fixed projectile trajectories;
- Hunter direct approach, exact commitment, locked run, contact/miss outcomes;
- single-hit player/enemy projectile lifecycle and per-pair regular contact cooldown;
- exact Mission 01 authored schedule, Countdown, Success conditions/economy/transaction;
- minimal Combat HUD, critical-Hull presentation, Success exit/result, and required Debug commands for owned behaviour.

OUT scope:

- Mission 02 alternative outcomes, Elite, generic AI/behaviour trees, predictive Hunter lead, reactive spawn changes;
- piercing, splash, ricochet, chain damage, enemy/enemy collision, collision damage to regular enemies.

Acceptance evidence:

- deterministic unit tests for RNG draw order, activation, cadence, geometry, resolution, economy, and idempotency;
- Mission 01 browser playthrough, failure-path asset fallback, hidden-tab/pause regression, and real-scale visual review;
- proportional production performance record for the regular workload;
- `npm run verify:all` and R2 player-facing checkpoint.

## 6. V02-WI-05 — Mission 02 and alternative outcomes

**Outcome:** Interception 02 is fully playable and validates sustained mixed pressure plus Evacuation, Defeat, paid Repair, Game Over, New Game, and all corresponding atomic result UX.

- **Depends on:** accepted `V02-WI-04` revision.
- **Owned AC:** `V02-AC-014–016`; `V02-AC-022–023` for Evacuated/Defeat/Game Over.
- **Primary sources:** Epic §§8.2, 12–15, 17–20.

IN scope:

- exact Mission 02 schedule and completion integration;
- Evacuation confirmation with exact prior-pause restoration;
- irreversible five-second countdown with normal Combat continuing;
- Defeat priority, retained-Hull Evacuation transaction, paid full Repair, and Game Over;
- result overlays, exit/fade sequences, New Game confirmation, and exactly-once persistence.

OUT scope:

- Elite/Mission 03, retry button, free abort, partial Repair, anti-farming, resumable mid-Combat save;
- cancelling confirmed Evacuation or converting remaining enemies to penalties after successful Evacuation.

Acceptance evidence:

- boundary tests at simultaneous Success/Defeat/Evacuation, exactly `00:00`, 7/8 Credits, repeated callbacks, and refresh boundaries;
- browser playthroughs for Success, Evacuation, affordable Defeat, Game Over, New Game, Pause-origin cancellation, and focus loss;
- `npm run verify:all` and R2 player-facing checkpoint.

## 7. V02-WI-06 — Mission 03 Elite vertical

**Outcome:** Interception 03 is fully playable and completable with the exact Elite entry, anchor, phase cycle, attacks, visuals, economy, and final mission progression.

- **Depends on:** accepted `V02-WI-05` revision.
- **Owned AC:** `V02-AC-009–010` plus regression of all Mission 03-relevant preceding AC.
- **Primary sources:** Epic §§8.3, 9.4, 10–13, 15–20.

IN scope:

- exact Mission 03 schedule and Elite entry to `50% VW, 20% VH` anchor;
- activation-only timer start, Armoured-first `12 s / 6 s` cycle, exact sprite-state mapping;
- cannon first/full cadence, exact `−6°/+6°` trajectories, speed/damage;
- Vulnerable Core full initial interval, homing turn/speed/lifetime/damage, cap of two;
- blocked-hit projectile consumption/feedback, Elite reward, Success, replay, and completion persistence.

OUT scope:

- generic boss/phase framework, second Elite, shields, beams, bullet patterns, predictive adaptation, new weapons;
- phase-time consumption or attacks during entry.

Acceptance evidence:

- exact simulation tests for anchor/activation, phase boundaries, attack cadence/angles, homing cap/turn/lifetime, blocked hits, and terminal priorities;
- complete Mission 03 production-browser playthrough and both Elite-state real-scale review;
- Elite workload performance record;
- `npm run verify:all` and R2 player-facing checkpoint.

## 8. V02-WI-07 — Epic hardening and acceptance

**Outcome:** the integrated Epic has authoritative Debug support, no retained runtimes across mixed outcomes, complete evidence for all approved workloads, current documentation, and an auditable `V02-AC-001–028` closure report.

- **Depends on:** accepted `V02-WI-06` revision.
- **Owned AC:** final three-mission traversal acceptance for `V02-AC-025`, `V02-AC-026–028`; final regression of `V02-AC-001–024`.
- **Primary sources:** Epic §§17–20; Verification §11; Delivery and repository governance.

IN scope:

- all specified v0.2 Debug fields and authoritative commands;
- five-consecutive-mission soak containing Success, Evacuation, and Defeat;
- legacy, regular, and Elite production workload records from Epic §20.1;
- entity/timer/RNG/subscription/Phaser/persistence cleanup evidence;
- final asset/request/build audit, full traceability review, documentation updates, and residual-risk ledger;
- production traversal of all three missions proving the complete `V02-AC-025` mapping, request, source-hygiene, and fallback contract;
- physical-device status recorded honestly as passed or pending.

OUT scope:

- speculative performance architecture, new content, balance redesign, publication, or claiming proxy evidence as device certification;
- masking an unexplained sustained regression by weakening a budget.

Acceptance evidence:

- `npm ci`, `npm run verify:all`, production delivery inspection, five-mission soak, and all three workload records;
- complete source-qualified AC checklist with no orphan requirement;
- independent final Epic review and explicit Product Owner acceptance.

## 9. Handoff readiness

All seven Work Items have bounded scope, product behaviour, AC ownership, negative requirements, dependency order, and verification expectations. The next authorized implementation action is `V02-WI-01` only. Starting any later Work Item, or sending the whole Epic as one DeepSeek task, violates this plan.

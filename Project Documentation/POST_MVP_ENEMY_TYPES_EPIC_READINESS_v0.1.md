# Post-MVP Enemy Types Epic Readiness v0.1

**Date:** 2026-08-24

**Status:** `DEFINITION REQUIRED — NOT READY FOR IMPLEMENTATION`

**Classification:** content-heavy and Combat-heavy

**Purpose:** define the preparation gates for the first post-MVP Epic without inventing enemy types or behaviour.

## 1. Decision

An Epic that adds different enemy types is both:

- **content-heavy**, because it adds typed enemy definitions, identifiers, balance values, references, and validation;
- **Combat-heavy**, because enemy types can change authoritative movement, spawning, collision, destruction, rendering, entity counts, and frame cost.

The preparation rules for both categories apply before the first implementation Work Item. The Epic is not implementation-ready until the Product Owner approves the behaviours and constraints in §3.

## 2. Accepted baseline

The completed MVP has a narrow, deliberate Basic Drone implementation:

- `EnemyType` contains only `basic-drone`;
- `EnemyDefinition` owns `type`, `displayName`, `maximumHullIntegrity`, and movement speed;
- the content validator checks the known type, unique type, display name, Hull range, and positive finite speed;
- Combat resolves one Basic Drone definition for the mission;
- all active enemies use one square size, the same top/side-entry movement model, the same contact outcome, and the same presentation mapping;
- the Interception schedule stores group timing and counts, not an enemy-type composition;
- the Phaser adapter renders every active enemy as the same `danger` square while authoritative state remains in Application.

These are extension seams, not proof that new enemy types require only new data. A type with new player-facing behaviour requires an approved simulation contract and code at the existing owner.

## 3. Product Definition of Ready

Before implementation, approve the following for every proposed enemy type and for the Epic as a whole.

### 3.1 Enemy role and differentiation

- player-facing purpose;
- the behaviour that makes the type recognisably different;
- intended threat and counterplay;
- canonical display name and stable type ID;
- whether the type replaces, complements, or modifies the Basic Drone.

### 3.2 Authoritative Combat behaviour

- maximum Hull Integrity;
- movement speed, movement phases, trajectory, and target rules;
- allowed entry regions, spawn geometry, escape boundary, and resize behaviour;
- hitbox geometry and rendered-size relationship;
- contact damage and contact outcome;
- projectile-hit, damage, destruction, and feedback rules;
- whether the enemy can attack at range; the completed MVP default is **no enemy firing**, and this default changes only through an explicit decision;
- interaction with Pause, Debug, God Mode, mission success, and defeat.

### 3.3 Mission composition

- which missions can contain the type;
- group composition and selection rules;
- spawn times or scheduling rules;
- deterministic RNG draw order when randomness is used;
- maximum simultaneous active enemies for the approved representative workload;
- final-group and mission-success implications.

### 3.4 Presentation and content

- runtime asset or approved primitive fallback;
- scale, aspect ratio, colour/readability, render layer, and damage/destruction feedback;
- asset-license and manifest requirements;
- player-facing copy, if any;
- accessibility or identification requirement that must not depend on colour alone.

### 3.5 Contract quality

- source-qualified Acceptance Criteria;
- negative requirements;
- deterministic examples for random schedules or trajectories;
- explicit unresolved items;
- human control/readability checkpoint, when feel or visual recognition cannot be proved automatically.

Any missing S0–S2 item keeps the affected Work Item `NOT READY FOR IMPLEMENTATION`.

## 4. Content-definition contract

Use the following ownership split after §3 is approved.

| Concern | Canonical owner | Data or code |
| --- | --- | --- |
| Player-facing role and behaviour | Epic product specification | Product contract; not content data |
| Stable identity and approved balance values | `src/content/enemies/` | Typed content definition |
| Allowed type IDs | Domain model | Closed discriminant updated only for approved types |
| Runtime validation | `src/content/validation/` | Validator and deterministic negative tests |
| Movement, attack, collision, lifecycle | `src/application/combat/` | Pure deterministic simulation code |
| Mission enemy mix and schedule references | Mission content/composition owner | Typed composition data after rules are approved |
| Visual selection and frame reflection | `src/combat-presentation/` | Presentation mapping only; no gameplay authority |

An enemy entry may contain only fields consumed by the approved Epic. Each field must define:

- one stable name;
- its unit;
- its allowed range or closed set;
- whether it is required;
- every cross-reference and missing-reference error;
- a deterministic validation test.

Do not place callbacks, Phaser objects, React values, CSS, asset objects, or behaviour implementations in content definitions.

## 5. Validator gap gate

The current validator is sufficient for the current four enemy fields only. After the Product Definition of Ready is approved and before behaviour implementation:

1. list the new fields and references that have an actual consumer in this Epic;
2. add the smallest typed definition that expresses those approved values;
3. validate required fields, units, finite ranges, unique IDs, closed discriminants, and cross-references;
4. add valid examples plus malformed, boundary, duplicate-ID, and missing-reference tests;
5. make the catalogue fail before Boot when authored content is invalid;
6. keep error messages path-qualified and actionable.

Do not add speculative fields. Do not create one monolithic JSON registry, a universal content engine, a generic ECS framework, or a generic behaviour graph.

## 6. Combat performance gate

The performance procedure begins only after the approved enemy mix, schedule, and maximum concurrency define a reproducible workload.

Before implementation:

1. record the accepted revision and production build;
2. run the representative workload against the current Basic Drone baseline;
3. record entity maxima, frame-time distribution, sustained FPS, long tasks, cleanup state, and heap/allocation or garbage-collection evidence when the browser exposes it reliably;
4. record device, browser, viewport, duration, seed, mission phase, and sampling method.

After integration, run the same workload and method. Compare like with like.

Object pooling, mutable hot-loop storage, spatial partitioning, or renderer-specific optimisation is authorised only when the measurements correlate a budget threat with the relevant allocation, loop, collision, or rendering owner. Do not add these mechanisms as a precaution.

The existing S14 proxy is historical evidence. It does not automatically qualify a new enemy workload. The physical reference-device gate remains required before an external playtest or a minimum-system-requirement claim.

## 7. Required Epic work sequence

1. Product brainstorm and decisions.
2. Canonical Epic specification, AC, negative requirements, and representative workload.
3. Content-definition and validator gap review.
4. Pre-change performance baseline.
5. Bounded implementation Work Items inside one Epic dialogue.
6. Deterministic unit tests at Domain/Application owners.
7. Minimal browser wiring, presentation, lifecycle, and cleanup evidence.
8. Same-workload performance comparison.
9. Independent acceptance review and Product Owner human checkpoint.

Do not begin implementation at step 5 while steps 1–4 are incomplete.

## 8. Explicit non-decisions

This readiness document does not decide:

- the number or names of new enemy types;
- enemy firing;
- formations, bosses, armour, shields, status effects, or special weapons;
- new missions or campaign progression;
- assets or final visual style;
- balance values;
- object pooling, ECS, a new renderer, or a new state manager.

These items require explicit Epic scope or measured technical evidence.

## 9. Next action

Run a Product Owner brainstorm for enemy roles and behaviours. Convert approved decisions into a canonical Epic specification. Only then create protocol-v2 `.agent-handoff/control.json` for the first implementation Work Item.

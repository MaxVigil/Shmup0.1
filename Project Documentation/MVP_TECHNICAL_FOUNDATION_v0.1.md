# MVP Technical Foundation v0.1

**Product:** Shmup  
**Scope:** Approved implementation architecture and technical boundaries  
**Status:** APPROVED — FINAL AUDIT PASSED  
**Decision owner:** Product Owner  
**Approved:** 2026-08-20

## 1. Purpose

This document fixes the architectural foundation for the MVP. It does not authorize feature implementation by itself and does not invent product behaviour beyond the approved product specifications.

Exact dependency versions, repository structure, scripts, and lint rules are approved in this package and the repository configuration. Hosting-provider selection remains intentionally deferred and is not required for feature implementation.

## 2. Approved technology direction

The MVP uses:

- TypeScript for application, domain, simulation, adapters, and tests;
- Phaser 4 for Combat rendering and Phaser-specific runtime integration;
- React DOM for Screens, Overlays, Settings, Base UI, and Combat HUD;
- Vite for local development and the production build;
- Vitest for unit and integration tests;
- React Testing Library for DOM component behaviour;
- Playwright for supported-browser end-to-end flows that are reliable to automate;
- ESLint for TypeScript and JavaScript static analysis;
- Stylelint for stylesheet and Design Token enforcement where suitable;
- Prettier for formatting.

The verified versions below are the approved initial repository pins. The repository lockfile and final command contract will be created with the repository scaffold.

### 2.1 Compatibility-spike checkpoint — 2026-08-20

The isolated install, TypeScript production build, Vite production bundle, Vitest, React Testing Library, ESLint, Stylelint, Prettier, lazy Combat chunk, and Playwright Chromium smoke test passed with the following approved initial matrix:

| Package/runtime | Approved initial pin |
|---|---:|
| Node | `24.19.0` |
| npm | `11.17.0` |
| TypeScript | `6.0.3` |
| Phaser | `4.2.1` |
| React / React DOM | `19.2.8` |
| Vite | `8.2.2` |
| `@vitejs/plugin-react` | `6.1.0` |
| Vitest | `4.1.11` |
| ESLint | `10.8.1` |
| `@eslint/js` | `10.0.1` |
| `typescript-eslint` | `8.67.0` |
| `globals` | `17.11.0` |
| React Testing Library | `16.3.2` |
| `user-event` | `14.6.5` |
| jsdom | `30.0.1` |
| Playwright Test | `1.62.1` |
| `@types/node` | `24.13.3` |
| Stylelint | `17.14.1` |
| `stylelint-config-standard` | `40.0.0` |
| Prettier | `3.9.6` |

TypeScript `7.0.2` was explicitly rejected for this matrix because `typescript-eslint 8.67.0` declares TypeScript support below `6.1.0` and npm correctly refused the dependency tree.

The spike produced an initial/Base JavaScript chunk of approximately `191.82 kB` before gzip and a separately loaded Combat chunk of approximately `1.38 MB` before gzip. The browser smoke test confirmed that React Base loaded first and Phaser initialized after the Combat import without runtime errors.

The compatibility gate is closed. These spike sizes are architectural evidence, not final product-budget acceptance: the actual repository must still pass the approved production asset, loading, memory, and runtime performance budgets.

## 3. Architectural layers and ownership

### 3.1 Pure Domain

The Domain contains gameplay and product rules as framework-independent TypeScript data and functions.

The Domain must not import or depend on:

- Phaser;
- React;
- browser DOM APIs;
- rendering objects;
- CSS or presentation tokens;
- storage, network, or framework lifecycle APIs.

Domain operations must be testable without creating a browser, canvas, Phaser Game, or React tree.

### 3.2 Application layer

The application layer owns use-case coordination, state transitions, global input routing, lifecycle coordination, and bridges between the Domain and presentation adapters.

Shared Session State is held in a small hand-written observable store. Mutations occur only through named actions or reducers. UI and Phaser code must not mutate shared state directly.

Mission entry uses an immutable Mission Snapshot. Mission resolution may commit its approved result to Shared Session State exactly once.

### 3.3 Combat simulation

`CombatSimulationState` is plain TypeScript data owned by the application/simulation runtime and transformed through deterministic domain functions.

It contains the authoritative Combat positions, velocities, timers, entity states, Hull Integrity values, projectile state, spawn state, and mission-resolution state required by the approved Combat specification.

Phaser objects are presentation objects and are never the authoritative gameplay state.

### 3.4 Phaser adapter

Phaser is responsible for:

- creating and updating Combat visual objects;
- rendering the current Combat simulation snapshot;
- providing its animation-frame integration;
- forwarding relevant pointer and keyboard input as application commands;
- camera and canvas integration required for Combat presentation.

Phaser must not own Shared Session State, product rules, damage rules, reward commitment, or mission-result authority.

Phaser and Combat-specific presentation code must be loaded through a separate Combat entry chunk. Boot and Base must not eagerly import Phaser. The initial spike showed that an eager Phaser import produces an approximately `1.57 MB` minified JavaScript bundle before gzip, so eager inclusion would violate the intended Base/Combat separation and create avoidable startup cost.

### 3.5 React presentation

React owns Screens, Overlays, Base UI, Settings UI, and Combat HUD composition.

React may observe application state and dispatch application commands. React components must not implement Combat simulation or mutate authoritative state directly.

## 4. Combat physics and collision boundary

The MVP does not use Phaser Arcade Physics or another physics-engine plugin.

Combat uses a purpose-built deterministic simulation with simple axis-aligned bounding-box collision tests.

The MVP collision system supports only the collision shapes and behaviours explicitly required by the Combat specification. It must not add:

- rotated collision boxes;
- rigid-body dynamics;
- physical impulses or knockback;
- restitution, mass, friction, or torque;
- speculative spatial partitioning or a generalized physics framework.

If later approved mechanics require materially more complex collision or physics behaviour, the architecture must be reviewed explicitly. The MVP AABB system must not be expanded incrementally into an undocumented general-purpose engine.

## 5. Fixed-step simulation

Combat simulation advances at a fixed `1/60 s` step.

- A rendered frame may execute at most four simulation steps.
- Elapsed time beyond that per-frame limit is discarded rather than recovered later.
- Mission Clock advances only through simulation steps that actually execute.
- The application must not perform delayed catch-up movement, timer advancement, projectile bursts, or spawn bursts after a long frame, pause, focus loss, visibility loss, or lifecycle recovery.
- The simulation accumulator is reset at the approved pause and browser-lifecycle boundaries.

Accepted trade-off: an isolated long frame may make game time briefly progress more slowly than wall-clock time. This is preferred to simulation jumps, delayed catch-up, and spiral-of-death behaviour.

## 6. Presentation bridges

### 6.1 Combat HUD

Per-frame Combat HUD placement must not cause a React state update or React tree render on every animation frame.

An isolated `CombatHudBridge` receives plain presentation values such as player screen position, rendered aircraft width, visibility, and Hull ratio. It may update the owned HUD element imperatively.

Phaser must not receive or retain a raw React DOM reference. The bridge is the only approved per-frame imperative DOM boundary unless a later measured requirement explicitly authorizes another one.

### 6.2 Design Tokens

CSS custom properties are the single runtime source for approved UI Design Tokens.

Phaser-specific presentation code may read and cache resolved token values after Boot or after an explicitly supported theme/runtime-token change. Domain and gameplay content must not reference CSS values or presentation token names.

Mappings such as `Basic Drone → danger colour` belong to presentation configuration, not Domain data or gameplay content data.

## 7. Input ownership

Global input routing belongs to the application layer.

- Global development and gameplay shortcuts are converted into application commands.
- React controls their local UI keyboard behaviour and focus semantics.
- Phaser forwards Combat pointer and keyboard intent without becoming the global input authority.
- Native browser keyboard behaviour for focused UI controls, including `Tab`, `Shift+Tab`, `Enter`, and `Space`, must not be broken by a global listener.
- Input enablement and routing follow the approved Screen, Overlay, Pause, Settings, Debug, and browser-lifecycle states.

The binding input actions, enablement, and precedence are defined by the Combat Specification §§5, 10–12, the Base and Pre-Combat Specification §§3.6 and 9.9, and the Design System Specification §10. Implementation must encode those rules as a pure testable routing table; it has no freedom to introduce additional bindings or precedence.

## 8. Deterministic randomness

A session receives one unsigned 32-bit seed from `crypto.getRandomValues`. Failure to obtain that seed is a fatal initialization failure.

Derived stream seeds use 32-bit FNV-1a with `Math.imul` over the UTF-8 bytes of this versioned input:

```text
shmup-mvp:rng-v1|<session-seed>|<stream-name>|<ordinal>
```

The `<session-seed>` placeholder is an unsigned 32-bit integer serialized as base-10 decimal ASCII without sign, prefix, separators, whitespace, or leading zeroes. Examples: `0` → `"0"`, `1` → `"1"`, `3735928559` → `"3735928559"`. Hexadecimal (`0xDEADBEEF`), zero-padded (`03735928559`), signed (`+3735928559`), and separator (`3_735_928_559`) forms are prohibited.

The initial stream names and ordinals are:

- `pilot-selection`, ordinal `0`;
- `combat-mission`, using the zero-based Mission Instance ordinal.

The Mission Instance ordinal increments exactly once when an accepted `Start Mission` command creates a Mission Snapshot, regardless of the later Success, Defeat, or Aborted result.

Each stream uses `Mulberry32` with unsigned 32-bit state and exposes:

- `nextUint32()`;
- `nextFloat()` in `[0, 1)`;
- `nextInt(maxExclusive)` using rejection sampling so selection is not biased by modulo reduction.

Deterministic independent streams are used for logically separate systems, including:

- session and Pilot generation;
- each Combat mission instance.

Adding a random call in one system must not silently change another system's sequence. Production UI does not expose seeds. Development diagnostics may expose them through the approved development-only observability path.

The seed derivation, generator output, range rules, stream independence, Mission Instance ordinal, and fixed test vectors must be covered by Domain tests before a random consumer is used in product behaviour. Changing `rng-v1`, FNV-1a, or Mulberry32 is a compatibility-affecting technical decision and requires documentation and test-vector updates.

## 9. Verification strategy

Each Acceptance Criterion must map to suitable evidence, not necessarily to an automated test.

Allowed evidence types are:

- Vitest unit or integration test;
- React Testing Library DOM behaviour test;
- Playwright supported-browser flow;
- manual visual or accessibility verification;
- performance profile or recorded budget measurement;
- static Design System or architecture audit;
- documented manual browser-lifecycle verification where reliable automation is unavailable.

Playwright must not be used to create a fragile imitation of operating-system focus behaviour. Lifecycle rules may be divided between unit/integration coverage and the mandatory manual supported-browser audit.

## 10. Governance boundaries

The canonical long-lived sources are:

1. `Project Documentation/` for approved product and technical contracts;
2. repository `AGENTS.md` for concise agent-wide operating rules;
3. approved implementation skills for scoped workflows.

If Cline requires `.clinerules/`, it may contain only a small router to the canonical sources and tool-specific instructions that cannot live elsewhere. It must not duplicate product requirements or architectural contracts.

No separate `memory-bank/` is approved. Agents must not create parallel summaries that can silently drift from canonical documentation.

Existing historical instructions must be reused only after checking them against current MVP scope. They must not be copied wholesale.

## 11. Negative requirements

The implementation must not:

- treat Phaser or React state as authoritative Domain or Shared Session State;
- use Phaser Arcade Physics for MVP gameplay;
- couple Domain code to Phaser, React, DOM, CSS, storage, or network APIs;
- update React state on every Combat animation frame solely to position the Hull Bar;
- pass a raw React DOM reference into a Phaser scene;
- place presentation tokens in Domain or gameplay content records;
- use one shared mutable random stream across unrelated systems;
- silently catch up discarded Combat time after a long frame or lifecycle interruption;
- claim that every Acceptance Criterion must be automated;
- introduce `memory-bank/` or duplicate canonical rules across agent files;
- pin unverified dependency versions merely because they existed in an older prototype.

## 12. Approved decisions

| ID | Status | Decision | Consequence |
|---|---|---|---|
| TECH-DEC-001 | Approved | TypeScript + Phaser 4 + React DOM + Vite foundation | Compatibility was proven by the isolated spike; approved initial pins are listed in §2.1. |
| TECH-DEC-002 | Approved | Pure Domain with application-owned state and adapters | Framework imports cannot cross into Domain. |
| TECH-DEC-003 | Approved | Hand-written observable Shared Session Store with named mutations | No framework store is authorized for MVP. |
| TECH-DEC-004 | Approved | Deterministic plain-TypeScript Combat simulation and AABB collision | Phaser physics plugins are excluded. |
| TECH-DEC-005 | Approved | Fixed `1/60 s`, maximum four steps per rendered frame, excess time discarded | Brief game-time slowdown is accepted; catch-up bursts are forbidden. |
| TECH-DEC-006 | Approved | React UI with an isolated imperative `CombatHudBridge` | Per-frame React rerenders and raw Phaser-to-DOM coupling are forbidden. |
| TECH-DEC-007 | Approved | Application-level input ownership | React and Phaser remain scoped adapters. |
| TECH-DEC-008 | Approved | Independent deterministic RNG streams | Unrelated random behaviour cannot perturb Combat sequences. |
| TECH-DEC-009 | Approved | Evidence type chosen per Acceptance Criterion | Manual and measured gates remain valid where automation is unsuitable. |
| TECH-DEC-010 | Approved | Canonical documentation plus concise agent routing; no memory bank | Governance duplication and drift are reduced. |
| TECH-DEC-011 | Approved | 32-bit session seed, versioned FNV-1a stream derivation, and Mulberry32 streams | Random sequences are dependency-free, reproducible, isolated by subsystem, and protected by test vectors. |

## 13. Readiness

The final cross-document technical audit passed on `2026-08-20`.

The Technical Foundation is **READY FOR IMPLEMENTATION** through explicitly assigned feature slices governed by `AGENTS.md` and the Verification and Quality Gates specification.

## 14. Approved v0.2 persistence extension

For `V02-WI-02` only, the Product Owner approved exactly pinned `dexie@4.4.5` as the IndexedDB persistence adapter defined by `SHMUP_V0.2_TACTICAL_COMBAT_FOUNDATION_SPECIFICATION.md` §14. The Work Item must add the exact package and lockfile entry, run the complete dependency and browser gates, and keep Dexie inside the platform persistence adapter. Domain, UI, and Phaser code must not import Dexie or mutate stored records directly.

This approval does not mean Dexie is present in the accepted baseline before `V02-WI-02`, and it does not authorize another persistence dependency, backend, cloud sync, multiple save slots, or mid-Combat restoration.

# MVP Repository Architecture v0.1

**Product:** Shmup  
**Scope:** Repository structure, module ownership, dependency directions, and runtime composition  
**Status:** APPROVED  
**Decision owner:** Product Owner  
**Approved:** 2026-08-20

## 1. Purpose

This document translates `MVP_TECHNICAL_FOUNDATION_v0.1.md` into an enforceable repository structure.

It defines where each kind of code and asset belongs, which modules may depend on which other modules, and which boundaries must remain explicit. It does not define product behaviour and does not authorize feature implementation before the remaining readiness gates close.

## 2. Architectural objective

The repository must support:

- deterministic browser-independent gameplay rules;
- one authoritative Shared Session State;
- a separately loaded Combat runtime;
- React-owned UI and Phaser-owned Combat rendering without state-authority overlap;
- small replaceable adapters around browser and framework APIs;
- direct automated testing of Domain and application behaviour;
- growth through explicit features and components without creating generic dumping grounds.

The architecture is a layered core with feature-local modules. It is not a collection of independent micro-frontends, packages, plugins, or services.

## 3. Canonical repository tree

```text
Shmup0.1/
├── AGENTS.md
├── README.md
├── package.json
├── package-lock.json
├── .nvmrc
├── index.html
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── eslint.config.js
├── stylelint.config.js
├── .prettierrc.json
├── .prettierignore
├── Project Documentation/
├── assets/
│   ├── runtime/
│   ├── source/
│   └── licenses/
├── src/
│   ├── bootstrap/
│   ├── domain/
│   │   ├── session/
│   │   ├── mission/
│   │   ├── combat/
│   │   └── random/
│   ├── content/
│   │   ├── aircraft/
│   │   ├── weapons/
│   │   ├── enemies/
│   │   ├── missions/
│   │   └── pilots/
│   ├── application/
│   │   ├── session/
│   │   ├── mission/
│   │   ├── combat/
│   │   ├── input/
│   │   ├── lifecycle/
│   │   └── ports/
│   ├── ui/
│   │   ├── components/
│   │   ├── screens/
│   │   ├── overlays/
│   │   ├── hud/
│   │   ├── hooks/
│   │   └── styles/
│   ├── combat-presentation/
│   │   ├── phaser/
│   │   ├── renderers/
│   │   ├── hud-bridge/
│   │   └── presentation-config/
│   ├── platform/
│   │   ├── browser/
│   │   ├── assets/
│   │   └── diagnostics/
│   └── test-support/
├── e2e/
├── verification/
└── dist/
```

Only directories needed by current implementation work are created. Empty placeholder trees must not be scaffolded merely to reproduce this diagram.

## 4. Top-level ownership

### 4.1 `Project Documentation/`

Contains the canonical approved product and technical contracts. Application runtime code must not import files from this directory.

### 4.2 `assets/runtime/`

Contains only prepared assets eligible for the production artifact. Runtime code accesses them through the central asset catalogue defined in `src/platform/assets/`.

The build must copy or emit only approved runtime assets. Runtime paths must respect the configured Vite base path and must not be handwritten throughout components or scenes.

### 4.3 `assets/source/`

Contains editable or original source material that is not shipped. Runtime imports from this directory are forbidden.

### 4.4 `assets/licenses/`

Contains third-party asset and font licence records. Adding a third-party asset without its required licence record is forbidden.

### 4.5 `e2e/`

Contains Playwright tests and their test-local helpers. It may exercise public application behaviour but must not become a second implementation layer or use production test backdoors.

### 4.6 `verification/`

Contains templates and completed evidence explicitly required by the approved verification contract, such as manual browser, accessibility, Design System, and performance records.

Generated reports, screenshots, traces, and transient test output are not committed unless a verification contract explicitly requires the specific artifact.

### 4.7 `dist/`

Generated production output. It is never edited manually and is not a source of truth.

## 5. Source-module contracts

### 5.1 `src/domain/`

Owns framework-independent rules, value types, state types, state transitions, calculations, deterministic simulation operations, AABB collision rules, RNG abstractions, and mission-resolution rules.

Allowed dependencies:

- other modules inside `src/domain/`.

Forbidden dependencies:

- `application`;
- `content`;
- `ui`;
- `combat-presentation`;
- `platform`;
- React, Phaser, DOM, CSS, Vite, storage, network, wall-clock, or unseeded randomness APIs.

Domain modules receive content definitions, time steps, commands, and random values through typed parameters. They do not locate those inputs globally.

### 5.2 `src/content/`

Owns typed MVP content definitions: approved weapon values, aircraft definitions, enemy definitions, mission schedules, Pilot records, and other authored data.

Allowed dependencies:

- public Domain types and validation contracts.

Forbidden responsibilities:

- state mutation;
- rendering;
- framework lifecycle;
- browser access;
- CSS values or presentation token names;
- hidden gameplay rules implemented as callbacks.

Content values must not be duplicated in scenes, components, tests, or reducers.

### 5.3 `src/application/`

Owns use cases and coordination:

- Shared Session Store;
- named actions and reducers;
- session initialization;
- Mission Snapshot creation;
- Combat runtime creation and disposal;
- one-time Mission Result commitment;
- global input routing;
- browser-lifecycle command handling;
- application ports and presentation-facing read models.

Allowed dependencies:

- `domain`;
- `content`;
- application-owned ports.

Application code must not import React components, Phaser scenes, concrete DOM elements, or concrete browser adapters. Concrete adapters are injected at the composition root.

### 5.4 `src/ui/`

Owns React presentation:

- Design System components;
- Screens;
- Overlays;
- Settings UI;
- Combat HUD structure;
- focus behaviour and UI accessibility;
- presentation-only hooks and styles.

Allowed dependencies:

- application public commands and read models;
- public Domain value types when needed for exhaustive display-state typing;
- UI-local components, styles, and approved platform-facing UI adapters.

UI code must not import Phaser, mutate Shared Session State, implement Domain rules, or read authored content directly when the application read model already supplies the required information.

### 5.5 `src/combat-presentation/`

Owns the lazy-loaded Combat presentation adapter:

- Phaser Game and Scene lifecycle;
- mapping authoritative simulation snapshots to visual objects;
- forwarding Combat input intent;
- entity-view pooling where measurements justify it;
- presentation mapping such as enemy type to Design Token;
- the isolated `CombatHudBridge` implementation.

Allowed dependencies:

- Phaser;
- application Combat commands, snapshots, and ports;
- public Domain identifiers and presentation-relevant read-only types;
- approved platform asset and token adapters.

It must not own gameplay truth, Shared Session State mutation, mission resolution, damage calculation, or reward rules.

### 5.6 `src/platform/`

Owns concrete browser and environment adapters, including:

- focus and visibility events;
- viewport measurements;
- animation-frame and monotonic-time access used by the fixed-step driver;
- asset URL resolution and bounded preload integration;
- development-only console diagnostics;
- browser entropy used to create the initial session seed.

Platform modules implement application ports. They must not decide product behaviour.

### 5.7 `src/bootstrap/`

Is the composition root. It may import all required layers solely to construct and connect them.

It owns:

- production/development configuration selection;
- adapter creation;
- application/store creation;
- React root mounting;
- lazy Combat module loading;
- bounded startup and fatal-startup coordination;
- top-level cleanup.

Product rules must not accumulate in `bootstrap`.

### 5.8 `src/test-support/`

Contains reusable deterministic fixtures, builders, fake application ports, and assertion helpers used by automated tests.

Production code must never import `test-support`.

## 6. Dependency direction

The normal dependency flow is:

```text
content ───────→ domain
application ──→ domain + content
ui ───────────→ application public API
combat presentation ─→ application Combat API
platform ─────→ application ports
bootstrap ────→ application + ui + combat presentation + platform
```

The central rule is that dependencies point toward stable product rules. Framework and browser code remain at the edges.

Circular imports between directories are forbidden. A cycle must be resolved by moving a shared contract toward its owner or introducing a small application port; it must not be hidden through a generic `shared` directory.

## 7. Public module surfaces

Each architectural area exposes a deliberately small public surface through a local entry module where this improves clarity. Internal files must not be imported through deep paths from another architectural area.

Barrel files must not:

- re-export an entire directory automatically;
- create circular initialization;
- expose framework internals;
- become a substitute for ownership.

Cross-layer imports use configured repository aliases after those aliases are fixed in the repository scaffold. Relative imports remain acceptable inside one feature or architectural area.

## 8. State ownership and data flow

### 8.1 Shared Session State

The application Session Store is the single authority for approved cross-Screen and cross-mission state.

React observes it through an adapter compatible with `useSyncExternalStore`. Phaser does not receive the mutable store object. Combat receives an immutable Mission Snapshot and application command ports.

### 8.2 Combat state

The application Combat runtime owns `CombatSimulationState`. A fixed-step driver supplies commands and time steps to pure Domain transitions.

Presentation receives read-only snapshots or view models. It must not obtain writable entity objects.

### 8.3 Mission result

Combat emits one typed terminal result. The application layer validates and commits it exactly once, disposes the active Combat runtime, and performs the approved Screen transition.

No UI component or Phaser callback applies Credits, Hull changes, Repair, rewards, or mission availability directly.

## 9. Lazy Combat boundary

No static import reachable from the initial Boot/Base entry may import Phaser or `combat-presentation`.

Entering Combat dynamically imports the Combat presentation entry. The application may prepare pure Mission and Domain data before that import.

Leaving Combat must dispose:

- Phaser Game and Scene resources;
- RAF or fixed-step-driver ownership associated with Combat;
- Combat input subscriptions;
- HUD bridge bindings;
- entity presentation objects;
- lifecycle subscriptions owned by the Combat adapter.

Returning to Base must not retain a hidden running Phaser instance.

The production build must contain a distinct Combat chunk. The exact warning threshold and further internal Phaser chunking are delivery concerns and must be driven by measured product budgets, not by arbitrary bundler-warning suppression.

## 10. Input structure

The application input router exposes typed commands rather than raw `KeyboardEvent` or Phaser input objects.

Input is separated into:

- application/global commands;
- Base and Overlay UI behaviour;
- Combat movement and action commands;
- development-only Debug commands.

Raw browser events are normalized once. State-based routing and conflict precedence are pure and unit-testable. React retains local native semantics for focused controls.

## 11. Assets and presentation configuration

All runtime asset identifiers and paths are declared in one typed catalogue under `platform/assets`. Callers request an asset by identifier and do not construct paths ad hoc.

Presentation mappings belong beside their presentation adapter. Examples include:

- Enemy Type to colour token;
- Weapon Type to icon identifier;
- Screen to approved background asset.

Gameplay content does not carry CSS values, file paths, React components, Phaser classes, or presentation token names.

## 12. Test placement

Unit and narrow integration tests are colocated with the module they verify using `*.test.ts` or `*.test.tsx`.

Use:

- Domain tests beside Domain modules;
- store and use-case tests beside application modules;
- React Testing Library tests beside UI modules;
- adapter contract tests beside platform or presentation adapters;
- Playwright flows only under `e2e/`;
- reusable deterministic fixtures under `src/test-support/`.

Vitest must exclude `e2e/`. Playwright must be restricted to `e2e/`. Generated test output must not be scanned by lint or formatting tools.

Tests must not duplicate authoritative balance tables. They may import approved content definitions or construct minimal purpose-specific fixtures.

## 13. Naming rules

- One canonical product term maps to one code term wherever language syntax allows it.
- Types and components use `PascalCase`.
- Functions, variables, and file-local values use `camelCase`.
- Directories and ordinary source filenames use `kebab-case`.
- Tests use the source filename plus `.test`.
- Interfaces are named by responsibility, not with an `I` prefix.
- Implementation classes do not receive an `Impl` suffix unless two implementations genuinely coexist and the distinction is meaningful.
- Generic names such as `Manager`, `Helper`, `Utils`, `Common`, `Misc`, `Shared`, or `Global` require a narrower responsibility name and are forbidden as catch-all modules.
- Framework concepts must not rename product concepts. For example, a Phaser `Scene` implementation may render the canonical `Combat Screen`, but product documentation and application state continue to use `Combat Screen`.

## 14. Growth rules

A new mechanic normally extends the feature or owner that governs it. A new top-level architectural directory requires an explicit architecture update.

Create a shared abstraction only when:

1. at least two real consumers require the same contract;
2. ownership is clear;
3. the abstraction removes actual duplication without erasing product meaning;
4. its dependency direction follows this document.

Do not create speculative systems, generic engines, plug-in registries, dependency-injection frameworks, event buses, entity-component systems, or repository packages for possible future use.

Extensibility comes from small typed contracts and clear ownership, not from maximizing abstraction count.

## 15. Enforcement

The repository scaffold must configure automated checks for:

- forbidden cross-layer imports;
- production imports from `test-support`;
- runtime imports from `assets/source`;
- TypeScript strictness;
- unused code and unsafe type escapes according to the approved Code Principles;
- separation of Vitest and Playwright test discovery;
- formatting and stylesheet rules;
- a production build containing a distinct lazy Combat chunk.

If a rule cannot be enforced reliably through current tooling, it must appear in the mandatory architecture audit checklist rather than being falsely represented as automated.

## 16. Negative requirements

The repository must not:

- create a monolithic `game.ts`, `store.ts`, `utils.ts`, or `constants.ts` containing unrelated systems;
- introduce a generic `shared`, `common`, `core`, `services`, or `managers` dumping ground;
- import Phaser from Domain, content, application, or React UI code;
- import React from Domain, content, application, or Combat simulation code;
- expose mutable Session Store or Combat entity objects to presentation;
- import runtime behaviour from project documentation;
- ship `assets/source`;
- hardcode asset paths throughout scenes and components;
- eagerly load Phaser during Boot or Base;
- introduce a second state store, event bus, framework store, or parallel source of truth;
- create empty speculative modules or future-feature placeholders;
- treat generated output, test evidence, task notes, or agent memory as authoritative product requirements.

## 17. Repository readiness

The Repository Architecture contract is approved. No additional product decision is required to scaffold this structure.

The final cross-document technical audit passed on `2026-08-20`.

The Repository Architecture is **READY FOR IMPLEMENTATION** through explicitly assigned feature slices.

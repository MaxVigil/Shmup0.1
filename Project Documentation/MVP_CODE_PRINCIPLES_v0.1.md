# MVP Code Principles v0.1

**Product:** Shmup  
**Scope:** Mandatory implementation, review, testing, cleanup, and performance rules  
**Status:** APPROVED  
**Decision owner:** Product Owner  
**Approved:** 2026-08-20

## 1. Purpose

These principles constrain how the approved MVP is implemented. They protect product behaviour, deterministic Combat, browser performance, maintainability, and the repository boundaries defined by `MVP_REPOSITORY_ARCHITECTURE_v0.1.md`.

They are mandatory implementation rules, not style suggestions. A local exception requires evidence, a written rationale, and approval at the appropriate architecture or product level.

## 2. Priority order

When implementation concerns compete, apply this order:

1. approved product behaviour and acceptance criteria;
2. correctness and one authoritative state;
3. deterministic and reproducible behaviour;
4. supported-browser stability and cleanup;
5. performance budgets;
6. accessibility and Design System compliance;
7. architectural boundaries;
8. simplicity and readability;
9. implementation convenience.

This order does not authorize knowingly violating a lower item. It determines how a real trade-off is escalated when all constraints cannot be satisfied simultaneously.

## 3. Simplicity and scope discipline

- Implement only approved MVP behaviour.
- Use the smallest complete design that satisfies current requirements and preserves the approved boundaries.
- Prefer explicit code and typed data over generalized frameworks, reflection, registries, decorators, metaprogramming, or configuration languages.
- Do not add speculative extension points, placeholder systems, unused options, or abstractions for hypothetical mechanics.
- Remove obsolete code when replacing behaviour; do not leave parallel legacy paths or commented-out implementations.
- A TODO must identify an approved follow-up or concrete defect. Speculative TODOs are forbidden.
- No module may silently invent missing product behaviour. Missing or conflicting S0–S2 behaviour stops the affected implementation.

## 4. TypeScript contract

The repository uses strict TypeScript.

Required compiler posture includes:

- `strict`;
- `noUncheckedIndexedAccess`;
- `noImplicitOverride`;
- `noFallthroughCasesInSwitch`;
- `noUnusedLocals`;
- `noUnusedParameters`;
- `exactOptionalPropertyTypes` unless the compatibility scaffold demonstrates a concrete third-party conflict that cannot be isolated.

Rules:

- `any` is forbidden in production code and tests.
- External or untrusted values begin as `unknown` and are narrowed or validated.
- Non-null assertions require a locally obvious invariant; repeated assertions indicate a missing type or lifecycle guard.
- Type assertions must not be used to suppress an unresolved model mismatch.
- Public functions and architectural boundaries use explicit parameter and return types.
- Internal local inference is preferred when the type is unambiguous.
- Discriminated unions represent finite product states and commands.
- Exhaustive state handling must fail compilation when a new variant is unhandled.
- Boolean parameters with unclear call-site meaning are replaced by named options or separate commands.
- Domain identifiers use distinct typed aliases or branded types when confusing two identifiers could produce valid but incorrect code.
- Enums are not the default; string-literal unions and frozen typed records are preferred unless an enum provides a demonstrated interoperability benefit.

Suppressing a compiler or lint rule requires the narrowest possible scope and a comment explaining the invariant or external limitation.

## 5. State and mutation

### 5.1 Shared Session State

- Shared Session State changes only through named application actions or reducers.
- Each mutation has one owner and one reason.
- Components, Phaser objects, browser listeners, and tests must not modify store data directly.
- Store readers receive read-only state or read models.
- Mission Result commitment is idempotent and guarded against duplicate application.

### 5.2 Domain transitions

- Domain rules are deterministic for the same explicit inputs.
- The normal rule is that a function does not mutate caller-owned input.
- State transitions return the new state and explicitly returned effects or events.
- Domain code does not read global time, global randomness, DOM state, process environment, or framework state.

### 5.3 Combat hot-path exception

Correctness must not create uncontrolled per-frame allocation.

An optimized Combat step may mutate an exclusively owned simulation buffer only when all of the following are true:

1. profiling shows the immutable implementation threatens an approved performance budget;
2. the mutable object never escapes as a writable reference;
3. presentation receives a read-only snapshot or view;
4. the step remains deterministic for identical state, input, seed, and time step;
5. tests prove state transitions and collision ordering;
6. the exception and measurement are recorded in the performance evidence.

This exception does not permit mutation of Shared Session State or presentation objects from Domain code.

## 6. Determinism, time, and randomness

- Combat advances only through the approved fixed step.
- Domain and application tests advance simulation explicitly; they do not wait for real time.
- Wall-clock timestamps do not determine gameplay outcomes.
- Browser time and RAF are accessed only through platform adapters.
- Random behaviour uses injected deterministic streams derived from the Session Seed.
- Separate systems use separate streams or sub-seeds.
- Tests use explicit fixed seeds.
- Entity and event ordering is stable and documented where it changes results.
- Object iteration order must not accidentally determine damage, collision, spawn, or resolution behaviour.
- A change that intentionally alters an approved deterministic sequence must update its tests and be reported as a behavioural change.

## 7. Commands, effects, and events

- Inputs enter the application as typed commands.
- Domain transitions may return typed effects or events for the application to handle.
- Effects do not execute inside Domain functions.
- There is no global event bus.
- Events are not used to hide direct use-case flow that can be expressed as a normal function call.
- Event names describe completed facts; command names describe requested actions.
- One raw input event must not produce duplicate application commands.

## 8. Error and invariant handling

Errors are classified before handling:

- expected product rejection;
- recoverable runtime failure;
- fatal startup failure;
- programmer invariant violation.

Rules:

- Expected product rejection is represented as a typed result or approved disabled state, not an exception.
- Recoverable runtime failures follow the approved fallback or lifecycle behaviour and retain diagnostic context in development.
- Fatal startup failures follow the approved Fatal Startup View contract.
- Programmer invariant violations fail loudly in development and tests.
- Production must not expose stack traces or technical messages in player-facing UI.
- Empty `catch` blocks and catch-log-continue without a defined recovery state are forbidden.
- Do not convert an unknown failure into success or silently use stale state.
- Error messages identify the failed operation and relevant stable identifiers without including secrets or unnecessary personal data.

## 9. Lifecycle and cleanup

Every registration or allocation with a lifetime has an explicit owner and disposal path.

This includes:

- DOM and Phaser event listeners;
- subscriptions;
- RAF callbacks;
- timers;
- Phaser Game, Scene, texture, and presentation objects;
- HUD bridge bindings;
- AbortControllers;
- observers and browser lifecycle handlers.

Rules:

- Setup and cleanup are implemented together.
- Cleanup is safe when called once; where lifecycle races are possible, it is idempotent.
- Leaving Combat disposes the complete Combat presentation/runtime boundary.
- React development Strict Mode must not create duplicate listeners, game instances, stores, or result commits.
- A repeated five-mission flow must not leave growing active listeners, timers, canvases, scenes, or entity collections.

## 10. React rules

- Components describe presentation and dispatch commands; they do not implement gameplay rules.
- Render functions remain free of side effects.
- Effects are used only to synchronize with external systems and always define cleanup when they acquire a resource.
- Derived display values are computed rather than copied into duplicate React state.
- `useSyncExternalStore` or the approved wrapper is used for the application store.
- Global state is not introduced through ad hoc React Context when the application store or a local component boundary owns it.
- Local UI state is limited to transient presentation state that has no cross-system authority.
- Native semantic elements are preferred over recreated interactive behaviour.
- Keys identify stable product entities and must not use array position when ordering or membership can change.
- Memoization is introduced for measured or structurally clear reasons, not automatically.
- Per-frame Combat HUD placement uses only the approved `CombatHudBridge`, not React state.

## 11. Phaser and Combat presentation rules

- Phaser reads read-only simulation presentation data and renders it.
- Phaser callbacks dispatch typed intent; they do not apply product consequences.
- Phaser Scene lifecycle does not create a second application lifecycle.
- Visual-object identity maps explicitly to stable simulation entity identity.
- Presentation object pooling is added only after measurement and includes a reset contract for every reused property.
- No Arcade Physics body or physics callback may become gameplay authority.
- Rendering interpolation may improve visual smoothness but must not feed values back into authoritative simulation.
- Combat presentation code remains behind the lazy Combat boundary.

## 12. Content and balance rules

- Authored gameplay values live in typed content definitions.
- Content records contain data, not executable callbacks or framework objects.
- Domain code validates content invariants at the appropriate boundary.
- Production code does not duplicate balance values as magic numbers.
- Tests that verify exact approved content import the authoritative definition.
- Tests of generic rules use small local fixtures and do not depend unnecessarily on full production content.
- Presentation tokens and asset paths are not gameplay content.

## 13. Functions and modules

- A module has one coherent responsibility and one clear owner.
- Public APIs remain smaller than their implementation.
- Prefer named functions for product operations and transformations.
- A function should make its inputs, outputs, and possible failure explicit.
- Hidden singleton state is forbidden except for framework roots explicitly owned by `bootstrap`.
- Avoid long parameter lists by grouping values that form one real concept, not by creating generic context bags.
- Dependency injection uses constructors or function parameters; no dependency-injection framework is approved.
- Do not abstract a one-off operation unless the abstraction clarifies ownership, testing, or a real repeated pattern.
- Comments explain rationale, invariants, units, or non-obvious trade-offs. Comments must not paraphrase self-evident syntax.

## 14. Units and numeric safety

- Units appear in names or types where confusion is plausible: seconds, pixels, normalized viewport units, ratios, Credits, and Hull Integrity.
- Combat simulation uses seconds, not mixed milliseconds and seconds.
- Ratios use the documented range and are clamped only where the product contract authorizes clamping.
- Floating-point comparisons use explicit tolerances where exact equality is not guaranteed.
- `NaN`, infinity, negative elapsed time, and invalid content values must not propagate silently through simulation.
- Tuning constants live with their authoritative content or rule owner and include their unit.

## 15. Performance is a recurring gate

Every new system must fit the approved performance budget when introduced. Performance work is not deferred to a final optimization phase.

Required practice:

- identify the likely hot path before implementing a per-frame feature;
- avoid per-frame DOM queries, React rerenders, asset lookup, CSS token resolution, listener registration, and unbounded allocation;
- cache stable presentation resources at the approved lifecycle boundary;
- keep algorithms proportional to actual MVP entity counts;
- measure before adding pooling, spatial partitioning, memoization, or lower-level data structures;
- record performance evidence at required milestones and after material Combat changes;
- investigate sustained budget regression before adding more features on top of it.

Passing on a development machine does not replace the approved reference-device verification.

## 16. Dependencies and licences

- No runtime or development dependency is added outside the approved matrix without explicit technical review.
- Review includes purpose, maintenance status, licence, browser impact, bundle impact, security posture, and compatibility with the approved stack.
- Prefer platform or existing dependency capability when it is clear and maintainable.
- Do not add a dependency to avoid writing a small, project-specific function.
- Dependency versions are exact-pinned and committed through `package-lock.json`.
- `npm ci` is the reproducible installation path for an existing lockfile.
- Licence obligations for shipped code, fonts, icons, and assets must be preserved.

## 17. Testing principles

- Test externally meaningful behaviour and stable contracts, not private implementation arrangement.
- Domain and application behaviour receives the majority of coverage through deterministic Vitest tests.
- React Testing Library tests user-visible DOM behaviour and accessibility semantics.
- Playwright covers a small set of high-value supported-browser flows.
- Manual evidence covers visual quality, game feel, reference-device performance, and lifecycle behaviour that browser automation cannot represent reliably.
- Each Acceptance Criterion maps to the suitable evidence type.
- A bug fix adds a regression test at the lowest reliable layer when technically possible.
- Tests must not depend on execution order, real waiting, network access, or uncontrolled randomness.
- Fake timers are used only for adapter-level time behaviour; fixed-step Domain tests pass time explicitly.
- Snapshot tests must not replace behavioural assertions or visual review.
- A flaky test is a defect. It is fixed or removed with a documented replacement gate; it is not retried until green and ignored.

## 18. Security and browser hygiene

- The MVP is client-only and stores no secrets.
- Do not add credentials, tokens, personal data, analytics identifiers, or remote-service endpoints.
- Player-facing text is rendered as text, not injected HTML.
- Dynamic code execution is forbidden.
- Browser APIs are accessed through owned adapters where lifecycle or testing matters.
- Production logs exclude seeds unless the approved production diagnostic contract later requires them; seeds remain development diagnostics.
- Third-party code and assets must not introduce runtime CDN or network requirements.

## 19. Change discipline

- Keep changes narrowly scoped to one approved outcome.
- Do not combine refactoring, dependency upgrades, formatting churn, and product behaviour changes without a concrete need.
- Preserve unrelated user work in the repository.
- A refactor must keep behaviour stable and prove that through existing or added tests.
- A behavioural change updates its authoritative requirements, acceptance evidence, and traceability in the same approved change.
- A dependency or architectural-boundary change updates the technical documentation and lockfile evidence together.
- Agents must report assumptions, unresolved conflicts, changed files, verification performed, and remaining risks.

Git and external-action authority is defined by `AGENTS.md` and the DeepSeek Governance and Skill Routing specification. These principles do not authorize an agent to commit or publish changes externally.

## 20. Definition of Done for an implementation increment

An increment is not complete unless:

1. its approved scope and negative requirements are satisfied;
2. relevant automated checks pass;
3. required manual or measured evidence is recorded;
4. repository boundaries and Design System rules pass audit;
5. no known S0–S2 defect or ambiguity remains in the increment;
6. lifecycle cleanup is verified where the increment acquires resources;
7. performance is checked in proportion to its runtime impact;
8. documentation and traceability are updated when their contract changed;
9. no unrelated feature, dependency, or abstraction was introduced;
10. the implementation report states exactly what changed and what remains.

## 21. Negative requirements

Implementation must not:

- use `any`, unchecked external data, or broad type assertions to bypass design work;
- mutate authoritative state from presentation code;
- depend on global time or unseeded randomness for gameplay;
- hide product flow in a global event bus;
- swallow errors or continue in an undefined state;
- create a resource without an owned cleanup path;
- add per-frame React state updates for Combat positioning;
- optimize speculatively or ignore measured regression;
- duplicate balance, asset paths, or Design Tokens;
- add dependencies, services, storage, telemetry, or network behaviour outside approved scope;
- weaken tests, lint, types, or budgets merely to make a gate pass;
- represent an unverified manual requirement as automated coverage;
- publish, push, deploy, or contact an external system without explicit authorization.

## 22. Readiness

The Code Principles are approved. No additional product decision is required to configure and enforce them.

The final cross-document technical audit passed on `2026-08-20`.

The Code Principles are **READY FOR IMPLEMENTATION** and mandatory for every explicitly assigned feature slice.

# MVP Verification and Quality Gates v0.1

**Product:** Shmup  
**Scope:** Reproducible repository commands, automated gates, manual evidence, and milestone blocking rules  
**Status:** APPROVED  
**Decision owner:** Product Owner  
**Approved:** 2026-08-20

## 1. Purpose

This document defines the exact commands and evidence required to represent an implementation increment or build as verified.

Passing a command proves only the scope of that command. Automated checks do not replace approved manual visual, accessibility, lifecycle, or reference-device performance evidence.

## 2. Environment contract

The repository uses:

```text
Node: 24.19.0
npm:  11.17.0
package manager: npm
dependency source: package-lock.json
```

The exact versions are recorded in `.nvmrc`, `package.json`, `package-lock.json`, and `MVP_TECHNICAL_FOUNDATION_v0.1.md`.

Changing Node, npm, a dependency pin, or the lockfile requires a compatibility review and must not be bundled invisibly with feature work.

## 3. Installation

For an existing repository and lockfile, the canonical installation command is:

```text
npm ci
```

`npm install` is used only when intentionally creating or updating the lockfile after an approved dependency change.

Playwright Chromium binaries are installed on a new verification environment with:

```text
npx playwright install chromium
```

Operating-system browser dependencies, when required by CI or Linux, are environment setup and must not be installed silently by a feature task.

## 4. Development commands

### Local development server

```text
npm run dev
```

### Unit/DOM test watch mode

```text
npm run test:watch
```

### Production artifact preview

```text
npm run build
npm run preview
```

Direct `file://` execution is unsupported.

## 5. Individual automated gates

| Gate | Command | Required evidence |
|---|---|---|
| Formatting | `npm run format:check` | exit code `0` |
| TypeScript and stylesheet lint | `npm run lint` | exit code `0` |
| Strict TypeScript | `npm run typecheck` | exit code `0` |
| Domain/application/DOM tests | `npm run test` | all Vitest tests pass |
| Production build | `npm run build` | exit code `0` and `dist/` produced |
| DEV browser flows | `npm run test:e2e` | development Playwright project passes |
| Production browser flows | `npm run test:e2e:production` | fresh production build and production Playwright project pass |

`npm run format` modifies files and is not a verification gate. It may be used deliberately to format an owned change before `format:check`.

## 6. Aggregate gates

### Fast local gate

```text
npm run verify
```

It runs, in order:

1. formatting check;
2. lint;
3. typecheck;
4. Vitest;
5. production build.

This is mandatory before presenting any code increment for review.

### Browser gate

```text
npm run verify:browser
```

It runs DEV and production Playwright projects. It is mandatory when a change affects Boot, UI, input, browser lifecycle, assets, routing, Combat presentation, build mode, or player-visible behaviour.

### Complete automated gate

```text
npm run verify:all
```

It runs the fast local gate and browser gate. It is mandatory before a milestone or test-build handoff.

## 7. Test discovery boundaries

- Vitest discovers `*.test.ts` and `*.test.tsx` outside `e2e/`.
- Playwright discovers tests only under `e2e/`.
- Production code must not import test support.
- DEV-only diagnostics may support approved Debug Mode flows; production must not contain a player-accessible test hook.
- A missing test is not treated as passing evidence.
- Tests must not be focused, skipped without an approved reason, retried until green, or dependent on execution order.

## 8. Architecture gate

Each implementation increment must be audited for:

- permitted dependency direction;
- one authoritative state owner;
- no eager Phaser import from Boot/Base;
- no production import from `test-support` or `assets/source`;
- no new generic dumping-ground module;
- no duplicate balance, asset path, or Design Token authority;
- owned setup and cleanup;
- no new dependency without approval.

Automated lint rules enforce only the patterns they can identify reliably. Review must inspect relative-import boundary bypasses and architectural semantics that lint cannot prove.

## 9. Lazy Combat gate

Once Combat presentation exists, each production milestone must confirm:

1. the initial Boot/Base dependency graph does not statically import Phaser;
2. the production output contains a distinct Combat chunk;
3. Phaser loads only when entering Combat;
4. returning to Base destroys the active Phaser instance;
5. repeating missions does not accumulate canvases, scenes, listeners, or Combat runtime objects.

Bundle-warning thresholds must not be increased merely to hide a regression.

## 10. Manual evidence gates

Automated checks do not authorize claims about visual correctness, game feel, supported-device performance, or operating-system focus behaviour.

The applicable increment or milestone must record:

- inspected build identifier and source revision;
- browser version and viewport;
- passed/failed result;
- observed defect or deviation;
- person and date;
- referenced Acceptance Criteria;
- performance measurements where applicable.

Manual gates include:

- Design System visual audit;
- keyboard-only and focus audit;
- browser focus/visibility/resize lifecycle audit;
- Combat readability and control-feel review;
- asset fallback review;
- reference-device performance profile;
- five-mission cleanup and memory review.

Evidence belongs in `verification/` only when required for a milestone or build handoff. Transient screenshots, traces, and generated reports remain ignored.

## 11. Performance gate

Performance is checked during implementation, not deferred until all features exist.

At minimum, record a proportional performance check when a change adds or materially changes:

- a per-frame Combat system;
- entities, projectiles, collision pairs, or spawn behaviour;
- React subscription or rendering behaviour;
- runtime assets or fonts;
- a Screen, Overlay, animation, resize path, or lifecycle listener;
- bundle or lazy-loading boundaries.

A sustained regression against an approved budget blocks additional dependent feature accumulation until it is understood and resolved or explicitly accepted by the Product Owner.

The final reference-device evidence uses the hardware, browsers, viewport, workload, and fields defined by the product and Delivery specifications.

## 12. Dependency and lockfile gate

When an approved dependency changes:

1. update the exact pin in `package.json`;
2. update `package-lock.json` with the approved npm version;
3. run `npm ci` from the resulting lockfile;
4. run `npm run verify:all` where the environment permits browser execution;
5. inspect audit, licence, build-size, and browser effects;
6. update the Technical Foundation when the approved matrix changes.

`--force`, `--legacy-peer-deps`, floating versions, and ignored peer conflicts are forbidden.

## 13. Initial scaffold evidence — 2026-08-20

The repository configuration scaffold passed:

- exact dependency installation and lockfile generation;
- npm audit with zero reported vulnerabilities at installation time;
- Prettier check;
- ESLint and Stylelint;
- strict TypeScript check;
- Vitest with React Testing Library under jsdom;
- Vite production build;
- Playwright Chromium DEV smoke test;
- Playwright Chromium production smoke test.

The scaffold production entry chunk was approximately `190.47 kB` before gzip and `59.98 kB` after gzip. This is toolchain evidence only, not final MVP performance acceptance.

On this macOS environment, `npm ci` reported that optional `fsevents` install scripts were not allowlisted by npm. No script was approved: the clean install, development server, production build, and both browser smoke projects passed without it. This warning is classified as a non-blocking optional platform dependency unless a later supported workflow demonstrates a concrete file-watching defect.

## 14. Failure rules

- Any required non-zero command blocks the affected increment.
- A tool warning is classified and resolved or explicitly recorded; it is not silently ignored.
- A manual gate without evidence is `NOT VERIFIED`, not passed.
- Environment failure is distinguished from product failure and includes diagnostic evidence.
- Verification must not modify product source except when the invoked command is explicitly a formatting or approved update command.
- Gates must not be weakened to accept an existing failure.

### 14.1 Slice acceptance threshold

Automated green gates are necessary but do not equal acceptance. Defect classes and escalation authority are defined once in `AGENTS.md` §10.1.

A Slice is eligible for `Accepted` only when:

- no known `S0`, `S1`, or `S2` remains;
- every required automated gate passes;
- applicable manual, browser, accessibility, lifecycle, and performance evidence exists and matches the tested revision;
- source conflicts, scope deviations, and negative requirements have been reviewed;
- no ownerless deferral or known-defective foundation is passed to a dependent Slice.

`S3` must not create a correction cycle by itself. `S4` is neither reported nor tracked. A failed command, missing mandatory evidence, or materially misleading test is at least `S2` until resolved.

An eligible local defect may use the reviewer-owned Micro-correction lane in `AGENTS.md` §10.3 instead of a separate implementation-agent cycle. Acceptance still requires the defect to be fixed, covered by regression, and verified; the lane reduces relay cost but never lowers the threshold.

### 14.2 UI viewport and focus baseline

Every Slice that creates or materially changes a full-viewport Screen must extend the shared browser regression in `e2e/viewport-bounds.spec.ts` for each affected supported Screen state. At the minimum `1280 × 600` viewport, evidence must assert:

- no unintended horizontal document overflow;
- no unintended vertical document overflow when the Screen contract does not permit scrolling;
- the complete focus ring of the programmatically focused destination, including outline width and positive offset, remains inside the viewport;
- the measured element is the expected active element;
- viewport screenshots are captured as viewport evidence when manual visual evidence applies; a full-page screenshot alone cannot prove viewport fit.

Use numeric DOM geometry for pass/fail. Screenshots supplement these assertions; they do not replace them. Add the state to the existing test owner rather than creating a one-off probe that survives in product files.

## 15. Readiness

The dependency lockfile, repository configuration scaffold, and verification-command contract are approved and verified.

The final cross-document technical audit and `npm run verify:all` passed on `2026-08-20`.

The Verification and Quality Gates are **READY FOR IMPLEMENTATION** and mandatory for every applicable feature slice and milestone.

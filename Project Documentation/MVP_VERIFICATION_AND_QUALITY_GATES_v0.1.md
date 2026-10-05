# MVP Verification and Quality Gates v0.1

**Product:** Shmup  
**Scope:** Reproducible repository commands, automated gates, manual evidence, and milestone blocking rules  
**Status:** APPROVED  
**Decision owner:** Product Owner  
**Approved:** 2026-08-20
**Identity and independent-review update:** 2026-08-26

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

### Project context validation

Before substantive work, run:

```text
npm run context:validate
```

This command verifies the canonical Shmup0.1 `origin`, package marker, Git revisions, main-branch divergence against the local `origin/main`, and active handoff revision. It reports unrelated working-tree entries so the agent can preserve them. It does not contact GitHub. Work requested against current `main` therefore requires an explicit `git fetch origin` before this gate.

When `.agent-handoff/control.json` exists, `npm run handoff:validate` runs the context gate first and then validates the handoff schema and result. A stale handoff must fail before implementation begins.

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

For local-only `S14` acceptance, a recorded production-build proxy profile may substitute for the unavailable physical reference-device profile only as non-reference evidence. The physical profile remains mandatory before the first external playtest or any minimum-system-requirement claim.

Evidence belongs in `verification/` only when required for a milestone or build handoff. Transient screenshots, traces, and generated reports remain ignored.

### 10.1 Evidence-on-demand review order

The independent reviewer must inspect evidence in this order:

1. handoff identity and assigned scope;
2. expected failure modes, boundary cases, and negative-requirement risks derived independently from the canonical contract;
3. actual Git diff, changed owners, and every committed test change;
4. whether a relevant broken implementation would make the tests fail; use an independent counter-test when shared author/reviewer assumptions are plausible;
5. failed, deviated, manual, or risk-linked evidence;
6. full audit records, traces, or screenshots only when the changed risk requires them;
7. the smallest independent diagnostic needed, followed by every required acceptance gate.

Do not load all prior Slice audits, screenshots, or full evidence packages by default. This rule reduces review context only. It does not authorize skipping a relevant browser, manual, lifecycle, cleanup, production, or performance gate.

### 10.2 External audit evidence threshold

An external technical or process audit is not acceptance evidence unless it identifies:

- repository path and Git revision;
- concrete file or module owners;
- an observed fact separately from a recommended solution;
- a repeatable command, profile, trace, or inspection method;
- device, browser, viewport, workload, and sample window for performance claims.

Claims about absent files, dependencies, hooks, or architecture must be checked against the repository before action. A numerical improvement without a baseline and method is not a verified estimate.

## 11. Performance gate

Performance is checked during implementation, not deferred until all features exist.

At minimum, record a proportional performance check when a change adds or materially changes:

- a per-frame Combat system;
- entities, projectiles, collision pairs, or spawn behaviour;
- React subscription or rendering behaviour;
- runtime assets or fonts;
- a Screen, Overlay, animation, resize path, or lifecycle listener;
- bundle or lazy-loading boundaries.

For a Combat-heavy Epic that changes enemy types or their runtime behaviour:

1. approve the representative enemy mix, schedule, and maximum concurrent workload;
2. run one production-build pre-change proxy baseline on the current accepted revision;
3. repeat the same scenario after the integrated Epic;
4. record entity maxima, mean and percentile frame time, sustained FPS, repeatable long tasks, cleanup, and heap or allocation/GC evidence when browser tooling can measure it reliably;
5. investigate a correlated budget threat before adding object pooling, mutable simulation buffers, spatial partitioning, or another lower-level optimization.

The existing accepted S14 proxy is historical performance evidence, not a substitute for the pre-change baseline when the new Epic's representative workload differs.

A sustained regression against an approved budget blocks additional dependent feature accumulation until it is understood and resolved or explicitly accepted by the Product Owner.

Local-only `S14` acceptance uses the available production-build proxy evidence when the approved physical device is unavailable. This evidence must identify the environment and must not claim physical-device certification. The later physical gate uses the hardware, browsers, viewport, workload, and fields defined by the product and Delivery specifications and must pass before the first external playtest or any minimum-system-requirement claim.

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
- a reviewer independent of the substantive author has judged implementation and test adequacy.

`S3` must not create a correction cycle by itself. `S4` is neither reported nor tracked. A failed command, missing mandatory evidence, or materially misleading test is at least `S2` until resolved.

An eligible local defect may use the reviewer-owned Micro-correction lane in `AGENTS.md` §10.4 instead of a separate implementation-agent cycle. A reviewer who changes production code, committed tests, build configuration, or canonical governance cannot accept that amendment. A different qualified reviewer must inspect the exact amendment and test adequacy before `Accepted`. The lane reduces relay cost but never lowers the threshold or permits self-acceptance.

### 14.2 UI viewport and focus baseline

Every Slice that creates or materially changes a full-viewport Screen must extend the shared browser regression in `e2e/viewport-bounds.spec.ts` for each affected supported Screen state. At the minimum `1280 × 600` viewport, evidence must assert:

- no unintended horizontal document overflow;
- no unintended vertical document overflow when the Screen contract does not permit scrolling;
- the complete focus ring of the programmatically focused destination, including outline width and positive offset, remains inside the viewport;
- the measured element is the expected active element;
- viewport screenshots are captured as viewport evidence when manual visual evidence applies; a full-page screenshot alone cannot prove viewport fit.

Use numeric DOM geometry for pass/fail. Screenshots supplement these assertions; they do not replace them. Add the state to the existing test owner rather than creating a one-off probe that survives in product files.

## 15. Development-process metrics

After each accepted post-MVP Epic, the independent reviewer records the compact fields in `verification/process-metrics-template.md`:

- implementation and review model/provider and dialogue identifiers;
- prompt cache-hit, prompt cache-miss, and output tokens for each agent when exposed;
- measured API cost for implementation, review, and repair when exposed, without hard-coding provider prices in this document;
- agent turns, implementation cycles, and correction cycles;
- loaded canonical sections;
- control/result size;
- gate durations;
- escaped defects found by independent or human review.

If token counts or costs are unavailable, record that fact and use context bytes, turns, cycles, and wall-clock as proxies. Compare cost per accepted scope, not cost per individual prompt. These are development-process records. They are not player telemetry and must never be added to the production application.

Re-audit after three accepted post-MVP scopes. Keep an optimization only when cost improves without increased escaped defects or weakened gates.

## 16. Readiness

The dependency lockfile, repository configuration scaffold, and verification-command contract are approved and verified.

The final cross-document technical audit and `npm run verify:all` passed on `2026-08-20`.

The Verification and Quality Gates are **READY FOR IMPLEMENTATION** and mandatory for every applicable Slice, Epic, Work Item, correction, and milestone.

## 17. Shmup v0.2 final-candidate verification status — 2026-09-29

This section records evidence status only. It changes no command, gate, floor,
threshold, workload, sample window, discovery rule, failure rule or policy in
§§1–16, and it authorizes no waiver. Status observations added after 2026-09-29 are
dated in place in §§17.1–17.4.

Final candidate: worktree `/Users/maximvigilev/Shmup0.1-worktrees/v02-wi-07`,
origin `https://github.com/MaxVigil/Shmup0.1`, branch `feat/v02-wi-07`,
HEAD `0c8901d7b3b9c9fd63288b4ca9011846732ee291` with the accepted `V02-WI-07`
`D01`–`D05` candidate as uncommitted working-tree changes.

Identities referenced by this record, kept strictly apart:

- **Accepted `D05` evidence:** source fingerprint `2d4f8f31`, run
  `v02-wi-07-performance-d05-c02-0c8901d`. Those records keep their own identity,
  are never rewritten, and are never compared with `D06` artifacts.
- **Historical blocked `D06` attempts:** the pre-lock-refresh attempt ran at
  source fingerprint `c61afb46` and stopped at `npm audit` (§17.1). That value
  describes only that historical attempt and is not a current candidate.
- **Submitted `D06` candidate:** source fingerprint `31e86ec3` — the candidate
  that the passing gate record in §17.3 was measured on, with its original
  control envelope archived byte-identically under
  `.agent-handoff/evidence/wi07-d06-review-backup/`.
- **Correction envelope `V02-WI-07-D06-C01`:** replacing `control.json` alone
  moves the control-inclusive fingerprint to `0fe518f2`. A read-only substitution
  check recomputes the canonical digest over the same 291 input files with the
  archived original control and reproduces `31e86ec3` exactly, so every
  non-control input — product code, tests, build configuration, dependency
  lockfile and scripts — is byte-identical to the submitted candidate. Only the
  documentation and the transient envelope differ, which is why this correction
  re-runs no gate or performance evidence.

Already accepted predecessor evidence for the same candidate content
(`V02-WI-07 D05`, run `v02-wi-07-performance-d05-c02-0c8901d`, source
fingerprint `2d4f8f31`, `wi07-d05-independent-acceptance.json`):

- six workload records sharing one runId, source fingerprint, build identity,
  `1366×768` viewport and session seed `19023`, with both legacy sides measured
  once and above the unchanged 50 FPS minimum-window floor;
- a comparison package whose checks all pass, and the evidence mutation suite at
  66/66;
- the production delivery audit (`wi07-d05-delivery-audit.md`/`.json`);
- byte-identical preserved copies with SHA-256 hashes in
  `.agent-handoff/archive/wi07-d05-accepted-2d4f8f31/`.

Open gates and limits:

- the physical Windows 10 Chrome/Edge reference-device profile remains
  **pending**; every recorded performance fact is labelled non-reference local
  proxy evidence, so `MASTER-AC-015` is not satisfied for an external playtest or
  a minimum-system-requirement claim;
- the bounded `V02-DEC-036` split-gate exception applies to `V02-WI-07-D04`
  only and is not a general verification policy or precedent;
- the bounded local-only `V02-DEC-037` security exception (§17.4) applies to one
  named dev-only advisory only; the whole-tree `npm audit` command stays non-zero
  and is reported as such;
- the final-candidate residual-risk ledger is maintained in
  `verification/v02-wi-07-final-candidate-checklist.md`.

### 17.1 Historical first gate attempt (pre-refresh candidate `c61afb46`) — blocked at `npm audit`

The following commands were run once, in order, on that historical pre-refresh
candidate (`c61afb46`), which stopped at the first required failure; no command
was retried and no threshold was relaxed. This block is a dated historical record
of a resolved blocker, not current status.

```text
npm run format:check   pass   (pass after the reported documentation-format cause was fixed)
npm ci                 pass   (300 packages; optional fsevents install-script warnings only)
npm audit              FAIL   exit 1 — 2 newly published advisories in unchanged dev-only transitive
                              dependencies: brace-expansion 5.0.9 (high, via eslint@10.8.1 >
                              minimatch@10.2.6) and fast-uri 3.1.7 (moderate, via stylelint@17.14.1 >
                              table@6.9.0 > ajv@8.20.0); npm audit --omit=dev exits 0 with zero
                              runtime vulnerabilities and package.json is unchanged
npm run verify:all     not_run  (the sequence stopped at the first required failure)
final identity audit   not_run  (same stop; the accepted D05 archive integrity check had already passed
                                 as its own prerequisite step)
```

The `D06` cycle is therefore **blocked** and reported to the Product Owner with
the exact audit facts: the approved lockfile is unmodified (only the accepted
three-line `undici` entry differs from `HEAD`), no runtime dependency is
affected, and neither the reviewable documentation package nor any accepted
`D05` evidence was invalidated. Resolving the two dev-only advisories requires an
authorized dependency/lockfile decision that `D06` scope explicitly excludes; no
threshold, workload, sample or policy was changed here.

### 17.2 Product Owner authorization and authorized continuation

The blocked `D06` report was accepted by the Product Owner on 2026-10-01 with an
explicit authorization of the recommended solution: a bounded lockfile-only
refresh of exactly the two dev-only transitive toolchain dependencies named
above, with `package.json`, every direct pin, the Node/npm versions and the
runtime dependency set unchanged, and no `--force`, overrides or unrelated
package updates.

Delivered and verified before the authorized re-run: `brace-expansion`
`5.0.9 → 5.0.12` and `fast-uri` `3.1.7 → 3.1.8` are the only two changed lockfile
entries; `npm ci` installs both; `npm audit` and `npm audit --omit=dev` both
report **zero** vulnerabilities; the accepted `undici` `8.11.2` entry is
untouched. The accepted `D05` evidence archive and the documentation package in
§17 are unaffected.

### 17.3 Recorded `D06` final re-run results

The required `D06` gates were run on the byte-identical candidate after the
authorized refresh. No threshold, workload, sample window or method was relaxed:
the first attempt failed and was reported as a blocked gate with its exact facts,
the Product Owner then authorized exactly one re-run of that same candidate
inside a quiet-host window, and that run passed.

First attempt (`verify:all` started at a 15.36 one-minute host load): `format:check`,
`npm ci` and `npm audit` passed, and the development suite reported
`132 passed / 2 failed` — the two unchanged wall-clock input loops in
`e2e/combat-controls.spec.ts` (`:374`, `:570`) timed out. The failure was reported
to the Product Owner as a blocked gate with the exact facts, and a labelled single
diagnostic of exactly those two tests passed `2/2` at a 1-minute load of 4.85.

Product Owner authorization and final quiet-window run: the Product Owner
authorized one re-run of the unchanged candidate with `verify:all` started inside
a quiet-host window (1-minute load at or below 3.0, no other change). The
candidate fingerprint was identical (`31e86ec3`), the window was reached after
120 s (2.57, two consecutive samples at or below 3.0), and the gate run passed:

```text
npm run format:check   pass
npm ci                 pass    300 packages; optional fsevents install-script warnings only; 0 vulnerabilities
npm audit              pass    0 vulnerabilities (whole tree and runtime-only) on the refreshed lockfile
npm run verify:all     pass    exit 0: format/lint/typecheck, Vitest 97 files / 1106 tests, production build,
                               development 134 passed (6.5m), production 23 passed (16.4m)
final identity audit   pass    fingerprint 31e86ec3 unchanged, accepted D05 archive 30/30 OK, accepted D05
                               ownership intact in all six live records, comparison package still accepted
```

The quiet-window run's measured production facts: cold Boot response body
`2,240,465 B` (≤ 3 MiB), Operations interactive `148 ms`, runtime assets
`1,800,725 B` (≤ 2 MiB), enemy pack `221,772 B` (≤ 450,000); the D06-regenerated
ordinary regular Pass B record reported `58.5` FPS sustained and `53.6` FPS
minimum window, both above the unchanged 50 FPS floor, and it was preserved
separately as `wi07-d06-regenerated-regular-pass-b.json` rather than being mixed
with the accepted D05 chain.

Correction of record: the accepted `D05-C02` report states `1104` unit tests,
while the preserved `D05-C02` gate log reports `Tests 1106 passed`; `D06` records
the correct current value (`1106`) and no gate result changes. The archived
accepted evidence keeps its original text as history.

### 17.4 Local-only security status update — 2026-10-03 (dev-only `braces` advisory)

Recorded as part of correction `V02-WI-07-D06-C02` (the 2026-10-03 final-review
observation) on the same unchanged candidate and lockfile. No gate from
§§17.1–17.3 was re-run, because no product, test, build or dependency input
changed.

```text
npm audit              FAIL   exit 1 — braces@3.0.3 (high, GHSA-vfj7-8cjw-p6xm / CVE-2026-93687)
                              reached only through stylelint@17.14.1 > micromatch@4.0.8 > braces.
                              npm lists 7 affected entries (braces, micromatch, fast-glob, globby,
                              stylelint, stylelint-config-recommended, stylelint-config-standard)
                              for this one root advisory — not 7 independent root defects. Official
                              advisory: affected <= 3.0.3, patched versions: none (published
                              2026-09-18, reviewed 2026-10-02); registry latest braces is 3.0.3 and
                              the only offered fix is a breaking stylelint downgrade. Not marked as
                              passed, not suppressed, no threshold changed.
npm audit --omit=dev   pass   exit 0 — 0 runtime vulnerabilities; dev-only/runtime separation intact
lockfile and integrity pass   package-lock.json SHA-256 f3b4f2cd… unchanged; package.json untouched;
                              accepted D05 archive SHA-256 manifest 30/30 OK (0 FAILED)
```

The two dated facts stay separate. The **2026-10-01** whole-tree and runtime-only
zero-vulnerability result (§17.2) is the correct historical fact for the accepted
refresh; the **2026-10-03** non-zero result above dates a subsequently published
advisory on that same lockfile. Neither record rewrites the other and no line in
§§17.1–17.3 is altered.

The Product Owner's 2026-10-03 decision on this observation is recorded canonically
as `V02-DEC-037` in
`SHMUP_V0.2_TACTICAL_COMBAT_FOUNDATION_SPECIFICATION.md` §22.2: for local v0.2
candidate acceptance only, exactly this named advisory in this dev-only dependency
path is an accepted, owned exception. The command remains non-zero and must be
reported as such; the exception covers no other advisory, no runtime finding, no
failed test, no dependency, lockfile or pin change, no external playtest,
deployment or minimum-system-requirement claim, and the physical Windows 10
Chrome/Edge reference-device gate remains pending. This section records status and
authorizes nothing by itself.

### 17.5 Local v0.2 acceptance — 2026-10-05

The independent final review accepted `V02-WI-07` and the v0.2 Epic as a
**local-only candidate** (`.agent-handoff/evidence/wi07-final-independent-acceptance.json`).
The Product Owner explicitly accepted Shmup v0.2 as a locally complete version
on 2026-10-05 with the bounded `V02-DEC-037` exception and deferred physical
Windows 10 Chrome/Edge validation. This status does not turn the non-zero
whole-tree `npm audit` in §17.4 into a pass, does not change the dated gate
results in §§17.1–17.3, and does not certify the reference device. Physical
validation and reevaluation of the security exception remain required before
an external playtest or minimum-system-requirement claim. No deployment is
authorized by local acceptance.

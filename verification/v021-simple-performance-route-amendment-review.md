# V021-DEC-008 simplified performance route — independent amendment review

**Date:** 2026-10-15
**Reviewer:** Cline (implementation agent for `V021-PATCH-STAB-01-C02-SIMPLE`), acting as the independent amendment reviewer required by control delta item 1 and patch specification §7/V021-DEC-008.
**Verdict:** Accept the exact documentation amendment as reviewed.
**Findings:** Zero S0–S2. Three non-blocking S3 observations recorded below.

This verdict reviews a documentation amendment only. It is not source
implementation review, not the review of the later `evidence:patch-dense`
browser case or its raw sample, not security acceptance, and not v0.2.1 patch
acceptance. The reviewer authored none of the amended bytes.

## 1. Repository identity and preconditions

- Root: `/Users/maximvigilev/Shmup0.1-worktrees/v02-1`; origin `https://github.com/MaxVigil/Shmup0.1`; branch `feat/v02-1`.
- `HEAD` = `87842417305ddbc1cd63fc5ec2c5d023e2250556` = `origin/main` = active `control.json` `baseRevision`; runId `v021-patch-stab-01-c02-simple-8784241`, scope `V021-PATCH-STAB-01-C02-SIMPLE`, state `assigned`.
- Working-tree entries at review time: 82 (inherited WI-01–05 + C01 dirty tree, not the C02-only delta).
- Declared preflight gate ran first and passed: `npm run context:validate` → `Project context valid.` / `Active handoff: matches HEAD`. Raw record: `.agent-handoff/evidence/v021-patch-stab-01-c02-simple-gate-1-context-validate.txt`.
- No product source, test, dependency, save or gameplay byte was changed by this review; it added the preflight log and this verdict file only.

## 2. Exact material reviewed

Amendment note and its scoped diff:

- `.agent-handoff/evidence/v021-simple-performance-route-amendment.md`
- `.agent-handoff/evidence/v021-simple-performance-route-amendment.diff` (124 lines, 3 files, 7 hunks)

Amended canonical owners, at their current working-tree bytes:

- `Project Documentation/SHMUP_V0.2.1_COMBAT_PATCH_SPECIFICATION.md` — line 3 (status), line 337 (`V021-AC-006`), lines 387–397 (§7 item 8 pointer, `V021-DEC-008` decision text, and the revised `V021-PATCH-STAB-01` readiness).
- `Project Documentation/MVP_VERIFICATION_AND_QUALITY_GATES_v0.1.md` — lines 245–247 (§11 narrow local-patch exception and its supersession paragraph), line 672 (§18.1 WI-04 header pointer), line 704 (§18.1 step 5).
- `Project Documentation/MVP_TRACEABILITY_MATRIX_v0.1.md` — line 175 (integrated performance, cleanup and local human feel row).

Consistency references inspected for contradiction, not amendment membership:

- `AGENTS.md` §§0.1, 1, 9, 10; `Project Documentation/MVP_DEEPSEEK_GOVERNANCE_AND_SKILL_ROUTING_v0.1.md` §15.2 (protocol-v2 field rules already satisfied by the active control: `gatePlan` covers `requiredGates` exactly once, in order).
- `MVP_VERIFICATION_AND_QUALITY_GATES_v0.1.md` §11 items 1–5 (generic Epic representative-workload method), §18/§18.1 lanes and exclusions (lines 544–583, 660–716), §12/§14 security route (unchanged).
- `SHMUP_V0.2.1_COMBAT_PATCH_SPECIFICATION.md` §6 negative requirements and the preserved failed `@release-evidence` history (lines 345–351).
- Historical plan and evidence that the amendment supersedes: `.agent-handoff/evidence/v021-patch-stab-01-bounded-execution-plan.md` (C02 method now marked historical), `v021-patch-stab-01-c01-independent-acceptance.md`, `verification/v021-patch-route-amendment-acceptance.md`.

## 3. Scoped-diff verification (independent reconstruction)

The note claims the diff is exactly the amendment against the immediately
preceding working-tree bytes, and points to a persistent archive. Both were
checked independently rather than trusted:

1. Archive integrity: `/Users/maximvigilev/.codex/.chatgpt-projects/g-p-6a85d8f2e2e881919141c2086f987008/backups/shmup-v021-c02-before-simple-2026-10-15.tar.gz` exists and its SHA-256 is `41575df8337b565a35788d251edae179b85aaa985ac088c53fa35badf78e8541` — identical to the digest recorded in the amendment note.
2. Archive contents: extraction into a temporary directory yields exactly the 17 files the note declares (three pre-amendment documents, prior `control.json`, the unfinished C02 recorder `src/application/combat/evidence.ts` and its `patch-dense-sample.test.ts`, the C01 scenario test and its `combat-simulation.ts`/`collision.ts` owners, `entry.ts`, `package.json`, `playwright.config.ts`, `vite.config.ts`, `vitest.config.ts`, `scripts/evidence-source-fingerprint.mjs`, `AGENTS.md`, plan and C01 acceptance notes). No unrelated worktree content is claimed by it.
3. Diff reproduction: `diff -u` of the archived three documents against the current working-tree three documents produced 7 hunks at `@@ -1,6 +1,6 @@`, `@@ -334,7 +334,7 @@`, `@@ -384,10 +384,18 @@`, `@@ -242,38 +242,10 @@`, `@@ -697,7 +697,7 @@`-equivalent (`-697,7 +669,7`), `-729,14 +701,8`, `-172,7 +172,7` — the same hunk headers as the amendment diff, and after removing file headers/hunk headers the two bodies are byte-identical (108 non-blank body lines each). The amendment diff is therefore complete and exact for the three amended owners; no amendment content is hidden in the remaining ~19k inherited dirty-tree lines.
4. Amendment containment: the amendment touches only those three Markdown documents. It contains no product, test, script, config, manifest or gameplay change, matching its own claim that no product source was edited.
5. Post-archive drift: comparing the archive against the current tree, every archived file except `.agent-handoff/control.json` (87 changed diff lines — the new C02-SIMPLE assignment) and `.agent-handoff/evidence/v021-patch-stab-01-bounded-execution-plan.md` (4 changed lines — the historical-plan marker) is byte-identical. No unfinished C02 code changed after the archive was taken, so the archive is a faithful snapshot of the code this C02 must selectively retire from.

## 4. Review result — the four required checks

### 4.1 Is the ordinary-production Mission 01 spot check executable without a hidden application hook?

**Yes.** Every setup and measurement input named by `V021-DEC-008` exists in the
ordinary production artifact and is reachable through supported player input.
Code corroboration read at review time:

- Fixed setup anchor is exactly reproducible: Mission 01's authored final arrival is `190 s` (`src/application/mission/encounter-resolution.test.ts:42`, `finalArrivalTimeSeconds`), the countdown is `ceil(finalArrival − missionTime)` (`src/application/combat/combat-simulation.ts:637-641`), and the HUD renders it as `MM:SS` on the single canonical `.ds-combat-countdown` element (`src/combat-presentation/phaser/combat-scene.ts:1288-1290`, `src/combat-presentation/presentation-config/combat-config.ts:112-117`). Countdown `03:10` at start therefore reaches `02:58` at Mission Clock `00:12` — the amendment's "approximately Mission Clock `00:12`" is exact, not approximate.
- The first two authored formations begin at `4 s` and `10 s` (`src/content/missions/index.ts:505-506`), so both have begun before the `00:12` sample start, as the amendment states.
- Pointer placement at about `10% VW / 80% VH` is ordinary gameplay: the default persisted user setting is mouse movement (`src/domain/persistence/user-settings.ts:15`), the entry selects `initialMode: 'mouse'` from that snapshot (`src/combat-presentation/entry.ts:197`), `combat/pointer-move` inside the viewport sets the authoritative target (`src/application/combat/combat-simulation.ts:748-763`), and the Aircraft converges on that target at bounded speed (`stepMouse`, `src/application/combat/combat-simulation.ts:2079-2129`). `KeyF` (`toggle-mode`) remains available as supported input if a fresh context ever starts in keyboard mode.
- Continuous automatic fire needs no input: the player weapon is implemented as automatic firing with a step cadence (`src/application/combat/combat-simulation.ts:1495-1514`).
- Cleanup uses the ordinary Evacuation/Continue lifecycle that already exists in the production artifact (`e2e/production-smoke.spec.ts:223-289`), including the assertion that Continue returns to Operations without completion or unlock.
- The production artifact exposes no Debug capability: `debugMode` is the build-time `DEV_MODE` only (`src/ui/screens/combat-screen.tsx:140,246`) and `isDebugCommandEligible` requires `debugMode` true (`src/application/combat/debug-command.ts:95-105`); the compact smoke already asserts the Debug surface absence.
- The accepted C01 evidence machinery cannot leak into this sample: `__SHMUP_EVIDENCE_SCENARIOS__`/`__SHMUP_EVIDENCE_COUNTERS__` default to the constant `'false'` (`vite.config.ts` `define`), the `EVIDENCE_*` gates are compile-time constants (`src/application/combat/evidence.ts:36-64`), and both the counter branch and the dense owner-work framing are dead code in the ordinary build (`src/application/combat/combat-simulation.ts:834-860, 1317-1328`). The spot check therefore observes the same artifact a player receives.
- Frame measurement reuses existing logic: the production smoke already samples raw intervals, `sustainedFps` and `minimumSustainedWindowFps` over complete one-second buckets and asserts both `>= 50` (`e2e/production-smoke.spec.ts:1689-1709, 1815-1816, 1863-1864`).

No application bridge, Debug/god mode, accelerated warm-up, scenario hook or new
per-step telemetry is needed to execute the amendment's case.

### 4.2 Do the three substantive checks cover the intended local claim?

**Yes, for the reduced claim the amendment states.** `V021-DEC-008`, its `V021-AC-006` text, Verification §11's exception paragraph and §18.1 step 5 all describe the same three checks (`npm run verify`, the existing `npm run verify:smoke`, one six-second ordinary-production Mission 01 spot check at `1366×768`) and the same required record fields (identity, raw intervals, sustained and minimum one-second-window FPS with both `>= 50` floors, available frame-time distribution, page/console errors, start/middle/end screenshots with active Combat/HUD, post-Combat cleanup). The traceability row states the same replacement.

`verify` retains the deterministic mechanic, collision, attack, terminal and persistence regressions; the unchanged smoke route retains Boot, Mission Start, a real authored spawn, the short terminal/result/persistence paths, asset request/fallback boundaries and cleanup (Verification §18.1 items 3–4, untouched). The claim is explicitly bounded to one populated early-formation scene and explicitly disclaims worst-case/combined-Elite, no-regression, full-mission and physical-device certification, so the reduced evidence matches the reduced claim instead of overstating it.

### 4.3 Are the removed per-step/provenance/bucket requirements explicitly superseded everywhere?

**Yes.** Supersession is stated, not silent, in every amended owner:

- `SHMUP_V0.2.1` §6 `V021-AC-006`: "Exact per-step role/collision/Core/shatter proof and a separate feasibility/mutation package are withdrawn for local v0.2.1 acceptance only."
- `SHMUP_V0.2.1` §7 `V021-DEC-008`: "This prospectively supersedes only V021-DEC-006's formal combined-stress performance method, V021-AC-006's previous per-step workload requirements and the former C02 envelope", plus "There is **no requirement** to prove a selected workload bucket, every executed step's population or collision work, a 20-step six-Core overlap, individual Core provenance, or a lethal shatter in the timed window; there is no separate browser preflight or new mutation matrix."
- Verification §11: the former combined-stress bucket, per-executed-step work/provenance fields, mandatory six-Core/20-step overlap, in-bucket lethal shatter, separate feasibility preflight and new mutation package are "**superseded as local patch gates**", with their archived contracts, the accepted C01 foundation and the failed records explicitly keeping their historical meaning.
- Verification §18.1 step 5: "No separate preflight command, application recorder/bridge, chosen step bucket, owner-provenance proof, counter matrix, matched baseline or six-record chain is required."
- Traceability row: "V021-DEC-008 replaces the formal combined-stress gate".

A repo-wide search for the withdrawn vocabulary (`bucket`, `provenance`,
`six-record`, `per-step`, `20 consecutive`, `AC-006`) confirms that no other
canonical document still _requires_ a bucket, provenance, per-step telemetry,
browser census or separate preflight for this patch. The remaining hits are the
amendment's own supersession text, generic §11/§18 lane descriptions that apply
to other Epics, and historical/archived evidence records that must keep their
original meaning. The historical plan's C02 method is explicitly marked
superseded, and the active control replaces it.

### 4.4 Do failures, security, persistence, physical-device and final-acceptance protections survive?

**Yes.**

- Failure handling: "a failed or invalid sample is retained and blocks its gate" (`V021-AC-006`); "run once without retry-until-pass and retain a failed or invalid result"; "Preserve the single failed/invalid raw sample and stop; no retry-until-pass" (§11); an empty, paused or terminal scene must be reported invalid rather than re-timed. The amendment also removes convenience paths that could have manufactured a passing sample (no shortened clock, no forced result, no Debug).
- Existing budgets: frame-time, long-task and asset budgets remain binding (§11; `V021-AC-006`), and no accepted test is weakened to simulate a pass (§11).
- Security: Verification §18.1 items 1–2 are untouched — `npm ci`, `npm audit --omit=dev` with a blocking non-zero runtime result, and the non-zero whole-tree audit that must be reported failed/excepted. `V021-DEC-007` remains the separate, bounded dev-only `braces` exception; the new decision does not absorb or broaden it.
- Persistence and mechanics: the deterministic regressions and the smoke route's terminal/result/persistence paths remain mandatory, and the supersession paragraph states they "remain mandatory".
- Physical device: Verification §11's S14 paragraph and the closing sentence of `V021-DEC-008` keep physical Windows/browser validation separate; the spot check claims no physical-device certification.
- Final acceptance and external authority: "Current security disposition, final independent integration review, Product Owner patch acceptance and Git/external authority remain separate"; the status paragraph still reads "**The v0.2.1 patch is not accepted.**"; the historical failed `@release-evidence` attempts remain failed and in place.
- Governance: the amendment itself states that a different qualified reviewer must accept this exact documentation amendment before implementation under it — which this file is — and routes the final case and its raw result to independent review afterwards.

## 5. Findings

**S0–S2: none.** No contradiction was found between the amendment and its
scoped diff, the retained V021-DEC-006 protections, AGENTS/Governance rules, the
verification lanes, or the current application behaviour the setup depends on.

Non-blocking observations (S3), recorded for the implementation and the later
review of the case; none blocks proceeding and none authorizes editing the
amended contract:

1. **Long-task evidence is now implied rather than named.** The superseded
   paragraph listed `long tasks` among the recorded fields; the replacement text
   keeps "long-task ... budgets remain binding" without naming a long-task field,
   and the `V021-AC-006` / §18.1 step 5 record lists also omit it. The binding
   budget is unchanged, so the implementer should retain the existing long-task
   observation if the reused frame-measurement helper already supplies it, and
   must not build new telemetry to manufacture it. Recording "not measured" would
   also be truthful; the amendment does not require either.
2. **§11's generic items 1–5 stay generic.** The Epic-level representative
   workload list (approved mix, pre-change baseline, entity maxima, percentile
   frame time, cleanup, heap/GC) remains in §11 unqualified; its inapplicability
   to this patch rests on the exception paragraph, which explicitly states which
   former requirements are superseded and that the entity-maxima/census recording
   is gone. A reader must apply the exception, not items 1–5 literally, to this
   patch. Wording only; the exception is explicit and the operative `V021-AC-006`
   is unambiguous.
3. **"Not required" is not "must be deleted".** `V021-DEC-008` phrases the
   withdrawn machinery as "not required", while §11 says its accepted C01
   foundation keeps its historical meaning. The operative resolution is in the
   active control: preserve the accepted C01 code and every inherited WI-01–05
   change, retire only the unaccepted C02-only additions after a backup, and do
   not use any of it in the spot check. This verdict reads the amendment that way
   and flags it so that a later reader does not treat the accepted C01 checkpoint
   as withdrawn by `V021-DEC-008`. This observation is disclosed in the
   implementation evidence as well.

## 6. Commands run for this review

All were read-only or additive evidence commands; no expensive gate was run
before this verdict, per the control's ordering.

| Command / check                                                                              | Result                                                                                                                                                          |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run context:validate`                                                                   | Passed: `Project context valid.` / `Active handoff: matches HEAD`. Raw log: `.agent-handoff/evidence/v021-patch-stab-01-c02-simple-gate-1-context-validate.txt` |
| `shasum -a 256 <archive>`                                                                    | `41575df8…78e8541`, equal to the digest in the amendment note                                                                                                   |
| `tar -xzf <archive> -C <temp>` + file listing                                                | 17 files, matching the note's declared contents                                                                                                                 |
| `diff -u` archive-vs-current for the three amended documents                                 | 7 hunks, identical headers to the amendment diff; 108 identical non-blank body lines each                                                                       |
| Per-file `diff -q` archive-vs-current for the other 14 archived files                        | Only `control.json` and the plan note changed after the archive; no product source drift                                                                        |
| Targeted greps/reads of `src/`, `e2e/`, `scripts/`, `vite.config.ts`, `playwright.config.ts` | Basis for §4.1 and §4.4 corroboration                                                                                                                           |
| Repo-wide grep for the withdrawn dense vocabulary and `AC-006`                               | No remaining binding requirement outside the amendment and archived history                                                                                     |

## 7. Limits of this verdict

This verdict accepts only the exact V021-DEC-008 amendment reproduced by the
scoped diff in `.agent-handoff/evidence/v021-simple-performance-route-amendment.diff`
against the archived pre-amendment bytes. It accepts no implementation, no
timing number, no cleanup observation and no gameplay change; those remain
unverified until the thin case and its retained raw record exist and are
independently reviewed. It is not security acceptance, not dependency
acceptance, not patch integration acceptance, and not v0.2.1 patch acceptance.
It authorizes no commit, push, deployment or external test/release claim.

# Shmup v0.2 Development Retrospective

Date: 2026-10-05. Examined revision: `825a2f8b0ecfe1a79547479d85dd06b339507c5e`.

Status: retrospective findings and proposals, **not approved governance amendments or a v0.3 implementation assignment**. Existing rules remain in force until explicitly amended. Author: Codex, Principal Technical Product Manager and v0.2 acceptance reviewer; this is a self-critical process audit, not an independent audit of the author's performance.

## 1. Verdict

Follow-up decision, 2026-10-05: the Product Owner approved packages 1–3 as a
bounded experiment. Governance §15 (PROCESS-DEC-001) now owns its current
implementation/review/trial status; the recommendations below retain their
retrospective context and do not independently authorize later expansion.

v0.2 delivered valuable correctness and evidence. It also exposed an expensive delivery system: incomplete boundary contracts produced serial corrections; evidence tooling acquired its own defects; broadly coupled identities invalidated otherwise useful records; long, timing-sensitive browser gates ran on a shared desktop; and narrow technical repairs repeatedly returned to the Product Owner for authorization.

The answer is **not fewer correctness requirements, less independent review, or a different model by default**. The first investment should be a cheaper, more reliable verification path and clearer authority boundaries. A universal testing framework, wholesale documentation rewrite, or new agent orchestrator would add another system before proving its return.

The most important failure was not a lack of written rules. The MVP retrospective already identified excessive context, heavy production checks, and missing cost metrics. Current governance already requires proportional checks, consolidated findings, and root-cause review after two failed corrections of the same class. Execution did not consistently turn those rules into enforced workflow. More prose alone will not fix this.

Local v0.2 acceptance is unchanged. Physical Windows 10 Chrome/Edge validation and reevaluation of the bounded `V02-DEC-037` exception remain separate external-use conditions. This retrospective neither expands that exception nor certifies a reference device.

## 2. Evidence and limits

Repository identity was checked with `context:validate`: origin `https://github.com/MaxVigil/Shmup0.1`, worktree `/Users/maximvigilev/Shmup0.1-worktrees/v02-wi-07`, branch `feat/v02-wi-07`, revision above, no active handoff. Six existing untracked diagnostic scripts were preserved. Local `main` and the inspected `origin/main` remain at `b36bbdd`; no remote freshness claim is made by this retrospective.

Sources: current tracked code/configuration/docs; historical review and correction records in WI-02 through WI-07 worktrees; the final D06 log and acceptance checklist; the previous MVP process audit; and the Product Owner's relay history. Historical failures were inspected, not re-executed. The audit sampled causal chains, not every test or every conversation turn.

The companion [process metrics record](../verification/v02-process-metrics.md) distinguishes measurements from unavailable data. In particular:

- Final recorded D06 verification: 1,106 unit tests in 97 files; 134 development browser tests in 6.5 minutes; 23 production browser tests in 16.4 minutes. Browser portions alone total approximately **22.9 minutes**.
- The MVP audit recorded approximately 108 seconds for its entire final `verify:all`. Today's browser portions alone are about 12.7 times that historical total. Scope and workloads changed substantially: this is a latency comparison, **not** a same-workload regression or a monetary cost estimate.
- Before adding this retrospective, tracked canonical documentation comprised 21 Markdown files / 74,590 whitespace-delimited words; `AGENTS.md` added 4,584 words. The MVP audit recorded approximately 46,523 canonical words. Corpus size is not actual loaded context, tokens, or evidence of cache savings.
- No complete provider-usage, cost, actual-context, or Product Owner relay ledger was available. The tracked `verification/` directory contained a metrics template and the final candidate checklist, but no filled v0.2 process-metrics report before this audit. No credible percentage or dollar saving can be calculated retrospectively.

Evidence records under `.agent-handoff/` are local and ignored by Git. This report preserves the material findings and source locations, but those links alone are not a durable backup. Retention is an operational improvement, not a reason to regenerate historical evidence.

## 3. Where rework came from

| Observed chain                                                                                                                          | What was necessary                                                                                                   | Avoidable mechanism and prevention                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WI-02 C03–C07: session identity, campaign counter, cross-run collision, real legacy migration, full legacy validation, row provenance   | Protecting Credits, campaign state and stale callbacks was essential.                                                | Identity lifetime and replacement boundaries were discovered serially. Before implementation, enumerate same session / other tab / reload / New Game / invalid-save replacement and supported legacy formats. Review allocation, validation, migration and first post-upgrade write as one contract. [E2]                                        |
| WI-03 C01/C02: prose timing, encounter-wide delays, invented default regions, injected vs global catalogue                              | Precise authored content and deterministic interpretation were required.                                             | Implementation began before the data contract captured subject-specific timing and explicit unknowns. A typed example for every authored pattern and an unresolved-value check belong in readiness, before content expansion. [E3]                                                                                                               |
| WI-05 terminal recovery and Evacuation corrections                                                                                      | Save Error, Save Conflict, retry identity, hidden-window safety and exactly-once exit are genuine cross-owner risks. | Happy-path decomposition was insufficient. Define a transition/outcome matrix and one vertical failure path before propagating the interface through every layer. Reuse one availability selector instead of separately encoding UI/reducer rules. [E4]                                                                                          |
| WI-05 movement browser test: wall-clock sampling and independent medians                                                                | Browser input wiring must be verified.                                                                               | A fixed-step simulation with a catch-up cap cannot equate elapsed wall time with simulation time under contention. Sample correlated HUD displacement and authoritative Mission Clock, with a verified safe/rest position. Keep mathematical normalization at the deterministic owner. [E5]                                                      |
| WI-06 E04: six reproducible open-loop pilots failed before full Mission 03 completion                                                   | An authentic ordinary-production journey was needed for that claim.                                                  | Automation feasibility was discovered too late; other evidence was blocked behind an over-coupled route. Time-box the pilot feasibility spike and decide manual vs automated evidence early. Bot failure is not proof of a product defect, but lower-layer success and a written avoidance requirement do not prove product balance either. [E6] |
| WI-07 D04: prepared-image hit flash absent; fallback classifier mislabeled body pixels as Core                                          | Human review found a real player-visible bug despite many green tests.                                               | Tint flags did not prove pixels; CANVAS testing did not establish the AUTO/WebGL path. The capture classifier lacked negative examples. Validate renderer behavior and the classifier before asking the player to survive another five-minute route. [E7]                                                                                        |
| WI-07 D03: visibility listeners grew 1→5 over five missions                                                                             | The soak found a real framework-lifecycle leak.                                                                      | Keep this test, but run repeated mount/dispose ownership checks early after framework integration. Canvas disappearance and a flat-enough heap are not proof that listeners or callbacks were released. [E8]                                                                                                                                     |
| WI-04/WI-05/WI-06 evidence corrections: wrong workloads, trusted summaries, missing raw-only counter-cases                              | Evidence integrity matters; passing FPS for the wrong scenario proves little.                                        | Define the record schema, raw observations and deliberately invalid fixtures before measurement. Validate raw-to-summary consistency at the evidence owner, not after expensive samples. [E4, E9]                                                                                                                                                |
| WI-07 D05 C01: missing shared helper in historical base copy, discovered after a 23-minute browser portion and additional evidence runs | The historical comparison needed the identical harness.                                                              | A build/import/discovery preflight was missing. The original command order also conflicted with the legacy runner's embedded comparison dependencies. Validate the execution graph before freezing a candidate. C02's preflight is an existing asset to reuse. [E10]                                                                             |
| WI-07 D06: new dev-tool advisories, identity explanations, historical/current status corrections                                        | Security facts and exceptions had to remain truthful.                                                                | Mutable external security status, implementation identity and repeated prose status were coupled. Date security observations; use one current-status owner and reference historical runs rather than rewriting several narratives. [E11]                                                                                                         |

These categories overlap. The evidence does not support assigning a percentage of all rework to DeepSeek, specifications, the reviewer, or the host.

## 4. What to preserve

- Deterministic domain/simulation, typed ports, one authoritative session owner, atomic campaign operations and explicit terminal outcomes. They made lower-layer reproduction possible.
- Independent review and focused broken-implementation counter-tests. Save integrity, callback cleanup and actual rendered feedback justified their cost.
- Genuine production journeys for integration claims; explicit separation of development, instrumented evidence, uninstrumented scenario builds and ordinary production.
- Raw failed samples, immutable historical identity, unchanged budgets, and honest `not_run` / `blocked` states. Do not restore retry-until-green behavior.
- Human playtesting. It found a meaningful renderer defect that automated flag assertions missed. It should inspect gameplay and appearance, not compensate repeatedly for a broken capture tool.
- Explicit local-only acceptance and bounded exceptions. Green proxy results must not become unsupported hardware or external-release claims.

## 5. Reviewer and planning responsibility

Codex's responsibility was not merely to find the next defect. It was to make the entire delivery loop efficient while protecting the contract. Four changes are needed in my own approach:

1. **Review the risk family before the next full run.** C03 identity was improved inside the campaign, but the next review still had to discover campaign replacement. Migration reviews then uncovered fixture validity, cross-field validity and provenance one at a time. A boundary matrix should have driven one consolidated review, rather than following only the most recent patch.
2. **Validate the handoff itself.** An impossible evidence order and an expensive sequence without import/discovery preflight are reviewer/planning defects. More obedience by the implementation agent would not solve them.
3. **Do not ask the Product Owner to operate the test machinery.** Product changes, risk exceptions, destructive actions and external actions need authority. Copying an already-approved helper, repairing an in-scope test, or scheduling a pre-authorized diagnostic should not each require a new product decision. Current envelopes sometimes narrowed execution more than the standing process intended.
4. **Distinguish observation, inference and proof.** Mixed passing tests across attempts do not constitute one passing required sequence. High load suggests contention but does not prove the product or test innocent. A “fresh review” label is not evidence of a fresh reviewer context. The available records do not establish that context separation for every final review.

The author and reviewer should derive a small set of independent failure hypotheses before sharing test rationale. For Epic-final acceptance, use a fresh reviewer context and a bounded evidence packet. Independence means a distinct review judgment, not automatically a second paid model for every edit.

## 6. Changes to the coding approach

### 6.0 Plan playable increments by risk, not by version label

v0.2 combined persistent campaign state, progression, new enemy behaviors, terminal transactions, Evacuation, Elite, Debug and evidence infrastructure. Seven top-level Work Items did not mean seven small reviewable changes. For the next version, first map the risk/dependency graph, then deliver small end-to-end player outcomes. Prove one representative content consumer and its failure path before multiplying content. Assign temporary compatibility seams an owner and a concrete removal checkpoint. Separate tuning/art polish from correctness when their contracts do not require joint acceptance. This does not mean splitting a transaction across unsafe intermediate releases or moving unfinished requirements into an unnamed later version.

### 6.1 Design lifetime and invariants before interfaces spread

For persistence/lifecycle changes, write one compact table: state + event + guard + durable write + visible outcome + forbidden side effect. Include rejected promise, duplicate command, stale attempt, concurrent instance, replacement, visibility loss and disposal where relevant. State which identifier survives which boundary.

Tests should use real supported historical fixtures, including distinctive Settings values, missing fields and corrupt cross-field combinations. Assert the first real post-migration operation, not merely a new store's existence. Decide which pre-release save formats must be supported before implementation; do not silently drop existing compatibility or assume every future experimental shape is permanent.

### 6.2 Test observable behavior at the lowest sufficient layer

- Arithmetic, priorities, step boundaries, stale identities and transition sequences: pure/domain/application tests.
- Real transaction behavior: persistence-adapter integration tests against representative stored rows.
- DOM availability, copy, focus and keyboard behavior: DOM tests plus a thin browser wiring check.
- Framework callbacks, textures and disposal: real framework-owner tests, including retained source objects and late completion.
- Renderer output: small deterministic images/frames through each supported renderer path. A flag set on an object is not a rendered white flash.
- A few natural-clock ordinary-production journeys: integration/release evidence, not the default way to re-prove every invariant.

Scenario tests must remain explicitly labelled; they cannot replace an authentic production journey or bypass its claim. Development observability should be available when its first consumer needs it, rather than arriving as an end-of-version rescue. Production artifact exclusion remains tested.

### 6.3 Reuse narrowly; do not build a universal framework

Extract existing fixtures for committed/inert/failed/rejected persistence outcomes and stale callbacks when several tests actually share them. Keep dependency injection through current ports. Pilot state-sequence/model-based tests on one risky lifecycle only if deterministic tables leave recurrent gaps. Use targeted counter-tests for high-consequence invariants, not repository-wide mutation-score targets.

Current size indicators: `combat-simulation.ts` 2,671 lines, `production-smoke.spec.ts` 2,800, manual review runner 1,589, comparator 1,537, catalogue validator 1,261. Size is not itself a defect. These files combine several change reasons and deserve owner-based navigation and decomposition when touched. Start with gate/evidence orchestration; **do not rewrite the simulation or introduce a generic ECS/state-machine system for a line-count goal**. Preserve one authoritative tick order and state owner if extracting pure helpers.

## 7. Operational design proposed for the next iterations

### 7.1 Verification lanes with explicit claims

| Lane                       | Trigger                                                                | What it proves                                                                                                            |
| -------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Readiness/preflight        | Before an expensive run                                                | Identity, dependencies/order, import/build/discovery, schema fixtures, writable run directory and viable host conditions. |
| Change-linked verification | During a bounded correction and before review                          | Focused counter-tests, affected integration/browser/render checks, formatting/types as relevant.                          |
| Integration gate           | A frozen integrated candidate or an affected cross-system risk         | Full behavioral regression and production boundaries.                                                                     |
| Release evidence           | Approved milestone, performance-risk change or changed evidence method | Authentic journeys, soak, visual acceptance and controlled benchmark chain.                                               |

This is a proposed routing change, not permission to skip currently required gates. Keep all existing requirements mapped to a lane and named trigger. A focused green run never silently substitutes for a required integrated run. Measure the lanes before setting runtime budgets; a new command name alone is not an optimization.

Preflight should expose the dependency graph: record producers before comparisons, shared imports before historical builds, classifier counter-cases before manual play, cheap security/dependency checks before waiting for a quiet benchmark window. Do not execute the same unaffected suite twice because both a checkpoint list and its aggregate command contain it.

### 7.2 Controlled timing and an honest rerun policy

Separate correctness assertions based on simulation time from real-time performance measurements. Use a reserved measurement window or controlled runner, fixed workload/build/environment metadata, and no competing heavy suite. A single load-average number is not enough to certify conditions.

Proposed bounded authority: after a failure, preserve the first record, classify it, and allow one diagnostic/requalification attempt only when the assignment pre-authorizes it and an environmental change or concrete hypothesis is recorded. A deterministic assertion failure goes to repair; a valid below-budget sample remains a failure/observation even if a later run passes. Repeated failure of the same class triggers diagnosis, not more attempts. No automatic retry-until-pass, sample selection, threshold relaxation, or hidden averaging.

### 7.3 Immutable evidence, separate identities

Today `verify:all` writes fixed evidence filenames; D06 had to archive regenerated files and restore the accepted D05 set byte-identically. The fingerprint includes `.agent-handoff/control.json` plus all `src` and `e2e` files. Even an envelope change can change evidence identity; documentation corrections needed historical-control substitution to explain equivalence.

Proposed next design:

- Write every attempt to a unique run directory; accepted evidence is immutable. Promotion updates a manifest/pointer, not the raw record. A failed run never overwrites an accepted one.
- Record separately: product/build identity, lockfile/toolchain identity, harness/method identity, scenario identity, environment, run ID, and review/authorization identity. Keep their relationship explicit.
- Use content-addressed hashes for retained artifacts. Reuse a result only when every input relevant to its claim is demonstrably unchanged and the routing rule permits it. Unknown dependency means rerun, not optimistic reuse.
- Preserve present v0.2 identities and raw archives as history. Introduce a future evidence schema deliberately; do not relabel old records or weaken current comparator checks.
- Keep compact manifests and acceptance decisions durably versioned; large screenshots/logs can live in a backed-up artifact store with retention rules. Gitignored files on one laptop are not sufficient long-term provenance.

### 7.4 Fewer relay approvals, not broader implied authority

An approved bounded assignment should authorize the implementer to repair its named owners and direct regressions through self-review without reopening the same product decision. State what requires escalation: changed player behavior, architecture/persistence contract, new dependency authority, expanded owner surface, destructive operation, external action, or risk waiver. Keep corrections in the same task unless hypotheses/context are obsolete.

After the second failed correction of the **same class**, the reviewer records a short root-cause finding and changes one of contract, decomposition, test method or owner design before reassigning. This rule already exists; record its trigger rather than writing it again. Cosmetic preference is not a correction cycle. Narrow technical defects still require independent review, but need not each become a new Product Owner decision.

A bounded future dev-only patch policy could remove repeated approval churn, with unchanged direct pins/runtime set, compatible range, inspected lockfile diff, audit/license/engine checks and risk-linked verification. It requires explicit approval; new runtime risk, breaking updates and waivers remain separate decisions. Dev-only does not mean harmless: build-time exposure and inputs still require assessment. Date audit findings; they are external-state observations, not permanent properties of a source hash.

### 7.5 One current status and a clear integration destination

Keep current acceptance/exception/evidence pointers in one existing execution-registry owner; other documents link to it. Technical docs describe contracts, dated evidence records describe runs. Avoid duplicating “current audit clean” or “awaiting review” across several narratives. Clarify MVP-only restrictions and v0.2 supersession where routed instructions can be misread; do not mechanically delete historical contracts.

Before v0.3 implementation, explicitly choose its accepted base and integration branch. The delivered v0.2 branch is 22 commits ahead of the inspected `origin/main`, which still represents WI-02; opening the main checkout does not show the completed version. This is a navigation/integration risk, not proof of lost work. Decide merge/tag/retention separately, back up ignored evidence, then retire worktrees only with explicit permission. Do not start another chained feature branch by habit.

## 8. Reassessment of the six original hypotheses

| Initial hypothesis                   | Verdict now                                                                                                                          | Smallest justified action                                                                                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Simplify canonical documents         | **Keep, narrow.** Growth and status contradictions are real; merging everything into three large files does not prove lower context. | One current-status owner, explicit supersession, section routing and actual loaded-byte measurement. No wholesale rewrite.                                                                                         |
| Machine-checked Definition of Ready  | **Keep, bounded.** The existing validator proves protocol shape, not semantic completeness or executable gate order.                 | Extend existing tooling with references/dependency/preflight checks; reviewer signs behavior, failure modes, numeric gaps and evidence feasibility. Never label a merely schema-valid envelope semantically ready. |
| Explicit state-transition tables     | **Keep, high priority for risky changes.** Identity/retry/latch cases support it.                                                    | A small table at the canonical owner before changing a cross-system state contract; tests reference its cases. Not a table for every visual detail.                                                                |
| Reusable fault-injection mechanism   | **Narrow/defer the framework.** There are repeated cases, but also existing ports and fixtures.                                      | Reuse a small outcome/callback fixture at the next real consumer. No new dependency, global switch or permanent production hook.                                                                                   |
| Standard visual/performance evidence | **Highest priority, reuse what exists.** It repeatedly generated rework of its own.                                                  | Schema-first negative fixtures, preflight, immutable run outputs, renderer checks, and an explicit natural-journey vs scenario boundary. Do not build a second harness.                                            |
| Stop after two correction cycles     | **Keep; already policy.** The missing piece is execution and cause tracking.                                                         | Automated/recorded same-class trigger plus a changed diagnosis or plan, not simply C03 with a longer prompt.                                                                                                       |

The original list underweighted **verification latency, evidence-storage/identity coupling, Product Owner relay load, and missing cost measurement**. Those move ahead of generalized testing infrastructure.

## 9. Recommended bounded experiment before and during v0.3

Do not implement all proposals as a new process Epic. Approve a small package with three separately reviewable outputs, then evaluate it on the first two suitable v0.3 Work Items.

| Order / accountable owner                         | Proposed output                                                                                                                                                                                  | Acceptance of the process change                                                                                                                                                                            | Effort / expected return                                                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — reviewer/TPM                                  | A short amendment using existing Governance/Verification owners: lane routing, repair/escalation authority, same-class correction trigger, one current-status owner; baseline/retention decision | Every existing gate claim has a trigger; no hidden waiver; mechanical vs product decisions are unambiguous; exact v0.3 base recorded.                                                                       | Small documentation scope; high expected reduction in relay and contradictory status, unmeasured.                                               |
| 2 — tooling implementer + separate reviewer       | Reuse the existing preflight and handoff tooling; separate expensive measurement invocation from ordinary checks under the approved routing; give new evidence attempts isolated output paths    | Missing base helper/import fails before measurement; producer order is validated; malformed raw evidence is rejected; a failed new run cannot alter the accepted set; independent counter-tests cover each. | Medium bounded tooling scope; highest evidence-backed latency opportunity. Do not combine with gameplay work or wholesale fingerprint redesign. |
| 3 — implementer/reviewer at the next high-risk WI | One boundary/transition table, real compatibility fixtures, a consolidated review and a filled metrics record                                                                                    | All relevant replacement/retry/stale/disposal cases are assigned to owners; unknown behavior resolved before dependent code; actual usage recorded where available.                                         | Small recurring cost; prevents high-consequence rediscovery.                                                                                    |

Separate artifact/harness identities can follow only if isolated run outputs and routing still leave demonstrated invalidation waste. A shared fault fixture follows an actual repeated consumer. Model-based tests, global mutation infrastructure, large source refactors and agent orchestration are not prerequisites for planning the next product version.

### Evaluate the experiment, not the ambition

Collect automatically where feasible: actual provider token/cache/cost data; first-pass acceptance; correction count **by root-cause class**; full-gate invocations and machine minutes; time blocked on environment vs product decisions; Product Owner technical-relay messages; context bytes actually loaded; escaped defects at review and human playtest. Record unavailable values explicitly.

For the two trial WIs, record approximate risk/size so results are not compared blindly. Success means:

- no return of the same diagnosed failure class after the root-cause checkpoint;
- no accepted evidence overwritten and no full benchmark chain triggered solely by an authorization-text edit;
- no Product Owner decision needed for a repair explicitly inside the approved budget;
- lower repeated verification/relay effort without removing required claims or increasing escaped correctness/visual defects.

Two WIs are a pilot, not statistical proof. Review the trend after the third accepted post-MVP scope as current governance requires. If a change adds maintenance or context without measurable benefit, stop expanding it. Do not promise a percentage saving before collecting a comparable baseline.

## 10. Outstanding decisions and non-goals

Approval is still needed for the bounded process package and its exact routing/authority changes. Before v0.3 implementation, also decide the integration destination and supported-save policy for any planned persistence changes. Physical-device validation and the existing security exception retain their current owners and triggers; neither is silently assigned to v0.3.

This audit does not authorize a merge, tag, commit, push, deployment, worktree deletion, dependency update, new coding-agent handoff, or changes to product/test behavior. No new runtime defect is claimed solely from file size, corpus size, host load, or missing metrics. No new model purchase, parallel-agent rollout or replacement of DeepSeek is justified by the available cost data.

## 11. Evidence index

`E/` below means `.agent-handoff/evidence/` in the named worktree. These are historical local records; statements about them are not claims that their original gates were rerun for this audit.

| ID  | Source and reproducible observation                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E1  | `Project Documentation/MVP_DEVELOPMENT_PROCESS_AUDIT_v1.0.md` §§3, 5–7, 9–10; `AGENTS.md` §§7–10; Verification §15; `verification/process-metrics-template.md`. Prior recommendations and actual standing rules.                                                                           |
| E2  | WI-02 `E/v02-wi-02-correction-c03-evidence.md` through `c07-evidence.md`, especially each root-cause section. Reset identity, invented migration fixture, incomplete validation and row-provenance chain.                                                                                  |
| E3  | WI-03 `.agent-handoff/control.json` / `result.json`, run `v02-wi-03-c02-b36bbdd`; current content/encounter contracts and the relayed C01/C02 summaries.                                                                                                                                   |
| E4  | WI-05 `E/evacuation-execution-plan.md`, `E/evacuation-e02-c04-review-findings.md`; retained-image callback leak and summary-vs-raw evidence defects. Also current `src/application/combat/lifecycle.ts` and the relayed E03-C01 availability correction.                                   |
| E5  | WI-05 `E/mission-02-r01-c02-review-findings.md`; correlated movement sample repair and unchanged thresholds.                                                                                                                                                                               |
| E6  | WI-06 `E/wi06-e04-blocker.md`; six offline pilot attempts, no completed ordinary-production route, other evidence left blocked.                                                                                                                                                            |
| E7  | WI-07 `E/wi07-d04-c02-review-findings.md`; multiply-tint/renderer mismatch, false-positive Core classification, transition pairing and retained footage.                                                                                                                                   |
| E8  | WI-07 `E/wi07-d03-cleanup-evidence.md`; observed listener growth, per-resource proof/inference matrix; current `src/combat-presentation/phaser/combat-game.ts` and its regression suite.                                                                                                   |
| E9  | Current `scripts/compare-performance-evidence.mjs`, `scripts/evidence-integrity.mutation.test.mjs`, `scripts/evidence-source-fingerprint.mjs`, `e2e/production-smoke.spec.ts`, `playwright.config.ts`; raw writes, broad fingerprint inputs and timing-sensitive serialized browser suite. |
| E10 | WI-07 `E/wi07-d05-c01-legacy-base-copy-blocker.md`; current `scripts/run-legacy-proxy.mjs` and direct tests; C02 acceptance/checklist records.                                                                                                                                             |
| E11 | WI-07 `E/wi07-d06-gates-blocker.md`, `E/wi07-d06-logs/07b-verify-all-quiet.log`; Verification §17; `verification/v02-wi-07-final-candidate-checklist.md` provenance and R8/R9.                                                                                                             |
| E12 | WI-07 `E/wi07-d02a-gate-environment-findings.md`; inconsistent failure sets, pool startup/timeouts and host context. Its “candidate itself is green” wording exceeds what piecemeal passing attempts alone prove.                                                                          |
| E13 | Read-only `git ls-files`, whitespace/line counts, JSON envelope inventory across WI-01–07, `git worktree list`, `git log origin/main..HEAD`; method and limitations in the companion metrics record.                                                                                       |

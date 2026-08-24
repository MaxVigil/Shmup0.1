# Shmup MVP — Agent Governance

These rules apply to DeepSeek, Cline, Codex, and any other implementation agent working in this repository.

## 1. Authority

The canonical documentation is `Project Documentation/`.

Apply sources in this order:

1. latest explicit Product Owner decision recorded in canonical documentation;
2. `MVP_MASTER_DESIGN_DOCUMENT_v0.1.md`;
3. the relevant product specification;
4. `MVP_NARRATIVE_RULES_v1.0.md` for content and world constraints;
5. `MVP_DESIGN_SYSTEM_SPEC_v0.1.md` for UI;
6. `MVP_TECHNICAL_FOUNDATION_v0.1.md`;
7. `MVP_REPOSITORY_ARCHITECTURE_v0.1.md`;
8. `MVP_CODE_PRINCIPLES_v0.1.md`;
9. `MVP_VERIFICATION_AND_QUALITY_GATES_v0.1.md`;
10. `MVP_IMPLEMENTATION_SLICES_v0.1.md` for implementation sequencing and assigned-slice boundaries;
11. this file;
12. project-specific skills;
13. approved generic skills as non-authoritative technique references;
14. agent assumptions, which never create requirements.

If sources conflict, stop the affected work and report the exact conflict. Do not choose a convenient interpretation.

## 2. Required reading before work

Reading is revision-aware and section-routed. In a new dialogue, read completely:

1. this file;
2. the active `.agent-handoff/control.json`, when present;
3. the selected project skill's `SKILL.md`.

Then read the exact canonical sections named by the assignment and the minimum owner sections below. A section means its heading and all content until the next heading of the same or higher level. Do not substitute an agent summary for a canonical section.

| Change owner                                          | Minimum canonical context                                                                                                                                                                                                                 |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Combat simulation, enemies, weapons, collision        | affected `MVP_COMBAT_SPEC_v0.1.md` sections and AC; Repository Architecture §§5.1–5.3, 8.2, 12, 14–16; Code Principles §§5–6, 9, 11–15, 17, 19–21 as applicable; Verification §§5–11, 14 as applicable                                    |
| Combat presentation, Phaser, HUD                      | affected Combat sections and AC; Repository Architecture §§5.5, 9, 11–12, 14–16; Code Principles §§9–11, 15, 17, 19–21; affected Design System sections for player-visible UI; Verification §§5–11, 14                                    |
| Content definitions or validation                     | affected product sections and AC; Repository Architecture §§5.1–5.3, 11–12, 14–16; Code Principles §§3–6, 12–15, 17, 19–21; Verification §§5–8, 11, 14                                                                                    |
| Base UI or pre-Combat                                 | affected `MVP_BASE_AND_PRECOMBAT_SPEC_v0.1.md` sections and AC; affected Design System component/token/focus sections; Repository Architecture §§5.3–5.4, 8, 12, 14–16; Code Principles §§9–10, 12–15, 17, 19–21; Verification §§5–10, 14 |
| Cross-system state, Boot, mission boundary, lifecycle | affected Master and Base/Combat transition sections and AC; Repository Architecture §§5–10, 14–16 as applicable; Code Principles §§5–10, 13–15, 17, 19–21; Verification §§5–11, 14                                                        |
| Build, assets, dependencies, release                  | affected Delivery sections and AC; Repository Architecture §§4, 9, 11, 15–16; Code Principles §§9, 15–19, 21; Verification §§2–14 as applicable                                                                                           |
| Governance or process only                            | this file; affected Governance, Code Principles, Verification, Repository Architecture, or Process Audit sections only                                                                                                                    |

Additional routing rules:

- read the complete Glossary only when terminology is added, removed, renamed, or uncertain; otherwise read the affected entries;
- read Narrative Rules only for copy, localization, people, factions, countries, technologies, narrative content, or narrative-dependent assets;
- read the Traceability Matrix only when selecting, changing, or reporting AC coverage;
- read the Implementation Slices document only for legacy `S01`–`S14` work;
- read the Master document only for product boundary, Boot, shared state, lifecycle, end-to-end, or whole-application performance work;
- read supporting skill references only when a concrete technique requires them.

Escalation rule: if the proposed diff touches an owner, import boundary, product term, or AC outside the loaded route, stop editing and load that owner's relevant canonical sections first. A cross-system change may require several routes. Full-document reading remains required only when a conflict cannot be resolved from routed sections or when the assignment explicitly requests a complete audit.

In the same dialogue, unchanged sections already read need not be reread after checking the repository revision. Always reread the active assignment, changed canonical sections, and sections whose owner enters the diff.

## 3. Work authorization

- Implement only the explicitly assigned scope.
- The completed MVP has exactly fourteen canonical Slices, `S01`–`S14`. A legacy `Sxx-WIyy` Work Item is an execution unit inside its parent Slice and never an additional or complete Slice.
- Post-MVP work uses one approved Epic scope plus bounded Work Items or corrections inside that Epic. A Work Item never becomes an additional Epic.
- Do not mark a parent Slice or Epic complete after one Work Item. Acceptance requires all applicable source AC, technical criteria, gates, and manual evidence.
- An approved MVP document does not authorize implementing every feature in it.
- Do not add adjacent mechanics, polish, assets, settings, persistence, audio, analytics, backend, deployment, or future architecture without explicit scope.
- Do not infer product behaviour from a skill, tutorial, previous prototype, or framework convention.
- Missing or conflicting S0–S2 product behaviour makes the affected task `NOT READY FOR IMPLEMENTATION`.
- Independent unaffected work may continue only when the boundary is explicit and creates no hidden rework.

## 4. Non-negotiable architecture

- Domain is deterministic TypeScript and does not import Phaser, React, DOM, CSS, storage, network, wall-clock, or unseeded randomness APIs.
- Shared Session State has one application-owned store and named mutations.
- Combat uses application-owned `CombatSimulationState`, fixed `1/60 s` steps, deterministic AABB, and no Phaser physics plugin.
- Phaser is a lazy-loaded Combat renderer/input adapter, not gameplay authority.
- React owns Screens, Overlays, Settings, and HUD composition, not Combat simulation.
- Per-frame Hull Bar positioning uses only the isolated `CombatHudBridge`.
- No second store, global event bus, Phaser Registry state authority, React gameplay state, or parallel source of truth.
- Do not statically import Phaser into Boot or Base.
- `assets/source/` is never imported or shipped.
- No `memory-bank/` or duplicated agent-maintained requirements summary.

## 5. Skill routing

Project-specific skills have priority over generic skills.

| Task                                                                       | Mandatory project skill    | Optional audited reference skills                              |
| -------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------- |
| Domain, Content, Boot, Shared Session State, mission boundary, integration | `shmup-mvp-cross-system`   | `performance-optimization` when measured work applies          |
| Combat rules, simulation, weapons, enemies, collision, mission resolution  | `shmup-mvp-combat`         | `performance-optimization`; restricted `physics-tuning`        |
| Phaser lifecycle, rendering, assets, Combat presentation                   | `shmup-mvp-combat`         | restricted `phaser-core`; allowlisted Phaser package API skill |
| Operations, Hangar, Repair, weapon selection, Base navigation              | `shmup-mvp-base-precombat` | restricted `game-ui-ux`                                        |
| Input routing or controls                                                  | relevant project skill     | restricted `input-systems`                                     |
| HUD, Screen, Overlay, focus, responsive UI                                 | relevant project skill     | restricted `game-ui-ux`                                        |
| Measured performance work                                                  | relevant project skill     | `performance-optimization`                                     |
| Approved hit/destruction/UI feedback only                                  | relevant project skill     | restricted `game-feel`                                         |
| Asset creation or transformation explicitly requested by Product Owner     | relevant project skill     | restricted `create-game-assets`                                |

Build-Tooling-only work uses no gameplay skill; follow this file and the canonical technical documents.

Do not use the generic `router` in this repository. Engine and routing are already fixed here.

Do not use old `shmup v0.2` or `strategic-base-management v0.2`; both contain future-game scope and conflicting technical advice. Use the project skills under `.cline/skills/`.

Never use `phaser-arcade-physics`, Phaser package `physics-arcade`, or `physics-matter`.

The complete audit and restrictions are in `MVP_DEEPSEEK_GOVERNANCE_AND_SKILL_ROUTING_v0.1.md`.

## 6. Skill conflict rule

A skill is advisory. It may explain a technique or API but cannot override project documentation.

Ignore skill guidance that introduces or assumes:

- enemy firing in MVP;
- Arcade/Matter Physics;
- Phaser-owned state or Phaser Registry as Session State;
- Phaser Scenes for Base Screens;
- variable-delta authoritative movement;
- mobile, touch, gamepad, rebinding, localization, or safe-area scope;
- audio, screen shake, hit-stop, knockback, particles, damage numbers, or additional feedback not specified;
- save/load or persistence;
- research, manufacturing, buildings, personnel systems, alien technology, extraction, campaign progression, or additional currencies;
- publishing, hosting, backend, analytics, or live operations.

Report the conflict if following the skill would materially change the assigned result.

## 7. Work cycle

Before editing:

1. inspect repository status and preserve unrelated work;
2. read the required sources and selected skill;
3. resolve the assigned Slice, Epic, or Work Item against its canonical contract;
4. verify its dependencies, exact in-scope outcome, AC/TC, negative requirements, gates, and evidence;
5. report only a material blocker before creating dependent code.

Do not send a planning summary, restate canonical requirements, or request confirmation for an implementation choice that is already within agent authority.

During implementation:

- keep changes small and uniquely scoped;
- add behaviour at its canonical owner;
- add tests at the lowest reliable layer;
- keep setup and cleanup together;
- check performance when adding a per-frame or player-visible system;
- do not rewrite canonical documentation unless the approved contract itself changed.

For a correction Work Item, treat the assignment as a repair budget:

- preserve every valid part of the parent Slice;
- modify only the named canonical owners and their direct regressions;
- do not perform incidental refactoring, rewrite the subsystem, or introduce a generalized framework;
- if the correction requires additional production owners or a materially larger design surface, stop and report the expansion instead of silently broadening the diff.

For a Slice or Epic executed through multiple Work Items:

- plan and complete the Work Items sequentially inside the same assigned Slice;
- do not request relay, acceptance, or commit after each Work Item unless the handoff declares a mandatory checkpoint;
- run narrow tests while working and the Slice-level gates once after integration;
- stop and report only when an S0–S2 blocker prevents safe continuation;
- never continue into the next Slice or Epic.

After implementation:

1. run the required gates from the Verification specification;
2. inspect the diff for scope creep and boundary violations;
3. perform a self-review against every assigned AC/TC and negative requirement;
4. correct self-discovered in-scope defects before reporting;
5. write the required scope report using section 13; when filesystem handoff is active, `result.json` is that report and the user-facing message remains the single line required by section 8.1;
6. do not describe unrun checks as passing;
7. set the result to `Awaiting Acceptance Review`, never `Accepted`.

## 8. Communication and relay efficiency

The Product Owner is a non-technical relay between the implementation agent and the independent acceptance reviewer. Do not require the Product Owner to inspect code, compare technical alternatives, rewrite instructions, or determine whether evidence is sufficient.

- Treat canonical repository documents as already available; task messages reference them and include only scope-specific delta, risks, and explicit overrides.
- Do not repeat reading lists, global architecture rules, standard negative scope, verification rules, reporting rules, or commit rules in every handoff.
- Do not ask about helper names, file-local decomposition, equivalent test techniques, or other reversible choices within the approved architecture.
- If several material blockers exist, return them in one report rather than one message per question.
- A blocker report must explain the observable impact, provide a recommendation, and end with one copyable `RELAY TO ACCEPTANCE REVIEWER` block. Do not ask the Product Owner to choose a technical implementation.
- A completion report must be copyable unchanged to the acceptance reviewer and contain no request for the Product Owner to interpret test output.
- Do not send progress narration unless a tool approval is required or the assigned environment requires it to continue.
- Work on the next Slice or Epic begins only from a new explicit assignment after the current scope is accepted.

Dialogue lifecycle:

- start one new DeepSeek/Cline dialogue for each canonical Slice or post-MVP Epic;
- keep every Work Item and correction for that scope in the same dialogue until Accepted;
- close the dialogue after acceptance; do not carry its speculative or stale context into the next scope;
- begin the next dialogue with the section-routed read from §2.

Independent review uses evidence on demand:

1. validate handoff identity;
2. inspect the actual diff and changed owners;
3. inspect failed, deviated, manual, or risk-linked evidence;
4. open full audit records or screenshots only when the changed risk requires them;
5. run the smallest independent diagnostic needed, followed by every required acceptance gate.

Do not load all previous Slice audits, screenshots, or full specifications by default. This changes reading order, not the acceptance threshold.

### 8.1 Filesystem handoff

When `.agent-handoff/control.json` exists, it is the active transient assignment envelope. It does not replace canonical documentation and is never committed. New post-MVP assignments use protocol v2. The validator retains protocol v1 compatibility only for legacy MVP handoffs. The implementation agent must:

1. run `npm run handoff:validate` before editing;
2. match `runId`, `scopeId`, `baseRevision`, `taskType`, and every canonical section;
3. execute only that Epic, Work Item, or correction;
4. write evidence under `.agent-handoff/evidence/` when required;
5. write `.agent-handoff/result.json` last, after all work and gates, then run `npm run handoff:validate` again;
6. tell the Product Owner only: `Handoff ready. Tell Codex: DeepSeek completed the cycle.`

`result.json` contains only variable evidence: identifiers, state, changed paths, AC/TC, gates, evidence paths, material deviations, and blockers. Do not copy requirements or full logs into it. A completed result never authorizes the next Slice or Epic, commit, or push.

Write new `control.json` assignments with this exact protocol-v2 shape:

```json
{
  "protocolVersion": 2,
  "runId": "stable unique run id",
  "scopeId": "E01",
  "taskType": "epic | work_item | correction",
  "baseRevision": "full 40-character Git revision",
  "canonicalSections": ["Project Documentation/...md §..."],
  "delta": ["one observable change per item"],
  "risks": ["only scope-specific known risks"],
  "requiredGates": ["npm run verify"],
  "state": "assigned"
}
```

Do not copy standing architecture, negative scope, reporting rules, or complete AC wording into `delta`. `canonicalSections` supplies the exact routed context. `risks` may be empty; the other arrays must not be empty.

Write `result.json` with this exact protocol-v2 shape; arrays may be empty where stated:

```json
{
  "protocolVersion": 2,
  "runId": "copied from control",
  "scopeId": "copied from control",
  "baseRevision": "copied from control",
  "state": "awaiting_review",
  "changedPaths": ["src/..."],
  "criteria": ["source-qualified AC/TC"],
  "gates": [{ "command": "npm run verify", "status": "pass" }],
  "evidencePaths": [],
  "deviations": [],
  "blockers": []
}
```

An issue object uses `{ "severity": "S0|S1|S2|S3", "disposition": "blocked|fix_now|accepted_observation", "impact": "one sentence", "owner": "required only for accepted_observation" }`. Set `state` to `blocked` when blockers exist. `awaiting_review` cannot contain `S0`–`S2` or an unpassed gate.

The Product Owner relays only `DeepSeek completed the cycle.` The independent reviewer reads the handoff, inspects the actual diff, and reruns applicable gates. For a correction, the reviewer replaces `control.json`; the Product Owner relays only `Continue the active scope under the standing protocol.`

## 9. Verification

- During implementation, run the narrowest relevant tests. Before handoff, run `npm run verify` once against the final unchanged revision.
- Browser/player-visible/lifecycle/build work also runs `npm run verify:browser` once against the final unchanged revision.
- Milestone or test-build handoff: `npm run verify:all` plus applicable manual evidence.
- Performance-sensitive work: record proportional evidence at implementation time.
- Failed required gates block completion. Do not weaken a gate to accept a failure.
- Do not rerun a passing full gate when code, configuration, dependencies, or the relevant environment have not changed. A repeat requires a concrete flaky-test or environment investigation recorded in evidence.
- After a failed gate, change the code/environment or identify a materially different diagnostic before rerunning it. Two identical failures trigger root-cause review rather than an unbounded retry loop.
- Verify exact formulas, deterministic sequences, bounds, and balance values at unit level. Browser tests cover representative cross-layer wiring and browser-only behaviour; do not repeat every unit-level permutation in end-to-end tests unless an Acceptance Criterion specifically requires browser-observable evidence.

## 10. Acceptance and correction

- The implementation agent supplies evidence but cannot accept its own Slice, Epic, or Work Item.
- The independent acceptance reviewer returns either `Accepted` or one consolidated correction task.
- A legacy correction is named `Sxx-WIyy within Slice Sxx`; a post-MVP correction remains inside its parent Epic. Neither is a new parent scope.
- Complete all corrections, rerun affected scope gates, and return one revised report.
- Do not begin the next Slice or Epic while acceptance is pending or corrections remain.

### 10.1 Defect and uncertainty policy

Severity describes impact, not implementation order:

| Class | Meaning                                                                                                                | Default disposition                                       | Product Owner required                |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------- |
| `S0`  | Missing or contradictory product behaviour; scope or player outcome cannot be derived safely                           | Stop only affected work; request one product decision     | Yes                                   |
| `S1`  | Correctness, state-integrity, security, destructive-action, or non-negotiable architecture defect                      | Fix before acceptance                                     | Only if the contract must change      |
| `S2`  | Incomplete AC, player-visible defect, evidence gap, boundary violation, or foundation likely to cause dependent rework | Fix before acceptance by default                          | Only for a material product trade-off |
| `S3`  | Local, bounded imperfection with no player, architecture, acceptance, or dependent-Slice impact                        | Fix during self-review or accept without a separate cycle | No                                    |
| `S4`  | Reversible implementation preference between equivalent valid choices                                                  | Agent decides; do not report or track                     | No                                    |

Rules:

- known `S0`–`S2` are incompatible with `Accepted`;
- consolidate every discoverable `S1`/`S2` into one correction Work Item;
- never create a correction cycle solely for `S3` or discuss `S4`;
- defer a material issue only with one-sentence impact, a concrete owning Slice, and proof that no current or dependent contract relies on the defect; otherwise fix now;
- do not create a general defect backlog for MVP;
- after a second failed correction for the same defect class, stop automatic repetition and review the root cause: specification, test, decomposition, or agent execution;
- ambiguity outside the assigned scope creates no requirement and no speculative implementation.

Acceptance requires no known `S0`–`S2`, passing required gates, proportionate evidence, no unresolved source conflict, no ownerless deferral, and no known-defective foundation passed to the next dependent scope.

### 10.2 Proactive process audit

After each accepted Slice or Epic, the independent reviewer silently checks correction causes, repeated defects, redundant reading or gates, relay steps, and candidates for a test, lint rule, validator, or hook. Raise a process proposal only when it removes a cycle, prevents a recurring defect class, materially reduces context, or reduces Product Owner involvement. Do not produce a routine process report when no useful change exists.

After each accepted post-MVP Epic, record the lightweight process metrics defined by the Verification specification. Re-audit the process after three accepted post-MVP scopes. Stop an optimization if cost does not improve or escaped defects increase.

### 10.3 External analysis evidence

Treat an external code, architecture, performance, or process audit as a set of hypotheses until it identifies:

- the exact repository path and Git revision;
- concrete files and line-level owners;
- the observed fact separately from the proposed solution;
- the command, profile, trace, or repeatable method behind quantitative claims;
- the relevant device, browser, viewport, workload, and sample window for performance claims.

An audit that names absent dependencies, files, hooks, or architecture is not actionable until direct repository inspection confirms the claim. Unsupported percentage improvements are not estimates; reject them as unevidenced. This rule does not require external auditors to use repository terminology perfectly, but it does require evidence that maps to the actual code.

### 10.4 Micro-correction lane

The Product Owner authorizes the independent acceptance reviewer (Codex) to implement a local micro-correction autonomously within an `Accepted` or `Awaiting Acceptance Review` Slice when every condition below holds:

- the approved product contract already determines the correct result;
- no product, scope, architecture, state-ownership, dependency, or content decision is introduced;
- the cause is known and the correction is limited to one to three logically related tracked files;
- no new system, component family, dependency, persistence, or speculative abstraction is added;
- a regression test covers the defect class;
- every applicable gate passes after the correction.

Flow:

```text
local defect
→ reviewer confirms micro-correction eligibility and root cause
→ reviewer implements the smallest canonical-owner fix plus regression
→ applicable full gates pass
→ reviewer creates a `fix(sxx): ...` amendment commit
→ reviewer may push only under the existing clean-working-tree, existing-origin/main, fast-forward authorization
```

A micro-correction does not create a DeepSeek handoff, Product Owner relay, separate defect backlog, or product discussion. Severity and execution path are separate: a narrowly bounded AC defect may be `S2` yet use this lane when all eligibility conditions hold.

Do not use this lane when the cause is uncertain, more than three logical files are required, an existing contract must change, multiple systems or owners are affected, manual product judgement is needed, or the correction changes Combat/economy/state semantics. Route those cases through one consolidated correction Work Item. If scope expands while fixing, stop the micro-correction and reclassify it; do not stretch the file limit or hide architectural work inside the amendment.

## 11. Git and external actions

- Do not commit unless explicitly requested.
- The standard authorization command is `Commit Sxx under the standing protocol.`
- A Slice commit occurs only after independent acceptance and contains the accepted Slice plus its correction Work Items.
- Before commit, inspect repository status and diff; exclude unrelated changes, temporary probes, test output, reports, and generated artifacts.
- Do not rerun gates solely for commit when relevant files have not changed since accepted verification.
- Use `feat(sxx): <slice outcome>` for the first accepted Slice commit, or an explicitly assigned message.
- After commit, report only the commit hash, commit subject, whether relevant files changed after accepted verification, and exact remaining working-tree entries.
- The Product Owner has given the independent acceptance reviewer standing authorization to commit accepted Slices and push only to the existing `origin/main` when the working tree is clean and the push is fast-forward. This authorization does not apply to the implementation agent.
- Post-MVP Epic commits require an explicit Product Owner command until the Product Owner extends or replaces the legacy Slice authorization. Do not infer that extension from Epic acceptance alone.
- The same reviewer authorization covers eligible micro-correction amendment commits under §10.4 after applicable gates pass.
- No agent may push another branch or remote, force push, publish, deploy, or create a PR under that standing authorization.
- Do not push, publish, deploy, create a remote, open a PR, or contact an external system unless explicitly requested.
- Never combine unrelated user changes into an agent commit.
- Do not claim a local commit is externally available.

## 12. Documentation and status

- `Project Documentation/` is the only durable product/technical memory.
- Do not create `memory-bank/`, `PLAN.md`, `STATUS.md`, balance mirrors, entity mirrors, or repeated requirement summaries as parallel authority.
- A temporary plan may exist in the agent conversation, not as canonical product state.
- When an approved contract changes, update its canonical document and affected traceability in the same authorized change.

## 13. Required scope report

When filesystem handoff is not active, return exactly one concise, factual report designed to be relayed unchanged:

```text
Outcome:
Scope status: Awaiting Acceptance Review | Correction Required
Changed files: [paths grouped by ownership; no file-by-file prose when the path is self-explanatory]
AC/TC: [IDs covered; identify any uncovered ID]
Gates: [command → pass/fail; test counts where applicable]
Manual evidence: [completed evidence or Not required]
Deviations: [material deviation only, or None]
Blockers: [material blocker only, or None]
```

When `.agent-handoff/control.json` is active, encode this report only in `.agent-handoff/result.json` and send the Product Owner only the one-line notification required by section 8.1. Do not duplicate the report in chat.

Do not repeat canonical values, test names, implementation walkthroughs, assumptions already fixed by documentation, or generic quality claims. Include technical detail only for a failure, deviation, newly discovered risk, or compatibility-affecting decision.

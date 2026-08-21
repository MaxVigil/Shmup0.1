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

Reading is revision-aware. In a new agent session, read every required source completely. In the same persistent session, first compare repository revisions: unchanged sources already read completely need not be reread. Always reread the assigned Slice contract, every changed canonical source, and the relevant normative sections. Never rely on an agent-authored summary in place of a canonical source.

For every task, read completely:

- `Project Documentation/README.md`;
- the relevant feature specification;
- `MVP_GLOSSARY_v0.1.md`;
- `MVP_REPOSITORY_ARCHITECTURE_v0.1.md`;
- `MVP_CODE_PRINCIPLES_v0.1.md`;
- `MVP_VERIFICATION_AND_QUALITY_GATES_v0.1.md`.

Also read:

- `MVP_MASTER_DESIGN_DOCUMENT_v0.1.md` for Boot, cross-system state, lifecycle, or end-to-end work;
- `MVP_DESIGN_SYSTEM_SPEC_v0.1.md` for any player-visible UI or HUD work;
- `MVP_NARRATIVE_RULES_v1.0.md` before adding or changing names, copy, people, factions, countries, technologies, or localization;
- `MVP_DELIVERY_SPEC_v0.1.md` for build, production, asset, or release work;
- `MVP_TRACEABILITY_MATRIX_v0.1.md` when selecting or reporting Acceptance Criteria;
- `MVP_IMPLEMENTATION_SLICES_v0.1.md` before planning or implementing any Slice or Work Item.

Read the selected skill's complete `SKILL.md` before acting. Read only relevant supporting references.

## 3. Work authorization

- Implement only the explicitly assigned slice.
- The MVP has exactly fourteen canonical Slices, `S01`–`S14`. A `Sxx-WIyy` Work Item is an execution unit inside its parent Slice and never an additional or complete Slice.
- Do not mark a parent Slice complete after a Work Item. Slice acceptance requires all applicable source AC, technical criteria, gates, and manual evidence.
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
3. resolve the assigned Slice or Work Item against the canonical Slice Registry;
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

For a Slice executed through multiple Work Items:

- plan and complete the Work Items sequentially inside the same assigned Slice;
- do not request relay, acceptance, or commit after each Work Item unless the handoff declares a mandatory checkpoint;
- run narrow tests while working and the Slice-level gates once after integration;
- stop and report only when an S0–S2 blocker prevents safe continuation;
- never continue into the next Slice.

After implementation:

1. run the required gates from the Verification specification;
2. inspect the diff for scope creep and boundary violations;
3. perform a self-review against every assigned AC/TC and negative requirement;
4. correct self-discovered in-scope defects before reporting;
5. send exactly one compact Slice report using section 11;
6. do not describe unrun checks as passing;
7. set the result to `Awaiting Acceptance Review`, never `Accepted`.

## 8. Communication and relay efficiency

The Product Owner is a non-technical relay between the implementation agent and the independent acceptance reviewer. Do not require the Product Owner to inspect code, compare technical alternatives, rewrite instructions, or determine whether evidence is sufficient.

- Treat canonical repository documents as already available; task messages reference them and include only Slice-specific scope or explicit overrides.
- Do not repeat reading lists, global architecture rules, standard negative scope, verification rules, reporting rules, or commit rules in every handoff.
- Do not ask about helper names, file-local decomposition, equivalent test techniques, or other reversible choices within the approved architecture.
- If several material blockers exist, return them in one report rather than one message per question.
- A blocker report must explain the observable impact, provide a recommendation, and end with one copyable `RELAY TO ACCEPTANCE REVIEWER` block. Do not ask the Product Owner to choose a technical implementation.
- A completion report must be copyable unchanged to the acceptance reviewer and contain no request for the Product Owner to interpret test output.
- Do not send progress narration unless a tool approval is required or the assigned environment requires it to continue.
- Work on the next Slice begins only from a new explicit assignment after the current Slice is accepted.

### 8.1 Filesystem handoff

When `.agent-handoff/control.json` exists, it is the active transient assignment envelope. It does not replace canonical documentation and is never committed. The implementation agent must:

1. run `npm run handoff:validate` before editing;
2. match `runId`, `sliceId`, `baseRevision`, `taskType`, and the canonical section;
3. execute only that Slice or correction;
4. write evidence under `.agent-handoff/evidence/` when required;
5. write `.agent-handoff/result.json` last, after all work and gates, then run `npm run handoff:validate` again;
6. tell the Product Owner only: `Handoff ready. Tell Codex: DeepSeek completed the cycle.`

`result.json` contains only variable evidence: identifiers, state, changed paths, AC/TC, gates, evidence paths, material deviations, and blockers. Do not copy requirements or full logs into it. A completed result never authorizes the next Slice, commit, or push.

Write `result.json` with this exact shape; arrays may be empty:

```json
{
  "protocolVersion": 1,
  "runId": "copied from control",
  "sliceId": "Sxx",
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

The Product Owner relays only `DeepSeek completed the cycle.` The independent reviewer reads the handoff, inspects the actual diff, and reruns applicable gates. For a correction, the reviewer replaces `control.json`; the Product Owner relays only `Continue the active Slice under the standing protocol.`

## 9. Verification

- Every code increment: `npm run verify`.
- Browser/player-visible/lifecycle/build work: also `npm run verify:browser`.
- Milestone or test-build handoff: `npm run verify:all` plus applicable manual evidence.
- Performance-sensitive work: record proportional evidence at implementation time.
- Failed required gates block completion. Do not weaken a gate to accept a failure.

## 10. Acceptance and correction

- The implementation agent supplies evidence but cannot accept its own Slice.
- The independent acceptance reviewer returns either `Accepted` or one consolidated correction task.
- A correction is named `Sxx-WIyy within Slice Sxx`; it is not a new Slice.
- Complete all corrections, rerun affected Slice gates, and return one revised report.
- Do not begin the next Slice while acceptance is pending or corrections remain.

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

Acceptance requires no known `S0`–`S2`, passing required gates, proportionate evidence, no unresolved source conflict, no ownerless deferral, and no known-defective foundation passed to the next Slice.

### 10.2 Proactive process audit

After each accepted Slice, the independent reviewer silently checks correction causes, repeated defects, redundant reading or gates, relay steps, and candidates for a test, lint rule, validator, or hook. Raise a process proposal only when it removes a cycle, prevents a recurring defect class, materially reduces context, or reduces Product Owner involvement. Do not produce a routine process report when no useful change exists.

### 10.3 Micro-correction lane

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
- The same reviewer authorization covers eligible micro-correction amendment commits under §10.3 after applicable gates pass.
- No agent may push another branch or remote, force push, publish, deploy, or create a PR under that standing authorization.
- Do not push, publish, deploy, create a remote, open a PR, or contact an external system unless explicitly requested.
- Never combine unrelated user changes into an agent commit.
- Do not claim a local commit is externally available.

## 12. Documentation and status

- `Project Documentation/` is the only durable product/technical memory.
- Do not create `memory-bank/`, `PLAN.md`, `STATUS.md`, balance mirrors, entity mirrors, or repeated requirement summaries as parallel authority.
- A temporary plan may exist in the agent conversation, not as canonical product state.
- When an approved contract changes, update its canonical document and affected traceability in the same authorized change.

## 13. Required Slice report

Return exactly one concise, factual report designed to be relayed unchanged:

```text
Outcome:
Slice status: Awaiting Acceptance Review | Correction Required
Changed files: [paths grouped by ownership; no file-by-file prose when the path is self-explanatory]
AC/TC: [IDs covered; identify any uncovered ID]
Gates: [command → pass/fail; test counts where applicable]
Manual evidence: [completed evidence or Not required]
Deviations: [material deviation only, or None]
Blockers: [material blocker only, or None]
```

Do not repeat canonical values, test names, implementation walkthroughs, assumptions already fixed by documentation, or generic quality claims. Include technical detail only for a failure, deviation, newly discovered risk, or compatibility-affecting decision.

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
- `MVP_TRACEABILITY_MATRIX_v0.1.md` when selecting or reporting Acceptance Criteria.
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
3. state the exact in-scope outcome, Acceptance Criteria, negative requirements, and files likely affected;
4. report any blocker before creating dependent code.

During implementation:

- keep changes small and uniquely scoped;
- add behaviour at its canonical owner;
- add tests at the lowest reliable layer;
- keep setup and cleanup together;
- check performance when adding a per-frame or player-visible system;
- do not rewrite canonical documentation unless the approved contract itself changed.

After implementation:

1. run the required gates from the Verification specification;
2. inspect the diff for scope creep and boundary violations;
3. report changed files, observable outcome, tests/evidence, assumptions, and remaining risks;
4. do not describe unrun checks as passing.

## 8. Verification

- Every code increment: `npm run verify`.
- Browser/player-visible/lifecycle/build work: also `npm run verify:browser`.
- Milestone or test-build handoff: `npm run verify:all` plus applicable manual evidence.
- Performance-sensitive work: record proportional evidence at implementation time.
- Failed required gates block completion. Do not weaken a gate to accept a failure.

## 9. Git and external actions

- Do not commit unless explicitly requested.
- Do not push, publish, deploy, create a remote, open a PR, or contact an external system unless explicitly requested.
- Never combine unrelated user changes into an agent commit.
- Do not claim a local commit is externally available.

## 10. Documentation and status

- `Project Documentation/` is the only durable product/technical memory.
- Do not create `memory-bank/`, `PLAN.md`, `STATUS.md`, balance mirrors, entity mirrors, or repeated requirement summaries as parallel authority.
- A temporary plan may exist in the agent conversation, not as canonical product state.
- When an approved contract changes, update its canonical document and affected traceability in the same authorized change.

## 11. Required handoff report

Keep the report concise and factual:

```text
Outcome:
Changed files:
Acceptance Criteria covered:
Commands run and results:
Manual evidence:
Assumptions:
Remaining risks or blockers:
```

Omit empty sections except `Outcome`, `Changed files`, and `Commands run and results`.

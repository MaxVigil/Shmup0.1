# Shmup DeepSeek Governance and Skill Routing v0.1

**Product:** Shmup  
**Scope:** Implementation-agent authority, workflow, context cost, skill audit, and routing
**Status:** APPROVED  
**Decision owner:** Product Owner  
**Approved:** 2026-08-20
**Process routing updated:** 2026-08-26

## 1. Purpose

This document defines how DeepSeek/Cline and other coding agents must use canonical documentation and optional game-development skills for the accepted MVP baseline and approved post-MVP work.

Skills are technique references, not requirements. They cannot select product scope, architecture, engine ownership, balance, narrative, or delivery behaviour.

The executable repository rules live in the current validated checkout's `AGENTS.md`. Cline is pointed to that file by `.clinerules/00-project-governance.md`. An absolute path, previous conversation, or similarly named repository is not authority.

Repository documentation, implementation handoffs, agent-to-agent communication, code comments, and test descriptions use English. Communication with Maksym uses Ukrainian by default. This policy keeps one terminology path and one source of truth; it does not claim that English always uses fewer tokens than every other language.

## 2. Package design

The governance package contains:

```text
AGENTS.md
.clinerules/00-project-governance.md
.cline/skills/shmup-mvp-combat/SKILL.md
.cline/skills/shmup-mvp-base-precombat/SKILL.md
.cline/skills/shmup-mvp-cross-system/SKILL.md
Project Documentation/MVP_DEEPSEEK_GOVERNANCE_AND_SKILL_ROUTING_v0.1.md
Project Documentation/MVP_IMPLEMENTATION_SLICES_v0.1.md
```

There is no `memory-bank/`, duplicated PLAN/STATUS authority, or copied requirements summary.

## 3. Authority model

The implementation agent must:

1. pass `npm run context:validate` before substantive work;
2. read the assignment-routed canonical sections before planning;
3. select the project-specific skill for the assigned subsystem;
4. load a generic skill only when its narrow technique is needed;
5. treat every skill statement as subordinate to canonical documentation;
6. stop the affected task when a material conflict or missing S0–S2 behaviour exists;
7. implement only the explicitly assigned Slice, Epic, Work Item, or correction;
8. provide verification evidence rather than confidence statements.

The completed MVP implementation structure contains exactly `S01`–`S14`. Optional legacy `Sxx-WIyy` Work Items are execution units inside a parent Slice and cannot be reported as additional or completed Slices. Post-MVP work uses one approved Epic plus bounded Work Items or corrections inside it.

The agent must not use a generic skill to fill an unspecified product gap.

## 4. Audit sources

The audit examined:

- the old repository `AGENTS.md`;
- `awesome-gamedev-agent-skills`: 67 specialized skills plus `router` under the old repository `.cline/skills/`;
- the separate `shmup-skill-v0.2.md`;
- the separate `strategic-base-management-skill-v0.2.md`;
- Phaser 4.2.1 package skills installed under `node_modules/phaser/skills/`;
- the approved MVP product and technical package.

The old repository itself is historical reference only and is not authoritative for `Shmup0.1`.

## 5. Old `AGENTS.md` audit

### Retained in current form

- deterministic renderer-independent Domain;
- seeded randomness;
- typed content definitions;
- small explicit interfaces;
- dependency licence and maintenance review;
- lint, typecheck, test, and build gates;
- human verification for visual behaviour;
- small scoped changes;
- canonical terminology;
- dependency and asset licence review.

### Replaced by current contracts

- old repository map;
- old command names and test locations;
- Phaser-owned scene/UI assumptions;
- balance/entity generated mirrors;
- generic mother-button rules;
- old milestone reporting format.

### Rejected

- persistence and migration requirements;
- research, alien technology, engineering, and future campaign scope;
- mandatory PLAN/STATUS files;
- automatic commit-and-push workflow;
- claims that a commit must always be pushed to an external reviewer.

External publication requires explicit authorization.

## 6. Project-specific skill audit

### 6.1 Old `shmup v0.2` — rejected for MVP execution

Useful durable ideas:

- readability over chaos;
- player understanding of damage causes;
- total visual-load awareness;
- mechanics should have a clear purpose.

Conflicts and scope contamination:

- assumes player buildcraft as the active MVP core;
- assumes enemy attacks and projectile-density decisions;
- adds elite enemies, support enemies, missiles, drones, mines, beams, abilities, and area denial;
- adds alien technology, extraction, risk/reward and campaign progression;
- recommends `phaser-arcade-physics`;
- implies weapon families and upgrade behaviour beyond the approved two-weapon MVP.

Disposition: do not install or invoke. Replaced by `.cline/skills/shmup-mvp-combat/SKILL.md`, which routes to the canonical Combat Specification.

### 6.2 Old `strategic-base-management v0.2` — rejected for MVP execution

Useful durable ideas:

- strategic UI should serve meaningful player decisions;
- avoid unnecessary administration;
- avoid fake choices.

Conflicts and scope contamination:

- assumes research, engineering, production, buildings, personnel, technology trees, resource scarcity, campaign specialization, replayability, alien technology, and save systems;
- suggests multiple resources and time/capacity mechanics;
- describes a future strategic game, not the approved Operations/Hangar MVP.

Disposition: do not install or invoke. Replaced by `.cline/skills/shmup-mvp-base-precombat/SKILL.md`, which routes to the canonical Base and Pre-Combat Specification.

### 6.3 `shmup-mvp-cross-system` — approved project skill

Use for slices spanning Domain, typed Content, Boot, Shared Session State, deterministic RNG, Mission Snapshot, Mission Result, shared Settings or lifecycle, Base/Combat integration, and full-MVP hardening.

This is not a generic fallback. Isolated Combat and Base/pre-Combat work uses the corresponding subsystem skill. Build-Tooling-only work uses canonical technical documents without a gameplay skill.

## 7. `awesome-gamedev-agent-skills` audit

### 7.1 Router — rejected

The generic router correctly detects Phaser from `package.json`, but it is unnecessary and unsafe here because:

- engine, version, architecture, and project routes are already fixed;
- it may default unknown work to Godot;
- it recommends `phaser-arcade-physics` for collision;
- genre/workflow composition can add unapproved mechanics or process.

Use the routing table in `AGENTS.md` instead.

### 7.2 Conditionally allowed skills

| Skill | Allowed use | Mandatory restriction |
|---|---|---|
| `phaser-core` | Phaser 4.2 API and Scene lifecycle reference for Combat presentation | Ignore Phaser Registry/shared-state, Phaser-Screen, per-Scene asset-loading, variable-delta gameplay, and cross-scene event-bus patterns. |
| `game-ui-ux` | responsive layout, focus, semantic UI, accessibility review | Canonical Design System wins; no mobile, touch, gamepad, localization, safe-area, new settings, or generic screen-stack scope. Event-driven advice does not replace `CombatHudBridge`. |
| `input-systems` | action/command separation, edge-versus-held reasoning, input conflict review | No rebinding, gamepad, touch, persistence, coyote time, input buffering, or new accessibility settings. Canonical application router owns input. |
| `performance-optimization` | measurement, profiling, budget diagnosis | No speculative pooling/batching/partitioning. Use approved browser/reference-device evidence and current performance budgets. |
| `physics-tuning` | fixed-step, interpolation, frame-spike, and tunnelling analysis | No engine physics, forces, mass, gravity, drag, CCD bodies, response, layers, or solver. Project AABB and fixed-step rules win. |
| `game-feel` | only feedback explicitly required by a specification | No audio, particles, shake, hit-stop, knockback, damage numbers, squash/stretch, or additional feedback. MVP-approved flash/disappearance behaviour is the boundary. |
| `camera-systems` | diagnose a specifically approved canvas/camera presentation defect | No follow camera, deadzone, look-ahead, shake, cinematic framing, or camera mechanic unless later approved. |
| `create-game-assets` | asset work explicitly requested and approved by Product Owner | Must preserve asset provenance/licence/runtime pipeline; cannot invent art scope or replace approved assets autonomously. |

These skills are optional. Their absence does not block ordinary MVP implementation because project documentation is complete.

### 7.3 Blocked for current MVP

The following skills are not routed during MVP implementation because they target a different engine, genre, platform, workflow, or explicitly excluded system:

| Category | Blocked skills |
|---|---|
| Physics engine | `phaser-arcade-physics` |
| Audio | `audio-design` |
| Persistence/progression | `save-systems`, `procedural-gen` |
| AI/dialogue/levels/shaders | `game-ai`, `dialogue-systems`, `level-design`, `shader-programming` |
| Scope-relaxing workflows | `game-jam`, `prototype-fast` |
| Publishing | `itch-publish`, `steam-publish` |
| Other web engines | `pixijs-rendering`, `threejs-scene-setup`, `threejs-gltf-loading`, `threejs-materials-lighting` |
| Other engines | `bevy-ecs`, `love2d-core`, `pygame-core`, `roblox-luau`, `roblox-datastores` |
| Godot | `godot-2d-movement`, `godot-3d-essentials`, `godot-animation`, `godot-audio`, `godot-csharp`, `godot-export`, `godot-gdscript`, `godot-multiplayer`, `godot-nodes-scenes`, `godot-physics`, `godot-resources`, `godot-shaders`, `godot-signals-groups`, `godot-tilemap`, `godot-ui-control` |
| Unity | `unity-animation`, `unity-build-pipeline`, `unity-csharp-scripting`, `unity-input-system`, `unity-navmesh`, `unity-physics`, `unity-scriptableobjects`, `unity-tilemap-2d` |
| Unreal | `unreal-behavior-trees`, `unreal-blueprints`, `unreal-cpp-gameplay`, `unreal-enhanced-input`, `unreal-niagara`, `unreal-packaging` |
| Genre templates | `card-game`, `fps-shooter`, `platformer`, `puzzle`, `roguelike`, `rpg`, `survival-crafting`, `tower-defense`, `visual-novel` |

“Blocked” means not applicable to the approved MVP, not that the skill is defective. A later explicit scope or engine decision requires a new audit before routing changes.

## 8. Phaser package skill audit

Phaser 4.2.1 includes its own skills under `node_modules/phaser/skills/`. They are dependency-provided API references and may change when the package changes. They are not copied into project governance.

### Conditionally allowed as Phaser API references

- `game-setup-and-config`;
- `scenes`;
- `loading-assets`;
- `sprites-and-images`;
- `graphics-and-shapes`;
- `game-object-components`;
- `groups-and-containers`;
- `input-keyboard-mouse-touch`, limited to keyboard/mouse API needed by approved Combat input;
- `scale-and-responsive`;
- `time-and-timers`, limited to presentation timing rather than authoritative gameplay time;
- `animations` and `tweens`, only for explicitly approved presentation behaviour;
- `v4-new-features`, only for API compatibility investigation.

The agent must apply the same project ownership restrictions as for `phaser-core`.

### Blocked for MVP

- `physics-arcade`;
- `physics-matter`;
- `audio-and-sound`;
- `tilemaps`;
- `data-manager` as application/shared-state authority;
- `events-system` as a global application event bus;
- `particles`;
- `filters-and-postfx`;
- `render-textures`;
- `curves-and-paths`;
- `text-and-bitmaptext` for React-owned UI/HUD;
- `v3-to-v4-migration` because this is not a Phaser 3 migration.

Other package skills may be used only after confirming that the assigned feature actually needs their API and that no scope or architecture conflict exists.

## 9. Task routing protocol

### 9.1 Context routing

`AGENTS.md` §§0 and 2 are the executable identity and context router. Every new dialogue validates the checkout, then reads `AGENTS.md`, the active assignment, and one selected project skill completely. Canonical documents are loaded by exact assigned section and change owner rather than as a full package.

Minimum behaviour:

- `control.json` protocol v2 lists every required canonical section;
- the selected project skill supplies the owner route, not copied requirements;
- Narrative Rules load only for copy, localization, people, factions, countries, technologies, narrative content, or narrative-dependent assets;
- the Traceability Matrix loads only when selecting, changing, or reporting AC coverage;
- a new owner, import boundary, product term, or AC in the proposed diff expands the route before editing;
- a full document loads only for an explicitly assigned complete audit or when section-level conflict analysis is insufficient.

Do not create condensed specification copies, a Memory Bank, or an agent-authored requirements mirror to reduce reading. The saving comes from precise source selection.

### 9.2 Stable prefix and measured context cost

DeepSeek API context caching reuses fully matching input prefixes on a best-effort basis. When the agent interface exposes request construction:

1. keep stable system rules, `AGENTS.md`, and routed canonical sections in a consistent order;
2. do not rewrite or reorder unchanged standing text between calls;
3. put Work Item delta, current diff, failures, and questions after the stable prefix;
4. send only exact routed sections and risk-linked evidence;
5. record `prompt_cache_hit_tokens`, `prompt_cache_miss_tokens`, and output tokens when the provider exposes them;
6. compare total implementation-plus-review cost per accepted scope, including repair cycles.

Caching is an optimization, not an acceptance criterion. It is not guaranteed, and required context must never be removed to manufacture a cache hit. Provider prices change; record measured cost when exposed and link to current provider pricing instead of copying price values into canonical policy.

### 9.3 Dialogue and Work Item lifecycle

- Use one new DeepSeek/Cline dialogue per legacy Slice or independently reviewable post-MVP Work Item by default.
- Keep corrections for that same Work Item in its dialogue until independently accepted.
- A small Epic may stay in one dialogue only when its complete diff remains one coherent, reviewable change with one routed context set.
- Start a fresh dialogue when the next Work Item changes the primary owner set, state boundary, or canonical route, or when accumulated context contains obsolete implementation hypotheses.
- Close the dialogue after acceptance. Run Epic integration and final acceptance from a fresh reviewer context.

This rule bounds stale context and review size. Section routing and a stable prefix limit reread cost.

### Combat task

Load:

1. `shmup-mvp-combat`;
2. one generic/API reference only if a concrete technical subproblem requires it.

Examples:

- simulation/collision: project skill only; optionally restricted `physics-tuning` for fixed-step analysis;
- Phaser Scene lifecycle: project skill plus restricted `phaser-core` or Phaser `scenes`;
- Combat performance regression: project skill plus `performance-optimization`;
- approved hit flash: project skill plus restricted `game-feel` only if needed.

### Base/pre-Combat task

Load:

1. `shmup-mvp-base-precombat`;
2. restricted `game-ui-ux` only for a concrete layout, focus, responsive, or accessibility question.

Do not load strategic-base-management, save-systems, or Phaser UI skills.

### Cross-system task

Load `shmup-mvp-cross-system` first.

Load `shmup-mvp-combat` or `shmup-mvp-base-precombat` additionally only when the assigned slice materially implements behaviour inside that subsystem. Do not load both merely because shared types are referenced.

Architecture, build, lint, dependency, or governance work uses canonical technical documents directly and does not require a gameplay skill.

## 10. Conflict examples

| Skill suggestion | Project decision | Required action |
|---|---|---|
| Use Phaser Registry for Credits/Hull | Application-owned Shared Session Store | Ignore skill pattern; use application API. |
| Model Operations and Hangar as Phaser Scenes | React owns Base Screens | Ignore skill pattern. |
| Use Arcade overlap/colliders | Pure deterministic AABB | Do not import physics plugin. |
| Move from Phaser `delta` | Fixed `1/60 s` authoritative step | Forward frame timing to fixed-step driver only. |
| Add enemy bullets for challenge | Enemies do not fire in MVP | Reject as scope conflict. |
| Add screen shake/audio/knockback | Explicitly excluded or unspecified | Do not implement. |
| Save bindings or campaign state | Session-only, refresh reset | Do not implement persistence. |
| Add research/manufacturing | Outside Base MVP | Do not implement. |
| Create `memory-bank/` | Canonical documentation only | Do not create it. |
| Automatically commit and push | External actions need authorization | Report completed local change only. |

## 11. Agent reporting and review

The agent report must identify:

- selected project skill and any generic reference skill;
- canonical sections loaded;
- Acceptance Criteria addressed;
- files changed;
- commands and manual evidence completed;
- unresolved assumptions, risks, or blockers.

A report must not say “all tests pass” without listing the executed gate, and must not claim visual or reference-device quality from unit tests.

The independent reviewer uses evidence on demand:

1. validate `control.json` and `result.json` identity;
2. derive failure modes, boundary cases, and negative-requirement risks from the contract before reading the author's test rationale;
3. inspect the actual diff, changed owners, and every committed test change;
4. check that relevant broken behaviour would make the tests fail; add or request an independent counter-test when needed;
5. inspect failed, deviated, manual, or risk-linked evidence;
6. open full audit records and screenshots only when the changed risk requires them;
7. run the smallest independent diagnostic needed and every required acceptance gate.

If the reviewer changes production code, committed tests, build configuration, or canonical governance, a different qualified reviewer must accept that amendment. The first reviewer cannot be both amendment author and final acceptance authority.

Do not preload previous Slice audits or every evidence file. Evidence-on-demand changes review order, not quality gates or independent acceptance.

## 12. Governance maintenance

Update this audit only when:

- a skill is installed, removed, or materially revised;
- approved scope makes a blocked skill relevant;
- architecture changes alter skill compatibility;
- observed agent behaviour demonstrates a real routing failure.

Do not expand governance for hypothetical failures. Do not copy entire skill bodies into documentation.

An external audit is actionable only after repository inspection confirms its claims. Require the exact repository path and revision, concrete file owners, a separation of observation from recommendation, and a reproducible method for quantitative claims. Reject unsupported percentage improvements and claims that rely on absent files, dependencies, hooks, or architecture.

## 13. Readiness

The DeepSeek/Cline governance package and current skill audit are approved.

The final cross-document technical audit passed on `2026-08-20`.

The governance package is **READY FOR IMPLEMENTATION**. DeepSeek may work only through an explicitly assigned Slice, Epic, Work Item, or correction under the authority and routing rules defined here and in `AGENTS.md`.

## 14. External references

- [DeepSeek Context Caching](https://api-docs.deepseek.com/guides/kv_cache/)
- [DeepSeek Models and Pricing](https://api-docs.deepseek.com/quick_start/pricing/)
- [Google Engineering Practices: Small CLs](https://google.github.io/eng-practices/review/developer/small-cls.html)
- [Google Engineering Practices: What to look for in a code review](https://google.github.io/eng-practices/review/reviewer/looking-for.html)

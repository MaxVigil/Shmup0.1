---
name: shmup-mvp-cross-system
description: Implement or review approved Shmup MVP work spanning Domain, Content, Boot, Shared Session State, mission boundaries, browser lifecycle, integration, or full-MVP hardening. Use for cross-system slices in this repository; do not use for isolated Base UI, isolated Combat mechanics, or Build-Tooling-only work.
---

# Shmup MVP Cross-System

Use this skill as a project router for behaviour that crosses Base and Combat or establishes their shared application foundation. It does not replace the canonical technical or product documents.

## Required sources

Before acting, read completely:

1. `AGENTS.md`;
2. `Project Documentation/MVP_MASTER_DESIGN_DOCUMENT_v0.1.md`;
3. `Project Documentation/MVP_GLOSSARY_v0.1.md`;
4. `Project Documentation/MVP_TECHNICAL_FOUNDATION_v0.1.md`;
5. `Project Documentation/MVP_REPOSITORY_ARCHITECTURE_v0.1.md`;
6. `Project Documentation/MVP_CODE_PRINCIPLES_v0.1.md`;
7. `Project Documentation/MVP_VERIFICATION_AND_QUALITY_GATES_v0.1.md`;
8. `Project Documentation/MVP_TRACEABILITY_MATRIX_v0.1.md`.

Also read:

- `MVP_BASE_AND_PRECOMBAT_SPEC_v0.1.md` when shared state, Boot, Mission Snapshot, Mission Result, Settings, or lifecycle affects Base;
- `MVP_COMBAT_SPEC_v0.1.md` when shared state, Mission Snapshot, Mission Result, Settings, lifecycle, RNG, or integration affects Combat;
- `MVP_DESIGN_SYSTEM_SPEC_v0.1.md` for Boot presentation, application shell, shared UI, or cross-Screen accessibility;
- `MVP_DELIVERY_SPEC_v0.1.md` for full-MVP hardening, production, assets, build, or release work;
- `MVP_NARRATIVE_RULES_v1.0.md` before changing player-facing names, copy, people, countries, factions, technologies, or localization.

Use source-qualified Acceptance Criteria.

## Use this skill for

- Domain and typed Content foundations shared by more than one subsystem;
- deterministic RNG and derived streams;
- Shared Session Store and application actions;
- Boot, initialization, bounded preload, and Fatal Startup coordination;
- Mission Snapshot creation and one-time Mission Result commitment;
- shared Settings and browser lifecycle coordination;
- Base-to-Combat and Combat-to-Base integration;
- cross-system cleanup, accessibility, performance, and final hardening.

Do not use this skill for a task that belongs entirely to `shmup-mvp-combat` or `shmup-mvp-base-precombat`. Build configuration, dependency, lint, test-runner, or governance-only work uses `AGENTS.md` and the canonical technical documents without a gameplay skill.

## Mandatory boundaries

- Implement only the explicitly assigned cross-system slice.
- Keep Domain independent from React, Phaser, DOM, browser, storage, network, wall-clock, and unseeded randomness APIs.
- Keep Shared Session State application-owned and mutate it only through named actions or reducers.
- Do not expose mutable store or simulation objects to presentation.
- Mission Snapshot is immutable; Mission Result commitment is idempotent and occurs exactly once.
- Use the approved FNV-1a/Mulberry32 stream contract and fixed test vectors.
- Keep Phaser behind the lazy Combat boundary.
- Do not introduce a second store, global event bus, generic service layer, persistence, backend, analytics, or speculative extension point.
- Preserve explicit setup/cleanup ownership across Boot, Base, Combat, browser lifecycle, and React Strict Mode.
- Treat performance as a gate in the slice that introduces the work.

## Composition rule

Load `shmup-mvp-combat` or `shmup-mvp-base-precombat` in addition only when the assigned slice materially implements behaviour inside that subsystem. Do not load both merely because shared types are referenced.

Generic skills remain optional technique references and are allowed only through `AGENTS.md`. They cannot define product behaviour or architecture.

## Completion

Confirm that state ownership, transition idempotency, deterministic behaviour, lifecycle cleanup, and affected source-qualified Acceptance Criteria are covered at the lowest reliable test layer. Run the required gates and record applicable browser, manual, or performance evidence. Stop rather than invent a missing cross-system rule.

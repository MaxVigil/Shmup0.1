---
name: shmup-mvp-cross-system
description: Implement or review approved Shmup work spanning Domain, Content, Boot, Shared Session State, mission boundaries, browser lifecycle, integration, or milestone hardening. Use for an assigned MVP Slice or approved post-MVP cross-system Epic; do not use for isolated Base UI, isolated Combat mechanics, or Build-Tooling-only work.
---

# Shmup Cross-System Router

Use this skill as a project router for behaviour that crosses Base and Combat or establishes their shared application foundation. It does not replace the canonical technical or product documents.

The historical `shmup-mvp-cross-system` ID remains stable for handoff compatibility. It also routes approved post-MVP work; it does not limit current scope to MVP implementation.

## Required sources

Apply the section-routed, revision-aware rule in `AGENTS.md` §2. Read this skill, `AGENTS.md`, and the active assignment completely. Then read:

1. every exact canonical section named by the assignment;
2. the minimum owner sections in each applicable `AGENTS.md` route;
3. affected Master and Base/Combat transition sections only for owners entered by the change;
4. affected Glossary entries when terminology changes or is uncertain;
5. affected Design System sections for shared UI or accessibility;
6. affected Delivery sections for production, assets, build, or release work;
7. Narrative Rules only for copy, localization, people, countries, factions, technologies, narrative content, or narrative-dependent assets;
8. the Traceability Matrix rows only when selecting, changing, or reporting source-qualified AC coverage.

If the diff enters another owner or AC, expand the route before editing. Do not load the complete Master, feature, technical, Design System, Narrative, or Delivery package merely because a shared type is referenced.

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

- Implement only the explicitly assigned cross-system Slice, Epic, or Work Item.
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

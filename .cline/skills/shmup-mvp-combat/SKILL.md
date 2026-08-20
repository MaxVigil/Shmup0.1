---
name: shmup-mvp-combat
description: Implement or review the approved Shmup MVP Combat Screen, deterministic simulation, enemies, weapons, collisions, controls, HUD, lifecycle, and Phaser presentation. Use for any Combat-related task in this repository; do not use for future combat design or unapproved mechanics.
---

# Shmup MVP Combat

Use this skill as a project router, not as an alternative combat design document.

## Required sources

Apply the revision-aware reading rule in `AGENTS.md` §2: a new agent session reads these sources completely; the same persistent session may reuse completely read, unchanged sources after checking revisions. Always reread the assigned Slice and changed normative sources.

Before acting, read completely:

1. `AGENTS.md`;
2. `Project Documentation/MVP_COMBAT_SPEC_v0.1.md`;
3. `Project Documentation/MVP_GLOSSARY_v0.1.md`;
4. `Project Documentation/MVP_TECHNICAL_FOUNDATION_v0.1.md`;
5. `Project Documentation/MVP_REPOSITORY_ARCHITECTURE_v0.1.md`;
6. `Project Documentation/MVP_CODE_PRINCIPLES_v0.1.md`;
7. `Project Documentation/MVP_VERIFICATION_AND_QUALITY_GATES_v0.1.md`;
8. `Project Documentation/MVP_DESIGN_SYSTEM_SPEC_v0.1.md` when the task affects presentation or HUD;
9. `Project Documentation/MVP_MASTER_DESIGN_DOCUMENT_v0.1.md` when the task affects mission entry, exit, shared state, Boot, or browser lifecycle.

Use the Traceability Matrix to identify relevant Acceptance Criteria.

## Mandatory boundaries

- Implement only the assigned Combat slice.
- Combat rules and authoritative state remain outside Phaser.
- Use fixed-step deterministic TypeScript simulation and project AABB rules.
- Never load or use Arcade Physics or Matter Physics.
- Phaser renders snapshots and forwards intent.
- Keep Phaser behind the lazy Combat import.
- Use separate deterministic RNG streams as specified.
- Use the application input router; do not bind product behaviour directly to raw keys in Domain code.
- Use only the approved `CombatHudBridge` for per-frame DOM HUD placement.
- Add cleanup for every Combat-owned listener, callback, scene, canvas, subscription, and bridge binding.
- Check the performance budget when adding per-frame work.

## Generic skill restrictions

The old `shmup v0.2` is not applicable: it assumes future buildcraft, enemy attacks, alien technology, extraction, Arcade Physics, and other unapproved scope.

Generic skills may explain an API or technique only when routed by `AGENTS.md`. Ignore any generic recommendation that changes product behaviour or architecture.

## Completion

Map the change to approved requirements and negative requirements. Run the required automated gates and record any mandatory manual or performance evidence. Report rather than invent unresolved behaviour.

---
name: shmup-mvp-combat
description: Implement or review approved Shmup Combat work, including deterministic simulation, enemies, weapons, collisions, controls, HUD, lifecycle, and Phaser presentation. Use for an assigned MVP Slice or approved post-MVP Combat Epic; do not use to invent future combat behaviour.
---

# Shmup MVP Combat

Use this skill as a project router, not as an alternative combat design document.

## Required sources

Apply the section-routed, revision-aware rule in `AGENTS.md` §2. Read this skill, `AGENTS.md`, and the active assignment completely. Then read:

1. every exact canonical section named by the assignment;
2. the minimum owner sections in the applicable `AGENTS.md` Combat route;
3. affected Glossary entries when terminology changes or is uncertain;
4. affected Design System sections for presentation or HUD;
5. affected Master transition sections for mission entry, exit, shared state, Boot, browser lifecycle, or whole-application performance;
6. the Traceability Matrix rows only when selecting, changing, or reporting AC coverage.

If the diff enters another owner or AC, expand the route before editing. Do not load the complete Combat, Master, Design System, or technical package merely because the task mentions Combat.

## Mandatory boundaries

- Implement only the assigned Combat Slice, Epic, or Work Item.
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

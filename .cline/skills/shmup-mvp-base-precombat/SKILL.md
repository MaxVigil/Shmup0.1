---
name: shmup-mvp-base-precombat
description: Implement or review approved Shmup Operations, Hangar, Repair, weapon selection, Base Navigation, Mission Details, Settings, and result flows. Use for an assigned MVP Slice or approved post-MVP Base Epic; do not use to invent future strategic-management systems.
---

# Shmup Base and Pre-Combat Router

Use this skill as a project router, not as a strategic-game design source.

The historical `shmup-mvp-base-precombat` ID remains stable for handoff compatibility. It also routes approved post-MVP work; it does not limit current scope to MVP implementation.

## Required sources

Apply the section-routed, revision-aware rule in `AGENTS.md` §2. Read this skill, `AGENTS.md`, and the active assignment completely. Then read:

1. every exact canonical section named by the assignment;
2. the minimum owner sections in the applicable `AGENTS.md` Base route;
3. affected Design System component, token, layout, and focus sections;
4. affected Glossary entries when terminology changes or is uncertain;
5. affected Master transition sections only for cross-system flow;
6. Narrative Rules only for copy, localization, people, countries, factions, technologies, narrative content, or narrative-dependent assets;
7. the Traceability Matrix rows only when selecting, changing, or reporting AC coverage.

If the diff enters another owner or AC, expand the route before editing. Do not load the complete Base, Master, Design System, Narrative, or technical package merely because the task mentions Base.

## Mandatory boundaries

- Implement only the assigned Base or pre-Combat Slice, Epic, or Work Item.
- Base Screens and Overlays are React DOM UI, not Phaser Scenes.
- Use the approved Shared Session Store and named application commands.
- Preserve pending-versus-confirmed Overlay behaviour and one-time state transitions.
- Use only approved Design Tokens and Design System components.
- Preserve native keyboard semantics, focus containment, restoration, and Screen-transition focus.
- Do not add persistence, save/load, profiles, research, manufacturing, buildings, personnel management, timers, campaign progression, or additional resources.
- Do not create future component variants before a real approved consumer exists.

## Generic skill restrictions

The old `strategic-base-management v0.2` is not applicable to MVP execution: it assumes research, engineering, manufacturing, personnel, scarcity, time, buildings, campaign progression, alien technology, and save systems.

`game-ui-ux` may be used only for general responsive/focus techniques that agree with the Design System specification. It does not authorize mobile, touch, gamepad, localization, safe-area, screen-stack, or additional settings scope.

## Completion

Map the change to approved requirements and negative requirements. Run the required automated gates and record applicable keyboard, visual, lifecycle, and performance evidence. Report rather than invent unresolved behaviour.

---
name: shmup-mvp-base-precombat
description: Implement or review the approved Shmup MVP Operations, Hangar, Repair, weapon selection, Base Navigation, Mission Details, Settings, and result flows. Use for any Base or pre-Combat task in this repository; do not use for future strategic-management systems.
---

# Shmup MVP Base and Pre-Combat

Use this skill as a project router, not as a strategic-game design source.

## Required sources

Before acting, read completely:

1. `AGENTS.md`;
2. `Project Documentation/MVP_BASE_AND_PRECOMBAT_SPEC_v0.1.md`;
3. `Project Documentation/MVP_DESIGN_SYSTEM_SPEC_v0.1.md`;
4. `Project Documentation/MVP_GLOSSARY_v0.1.md`;
5. `Project Documentation/MVP_MASTER_DESIGN_DOCUMENT_v0.1.md` for cross-system flow;
6. `Project Documentation/MVP_TECHNICAL_FOUNDATION_v0.1.md`;
7. `Project Documentation/MVP_REPOSITORY_ARCHITECTURE_v0.1.md`;
8. `Project Documentation/MVP_CODE_PRINCIPLES_v0.1.md`;
9. `Project Documentation/MVP_VERIFICATION_AND_QUALITY_GATES_v0.1.md`.

Read `MVP_NARRATIVE_RULES_v1.0.md` before changing player-facing names, copy, personnel, countries, factions, or technology references. Use the Traceability Matrix to identify relevant Acceptance Criteria.

## Mandatory boundaries

- Implement only the assigned Base or pre-Combat slice.
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

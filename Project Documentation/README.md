# Project Documentation

This directory is the single canonical location for Shmup product, architecture, and development-process documentation.

## Authority and language

- Repository files in this directory override ChatGPT attachments, exports, conversation copies, and agent summaries.
- An agent must use the current validated checkout. It must not follow an absolute path into another Shmup repository or worktree.
- `AGENTS.md` defines authority order, section-level context routing, work authorization, and the Canonical Language Policy.
- Canonical repository documentation is English. Player-facing localization is outside this rule.
- Do not maintain complete translated duplicates or condensed agent-authored requirement mirrors.
- A missing, conflicting, or stale referenced document is a blocker. Do not infer its contents.

The `MVP_` prefix identifies the accepted v0.1 baseline scope. It does not mean that the project is still in the MVP implementation stage. An unaffected MVP rule remains authoritative until a newer approved document explicitly supersedes it.

## Current cross-cutting contracts

These documents govern both accepted MVP behaviour and approved post-MVP work where applicable:

- `MVP_GLOSSARY_v0.1.md`
- `MVP_NARRATIVE_RULES_v1.0.md`
- `MVP_DESIGN_SYSTEM_SPEC_v0.1.md`
- `MVP_DELIVERY_SPEC_v0.1.md`
- `MVP_TECHNICAL_FOUNDATION_v0.1.md`
- `MVP_REPOSITORY_ARCHITECTURE_v0.1.md`
- `MVP_CODE_PRINCIPLES_v0.1.md`
- `MVP_VERIFICATION_AND_QUALITY_GATES_v0.1.md`
- `MVP_DEEPSEEK_GOVERNANCE_AND_SKILL_ROUTING_v0.1.md`

## Accepted MVP baseline contracts

These documents define the shipped v0.1 behaviour and its accepted coverage. Use only the sections that remain relevant to the assigned change:

- `MVP_MASTER_DESIGN_DOCUMENT_v0.1.md`
- `MVP_BASE_AND_PRECOMBAT_SPEC_v0.1.md`
- `MVP_COMBAT_SPEC_v0.1.md`
- `MVP_TRACEABILITY_MATRIX_v0.1.md`

## Post-MVP scope documents

- `SHMUP_V0.2_TACTICAL_COMBAT_FOUNDATION_SPECIFICATION.md` — approved canonical product contract for the v0.2 Tactical Combat Foundation Epic; ready only for bounded Work Item handoffs.
- `SHMUP_V0.2_IMPLEMENTATION_SLICES.md` — approved dependency order, ownership, acceptance boundaries, and DeepSeek handoff gates for v0.2 Work Items.
- `SHMUP_V0.2_RECOVERY_AND_READINESS_AUDIT.md` — recovery evidence, freshness audit, corrected blockers, and implementation-state report.
- `POST_MVP_ENEMY_TYPES_EPIC_READINESS_v0.1.md` — superseded historical preparation record. It does not authorize implementation.

A new post-MVP specification becomes canonical only when it is tracked in this directory, has an explicit approval/readiness state, and is added to this index in the same authorized change. A draft or untracked file never creates implementation authority.

## Historical delivery and process evidence

These records explain how the MVP was delivered. They are not standing task context unless an audit or legacy correction explicitly needs them:

- `MVP_IMPLEMENTATION_SLICES_v0.1.md` — completed `S01`–`S14` sequence and legacy handoff examples;
- `MVP_FINAL_TECHNICAL_AUDIT_v0.1.md` — final MVP readiness and implementation audit;
- `MVP_DEVELOPMENT_PROCESS_AUDIT_v1.0.md` — post-MVP process baseline and the changes implemented on 2026-08-24.

Standing workflow rules derived from these records now live in `AGENTS.md`, Code Principles, Verification and Quality Gates, and DeepSeek Governance. Do not load the historical records merely to recover a rule already present in those owners.

## Update rule

When an approved decision changes product behaviour, update together:

1. the authoritative feature or technical document;
2. related acceptance criteria;
3. `MVP_TRACEABILITY_MATRIX_v0.1.md` while it remains the active coverage map;
4. `MVP_MASTER_DESIGN_DOCUMENT_v0.1.md` when the cross-system or product boundary changes;
5. the Glossary or Narrative Rules when their domains change;
6. this index when a canonical document is added, superseded, reclassified, renamed, or removed.

Do not create a new durable document when an existing canonical owner can hold the decision without losing clarity.

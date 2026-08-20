# Project Documentation

This directory is the canonical location for current Shmup project documentation.

## Authority rule

- Files in `/Users/maximvigilev/Shmup0.1/Project Documentation/` are the authoritative local project copies.
- Future approved documentation changes must be written here in the same change that approves them.
- ChatGPT, Codex, attachment, export, and conversation copies are working mirrors and are not authoritative when they differ from this directory.
- DeepSeek and other implementation agents must read documents from this directory before planning or implementation.
- A missing, conflicting, or stale referenced document is a blocker. The agent must not infer its contents.

## Current approved product package

- `MVP_MASTER_DESIGN_DOCUMENT_v0.1.md`
- `MVP_BASE_AND_PRECOMBAT_SPEC_v0.1.md`
- `MVP_COMBAT_SPEC_v0.1.md`
- `MVP_DESIGN_SYSTEM_SPEC_v0.1.md`
- `MVP_DELIVERY_SPEC_v0.1.md`
- `MVP_GLOSSARY_v0.1.md`
- `MVP_TRACEABILITY_MATRIX_v0.1.md`
- `MVP_NARRATIVE_RULES_v1.0.md`
- `MVP_TECHNICAL_FOUNDATION_v0.1.md`
- `MVP_REPOSITORY_ARCHITECTURE_v0.1.md`
- `MVP_CODE_PRINCIPLES_v0.1.md`
- `MVP_VERIFICATION_AND_QUALITY_GATES_v0.1.md`
- `MVP_IMPLEMENTATION_SLICES_v0.1.md`
- `MVP_DEEPSEEK_GOVERNANCE_AND_SKILL_ROUTING_v0.1.md`
- `MVP_FINAL_TECHNICAL_AUDIT_v0.1.md`

## Current technical package

The architectural foundation and initial dependency matrix are approved in `MVP_TECHNICAL_FOUNDATION_v0.1.md`.

The repository structure and dependency boundaries are approved in `MVP_REPOSITORY_ARCHITECTURE_v0.1.md`.

Mandatory implementation and review rules are approved in `MVP_CODE_PRINCIPLES_v0.1.md`.

Repository commands and verification evidence rules are approved in `MVP_VERIFICATION_AND_QUALITY_GATES_v0.1.md`.

The fixed fourteen-Slice implementation sequence and Work Item rules are approved in `MVP_IMPLEMENTATION_SLICES_v0.1.md`.

Implementation-agent authority and skill routing are approved in `MVP_DEEPSEEK_GOVERNANCE_AND_SKILL_ROUTING_v0.1.md`.

All planned product, technical, and governance artifacts have been created and approved. `MVP_FINAL_TECHNICAL_AUDIT_v0.1.md` passed and authorizes feature implementation through explicitly scoped tasks.

## Update rule

When an approved decision changes product behaviour, update together:

1. the authoritative feature or technical document;
2. related acceptance criteria;
3. `MVP_TRACEABILITY_MATRIX_v0.1.md`;
4. `MVP_MASTER_DESIGN_DOCUMENT_v0.1.md` when scope or cross-system behaviour changes;
5. `MVP_GLOSSARY_v0.1.md` or `MVP_NARRATIVE_RULES_v1.0.md` when their domains change;
6. this index when a canonical document is added, renamed, superseded, or removed.

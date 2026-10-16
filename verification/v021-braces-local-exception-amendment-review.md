# V021-DEC-007 local braces exception — amendment review

**Date:** 2026-10-14

**Reviewer:** Independent acceptance reviewer

**Verdict:** Accepted

**Findings:** Zero S0–S2

## Reviewed material

- `Project Documentation/SHMUP_V0.2.1_COMBAT_PATCH_SPECIFICATION.md` — V021-DEC-007 and its scope and reassessment conditions.
- `Project Documentation/MVP_VERIFICATION_AND_QUALITY_GATES_v0.1.md` — §§12, 14 and 18.1.
- `Project Documentation/MVP_TECHNICAL_FOUNDATION_v0.1.md` — §15, including the 2026-10-14 status record.
- `verification/v021-patch-dev-dependency-audit-2026-10-13.md` — original audit and 2026-10-14 update.
- Consistency references: `AGENTS.md` §9; `Project Documentation/MVP_DEEPSEEK_GOVERNANCE_AND_SKILL_ROUTING_v0.1.md` §15.2; and v0.2 `V02-DEC-037` in `Project Documentation/SHMUP_V0.2_TACTICAL_COMBAT_FOUNDATION_SPECIFICATION.md` §22.2.

## Review result

V021-DEC-007 is a separate, bounded exception for exactly `GHSA-vfj7-8cjw-p6xm` / CVE-2026-93687 in the dev-only path `stylelint@17.14.1 > micromatch@4.0.8 > braces@3.0.3`, for local v0.2.1 patch acceptance only. It does not transfer or broaden V02-DEC-037. The whole-tree audit remains non-zero and must be reported as failed/excepted, never passed; the runtime audit must have zero findings. The amendment forbids audit suppression, overrides, forced downgrade, threshold changes, and relabeling. It requires both audits to be repeated on the final candidate, and reassessment when a fix or material advisory/path change appears and before external test-build or release claims. It authorizes no external test/release claim or patch acceptance.

The boundaries are consistent with AGENTS §9, Governance §15.2, Verification §§12, 14 and 18.1, and the v0.2-only scope of V02-DEC-037. The audit note's 2026-10-13 “decision pending” header describes its dated original snapshot; its separate 2026-10-14 update records the later decision and current candidate facts.

## Read-only audit corroboration

At review time, `npm audit` exited `1` with seven high affected package entries propagated from the single named advisory; `npm audit --omit=dev` exited `0` with zero findings; and `npm ls braces --all` showed only the named Stylelint → Micromatch → Braces path. These checks corroborate the current installed state only. They do not replace repeating both audits on the final frozen patch candidate.

This verdict accepts only the exact V021-DEC-007 amendment. It is not source implementation review, dependency-change acceptance, or v0.2.1 patch acceptance.

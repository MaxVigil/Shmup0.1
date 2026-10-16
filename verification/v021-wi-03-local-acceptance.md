# V021-WI-03 — Independent Local-Checkpoint Acceptance

Date: 2026-10-08. Reviewer: Codex (independent of the DeepSeek implementation).
Decision: **Accepted as the bounded WI-03 Hunter checkpoint**, not as v0.2.1
patch integration or release acceptance.

Candidate identity: Git HEAD
`87842417305ddbc1cd63fc5ec2c5d023e2250556` plus the WI-03 sealed source
fingerprint `4748684b` (`.agent-handoff/runs/attempt-8EfwIO/attempt.json`).
The candidate contains uncommitted WI-01 and WI-03 changes; HEAD alone does not
identify those bytes. This acceptance record is outside the source-fingerprint
input set and does not change the candidate code or tests.

- **Technical — Pass for the approved WI-03 route.** `npm run verify` passed
  (99 files / 1134 tests, format, lint, types and build); sealed
  `npm run verify:smoke` passed 19 ordinary-production tests. The independent
  reviewer inspected the Hunter simulation/rotated-AABB and prepared/fallback
  Phaser owners, the risk-linked regressions and 1280×600 rendered evidence,
  then ran the exact focused development-browser command from `control.json`:
  `npx playwright test e2e/combat-enemies.spec.ts --project=development`,
  **3/3 passed**. The implementation report's `1 passed` referred to its
  Hunter-only `-g` run, not to the exact three-test command; the reviewer run
  closes that evidence-label gap without a production change. The six-Hunter
  hot-path record is non-reference local evidence, not integrated FPS. The
  sealed production-smoke attempt has an independently verified SHA-256
  manifest at `.agent-handoff/runs/attempt-8EfwIO/sha256-manifest.txt`.
- **Product — Pass for this local Hunter checkpoint.** Maksym tested the
  isolated local dev preview on 2026-10-08 and reported that the Hunter now
  points its nose along movement and that the result is good. This is visual
  feedback, not proof of overall mission balance or patch readiness.
- **Release — Not applicable to this Work Item.** The current-build dense
  overlap/FPS claim, four historical `@release-evidence` cases, full patch
  integration, physical-device certification and external playtest remain at
  their named later owners. The diagnostic full production suite was 21/23;
  its two failures are not relabelled as passing by this verdict.

Known minor limitations: the implementation report lists the focused
three-test command beside its one-test filtered output, and the frozen
browser-spec comment cites an older centroid residual range. Both are
evidence-label/comment issues without a WI-03 player or architecture impact;
the observed range and bracketed method are recorded in the WI-03 evidence.
No commit, push, deployment or patch-level acceptance follows from this record.

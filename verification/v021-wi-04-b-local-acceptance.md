# V021-WI-04-B — Independent Local-Checkpoint Acceptance

Date: 2026-10-10. Reviewer: Codex, independent of the DeepSeek implementation.
Decision: **Accepted as the bounded WI-04-B committed-terminal-fade checkpoint**
under V021-AC-005 and V021-DEC-001. This is not v0.2.1 integration, release,
or performance acceptance.

Candidate identity: Git HEAD
`87842417305ddbc1cd63fc5ec2c5d023e2250556` plus source fingerprint
`83b9e370`. The worktree is dirty; HEAD alone does not identify the accepted
candidate. The six-gate `V021-WI-04-B` handoff validates with no blockers; its
sealed ordinary-production smoke is `.agent-handoff/runs/attempt-r3ir0m/attempt.json`
(`state: passed`, matching runId/fingerprint, 20 passed).

- **Technical — Pass for the approved WI-04-B route.** I inspected the
  application-owned fixed-step opacity and Defeat fade counter, commit-before-
  fade/result ordering, lifecycle safety latch, Phaser's shared opacity/removal
  for the named non-Aircraft surfaces, and direct regressions for exact
  Success/Evacuated/Defeat boundaries, Game Over, failed/rejected Retry Save,
  duplicate callbacks and focus-loss Resume. The submitted gates passed:
  `npm run verify` (100 files / 1148 tests and build), focused development
  browser 5/5, supported-input natural-Defeat production browser 1/1, and
  `npm run verify:smoke` (20 ordinary-production tests). No S0–S2 defect was
  found in this local scope. The natural-Defeat browser check is a coarse
  journey check; exact 15/30-step and per-surface claims rest on deterministic
  simulation and real-Phaser tests, not its polling interval.
- **Product — Pass for the approved contract, not a new feel verdict.** The
  implementation follows the Product Owner's 0.25-second Success and
  0.5-second Evacuation/Defeat fade decision: only frozen non-Aircraft Combat
  objects disappear; the Aircraft, HUD, result and economy retain their prior
  authority. No new Product Owner live-play observation of this checkpoint
  is claimed.
- **Release — Not applicable to WI-04-B.** The historical four
  `@release-evidence` cases, full `verify:isolated`, current-build
  dense-overlap FPS, long asset traversal and patch-level integration remain
  unpassed/deferred under the approved WI-04-only verification route. The
  95-enemy fade-cost sample is a labelled non-reference local observation,
  not an integrated FPS pass.

No commit, push, deployment, WI-02 implementation, or patch-level acceptance
follows from this verdict. WI-04-A and WI-04-B are locally accepted; the next
work must use its own authorized scope and handoff.

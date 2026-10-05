# P123 Process/Tooling Amendment — Independent Acceptance

Date: 2026-10-05. Baseline: `825a2f8b0ecfe1a79547479d85dd06b339507c5e`.

Author: primary Codex agent. Independent reviewer: `/root/review_p123`.
Verdict: **Accepted**, no remaining S0–S2 in this bounded amendment.
Current experiment/rollout status is owned only by Governance §15.

The reviewer independently inspected the diff, new tooling/tests and risk routing,
and reproduced negative cases before acceptance. Findings corrected before the
final verdict: no-control multi-record chain ownership mismatch; a final
fingerprint exception incorrectly sealing success; missing repository-local risk
tier definitions. The chain now fails before expensive work without a valid
current control, and any runner exception seals failure with an error stage.

## Verification evidence

- Final `npm run verify`: exit 0; format/lint/types, 98 unit files / **1118 tests**,
  production build. Existing large lazy-Combat chunk warning unchanged.
- Independent focused tooling checks: 3 files / **24 tests**, plus independent
  missing/stale-control and final-fingerprint-error probes; passed.
- Actual base-copy preflight: passed, 8,898 ms; isolated record
  `.agent-handoff/runs/attempt-9GJt0C/attempt.json` and `1.log`. Its recorded
  fingerprint `1e28adc6` predates adding the validator to the fingerprint input
  list; the historical copy/import/build path did not change afterward. It is
  preflight evidence, not a measurement under the later source fingerprint.
- Discovery: full production **23**; explicit smoke subset **19**; regular/Elite
  Pass A **2**; Elite Pass B **1**. No test removed from the full gate.
- Ordinary-production boundary smoke: **2/2**, 4.0 seconds (cold Operations and
  artifact hygiene). Temporary config under `.agent-handoff/process-review/`
  used ports 4183/4184 because the user's existing server occupied 4173; it was
  not stopped. No workload/timing thresholds were measured or changed.
- Accepted D05 archive SHA-256 manifest: **30/30 unchanged**.
- `context:validate`, `git diff --check`: passed. `src/` and lockfile unchanged.
- Three skill routers: YAML/name/description and P123 routing checked using the
  existing `js-yaml` parser. Skill Creator's Python validator could not start
  because PyYAML was unavailable in both checked Python environments; no package
  was installed. The fallback checks are not reported as that script passing.

The independent reviewer accepted these proportionate gates under Verification
§18.1. No full `verify:all`, fresh performance numbers, physical-device result,
trial outcome, commit, push, merge, tag or deployment is implied. The first two
v0.3 Work Items remain unassigned. The six preexisting untracked diagnostic
scripts were preserved and are not part of the amendment.

Candidate binding: companion `p123-amendment-sha256.json` records the final file
bytes, including the factual activation-status update after the independent
verdict. Neither that manifest nor this acceptance note is included in its own
hash set. Subsequent substantive changes require affected checks and review.

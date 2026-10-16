# V021-WI-04-A — Independent Local-Checkpoint Acceptance

Date: 2026-10-09. Reviewer: Codex, independent of the DeepSeek implementation.
Decision: **Accepted as the bounded WI-04-A projectile-presentation checkpoint**
under V021-AC-004 and V021-DEC-002. This is not WI-04-B, v0.2.1 patch
integration, or release acceptance.

Candidate identity: Git HEAD
`87842417305ddbc1cd63fc5ec2c5d023e2250556` plus the sealed WI-04-A-C02
source fingerprint `c28cc864` in
`.agent-handoff/runs/attempt-dexfnG/attempt.json`. HEAD alone does not identify
the uncommitted candidate. This acceptance record is outside the source
fingerprint input set and changes no product code or test.

- **Technical — Pass for the approved WI-04-A route.** The reviewer inspected
  the circle draw call, authoritative AABB/centre ownership, the real-Phaser
  regressions, native-pixel acceptance/counter-cases, two mutation runs, and
  prepared/fallback 1280×600 captures. The C02 result validates with no blocker.
  The frozen candidate passed `npm run verify` (100 files / 1139 tests,
  formatting, lint, types and build) and a sealed `npm run verify:smoke`
  (19 ordinary-production tests). The reviewer independently ran the exact
  focused development-browser command from C02 control,
  `npx playwright test e2e/combat-projectiles.spec.ts --project=development`:
  5/5 passed on the same 40-entry working tree. Both non-Core enemy projectiles
  render the approved circle; gameplay AABBs, Core diamond and player teardrops
  remain unchanged. No S0–S2 defect was found in this local scope.
- **Product — Pass for this local visual checkpoint.** Maksym requested round
  red Ranged and Elite-cannon projectiles, reviewed the fresh local candidate
  after C02, and replied “Супер” on 2026-10-09. This is approval of the local
  visual result, not of overall mission balance or the patch.
- **Release — Not applicable to WI-04-A.** The historical `@release-evidence`
  cases, full `verify:isolated`, current-build dense-overlap FPS, long asset
  traversal, physical-device certification and patch integration remain with
  patch stabilization. A smoke subset is not a full production-suite pass.

Evidence caveats: the browser observation uses enemy bounds to attribute red
clusters to Ranged versus Elite cannon, so it cannot alone prove each kind; the
direct real-Phaser regressions provide per-kind proof. The calibration rejects
the superseded ellipses/rectangles at every tested alignment, but one of eight
sub-pixel alignments of a genuine circle was not accepted by the classifier.
The implementation report's stronger “every alignment accepted” claim is
therefore inaccurate; the focused live captures and reviewer run both passed,
and the approved AC does not require recognition at every alignment. Preserve
that raw calibration output and do not cite the stronger claim. A stale
presentation-config comment calls these projectiles rectangles; it changes no
behaviour and is assigned to patch-stabilization documentation cleanup.

No commit, push, deployment, WI-04-B implementation, or patch-level acceptance
follows from this verdict. WI-04-B may now be assigned under its own control.

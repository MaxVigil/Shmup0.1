# Shmup v0.2.1 Combat Intensity and Readability Patch

**Status:** WI-01, WI-02, WI-03, WI-04-A/B and WI-05 have independent **local-checkpoint** verdicts under `verification/`; none is patch integration or release acceptance. On 2026-10-10 the Product Owner approved the exact Mission 03 schedule, six in-phase Elite Cores and a separate destruction-VFX Work Item (V021-DEC-003–005). The bounded WI-02 route passed independent amendment review and its corrected implementation was accepted locally on 2026-10-12. The corrected WI-05 effect was accepted locally on 2026-10-13 at fingerprint `a000d2be`; see `verification/v021-wi-05-local-acceptance.md` for evidence limits. On 2026-10-13 the Product Owner also accepted the current Mission 03 candidate without a new full manual playthrough and approved the narrow local patch-stabilization route in V021-DEC-006; that governance amendment passed independent review (`verification/v021-patch-route-amendment-acceptance.md`). The historical failed `@release-evidence` attempts remain failed. V021-DEC-008 passed independent amendment review on 2026-10-15; its bounded ordinary-production sample was independently accepted at fingerprint `7cb6cd22`. Final technical local integration was accepted on 2026-10-16 with the exact V021-DEC-007 exception; see `verification/v021-final-local-integration-review.md`. **Accepted as a locally complete v0.2.1 patch by the Product Owner on 2026-10-17 with the existing V021-DEC-007 exception** (`verification/v021-local-product-acceptance.md`). External release and physical-device certification remain separate.
**Baseline:** accepted v0.2.0 product revision `825a2f8b0ecfe1a79547479d85dd06b339507c5e`; implementation branches from `main` revision `87842417305ddbc1cd63fc5ec2c5d023e2250556`.
**Risk:** R2 gameplay, presentation, collision, content, and terminal-lifecycle change. Local development/evaluation only.

## 1. Authority, outcome, and boundaries

This document owns only the v0.2.1 deltas below. The accepted v0.2 specification and all unaffected decisions remain in force. The changed contracts are v0.2 §§7–9 (authored arrivals, regular-enemy scale, Hunter committed movement, and later Elite attack cadence), §§9.2/9.4 and 10 (projectile presentation), §§13.3–13.5 (post-commit visual exit), and §16.1 (Hunter orientation only), plus MVP Combat §8.5 / AC-024 (enemy-destruction presentation only). It supersedes the corresponding clauses of `V02-AC-003`, `V02-AC-007`, `V02-AC-010`, `V02-AC-015`, and `V02-AC-023` only where stated. It does not retroactively change v0.2.0 acceptance or evidence.

**Player outcome:** all three missions have more continuous, readable regular-enemy pressure without shortening their major authored beats. A Hunter corrects its committed attack briefly and visibly points its nose along its movement. Projectile silhouettes are readable by shape. All frozen non-Aircraft Combat entities fade after an authoritative committed terminal result.

**Tuning status:** the first `2×`-total/small-group candidate was rejected as boring. The Product Owner's second natural Mission 01 test found the 398-enemy block candidate much more interesting, then requested a 10–15% count reduction without reducing formation-start frequency and more Basic-screened Ranged blocks. The current §2.1 target is exactly **348 regulars** (`286 B / 52 R / 10 H`, 26 unchanged starts, maximum start gap `8 s`). Mission 02's new §2.2 target is **480 regulars** (`352 B / 100 R / 28 H`, 35 starts, maximum gap `8 s`): its `04:20` duration makes the total about `38%` greater than Mission 01 while keeping roughly the same regular enemies per minute. The Product Owner explicitly approved these totals, the role distributions, and the 4/6-Hunter wave pattern on 2026-10-06. These are local tuning candidates, not accepted balance. The `1.5×` width and height for Basic, Ranged, and Hunter remain approved. Clearing every block before the next is not required; manoeuvring and survival are part of the test. No performance, terminal, or acceptance gate is waived.

**Out of scope for the Mission 01/02 handoff:** Mission 03 staging and Elite attack implementation, additional Elite enemies, new enemy/weapon types, altered enemy speed or damage, Hull, player fire cadence, weapon speed, reward/Repair formula, mission unlock, persistence schema, new image assets, dependency changes, dynamic difficulty, screen shake, trails, glow, or deployment. The separately approved later Elite cadence is specified in §3.1, not assigned to the Mission 01/02 agent. The intended pre-Elite recovery window of v0.2 Mission 03 is removed by the Product Owner's explicit decision; no regular enemy is auto-destroyed or despawned to stage the Elite.

## 2. Authored arrival authority

§§2.1–2.3 are the current approved authored-content candidates. The former small-group Mission 03 pilot is rejected history; §2.3 is its exact replacement for WI-02. Every active authored row is explicit content, never a runtime interval generator or reactive formation algorithm. No authored timing, side, role, composition, or placement reads Aircraft position, Hull, loadout, score, or performance. The superseded 398-enemy Mission 01 pilot remains human-feedback evidence, not implementation authority.

### 2.1 Interception 01 — approved revised local candidate

Replace the superseded 398-enemy Mission 01 staging, not append to it. Preserve its exact 26 formation-start times and five stable Encounter identities: e1 `00:04`, e2 `00:55`, e3 `01:40`, e4 `02:20`, e5 `03:08.70`. The final **member** still arrives at Countdown `03:10`. The first Ranged member now appears at `00:56.30`: Basic rows enter at `00:55` and `00:55.65` before its screened Ranged row. Hunter first appears at `01:40`. All five Encounter `formation` values are `authored-stagger`; no old Mission 01 `roleDelays` remain. e1/e2 have fixed `top` entry; e3/e4/e5 have `unspecified` encounter entry because their member rows combine Top and both fixed Sides. Every mixed Hunter block enters one fixed upper-left and one fixed upper-right Hunter, ordered left then right, at `Y = 0.20 VH`; these placements consume no seeded-side draw.

Every template below is a single player-perceived formation, authored as ordered fixed-step Arrival Groups. Row starts are `0`, `0.65`, `1.30`, and where present `1.95 s` after the listed start (`39` fixed steps between rows). Each Top row lists members left to right. `B` = Basic; `R` = Ranged; `H-L/H-R` = Hunter at fixed upper-left/upper-right. Four-column Top fractions inside the current Aircraft engagement band are `[0.32, 0.44, 0.56, 0.68]`; six-column fractions are `[0.25, 0.35, 0.45, 0.55, 0.65, 0.75]`. Reuse the complete current `1.5×` enemy bounds and the existing Top projection; no spawn is clamped into another column or placed on top of another member.

A pure content-construction helper may expand these **explicit** 26 authored
start/template entries into immutable ordered rows; the production validator
must check the fully expanded exact projection. Do not derive extra start times
from an interval loop, spawn reactively, or give the Combat runtime a new
formation generator.

The screened rows are ordered **front Basic first, rear Ranged later**. Basic moves downward at `0.12 VH/s` and Ranged at `0.09 VH/s`, so an earlier Basic row stays ahead rather than visibly overtaking a Ranged row that appeared first. This changes authored entry order only: do not alter either speed, hitbox, fire rule, or damage. `BR12` and `BR18` also keep Basic members at both flanks of the rear mixed row, exactly as approved by the Product Owner.

| Template | Ordered rows at successive `0.65 s` offsets | Total |
| --- | --- | --- |
| `B16` | `4B / 4B / 4B / 4B` | 16 Basic |
| `B12` | `4B / 4B / 4B` | 12 Basic |
| `BR12` | `4B / 4B / (B, R, R, B)` | 10 Basic + 2 Ranged |
| `BR18` | `6B / 6B / (B, R, R, R, R, B)` | 14 Basic + 4 Ranged |
| `BRH14` | `(4B + H-L + H-R) / 4B / 4R` | 8 Basic + 4 Ranged + 2 Hunter |

| Parent | Formation start (Mission Clock) | Template |
| --- | --- | --- |
| e1 | `00:04` | `B16` |
| e1 | `00:10`, `00:18`, `00:26`, `00:34` | `B12` at each |
| e1 | `00:42` | `B16` |
| e1 | `00:50` | `B12` |
| e2 | `00:55`, `01:03`, `01:11`, `01:19` | `BR12` at each |
| e2 | `01:27` | `B12` |
| e2 | `01:35` | `BR12` |
| e3 | `01:40` | `BRH14` |
| e3 | `01:48` | `BR18` |
| e3 | `01:56` | `BR12` |
| e3 | `02:04` | `BRH14` |
| e3 | `02:12` | `BR12` |
| e4 | `02:20` | `BR12` |
| e4 | `02:27` | `BRH14` |
| e4 | `02:34` | `BR18` |
| e4 | `02:41` | `BR12` |
| e4 | `02:48` | `BRH14` |
| e4 | `02:55` | `BR18` |
| e4 | `03:02` | `BR12` |
| e5 | `03:08.70` | `BRH14` — third row at `03:10` |

This is **26 formations, 348 regular enemies: 286 Basic + 52 Ranged + 10 Hunter**, a `12.56%` decrease from the 398-enemy preview. There are `2×B16`, `6×B12`, `10×BR12`, `3×BR18`, and `5×BRH14`; 18 of 26 formations include Ranged. The first start is `00:04`; the maximum gap between formation starts is `8 s`, and every creation event contains at least four regular enemies. The original five Encounter IDs and the `03:10` final Countdown step remain. No singletons, two-member waves, dynamic spawn, automatic cleanup, or altered mission duration are allowed. Rows within one formation may overlap with the next; no enemy is deleted to create artificial breathing room. This is a candidate for another natural local feel test, not assumed balance.

### 2.2 Interception 02 — approved authored local candidate

Replace the accepted-v0.2 six small Encounters' staging, and do not append the rejected first patch pilot. Retain the six stable Encounter IDs, the first five major start anchors `00:10`, `00:50`, `01:40`, `02:30`, `03:20`, and the final **member** at `04:20`. The sixth Encounter begins at `04:04` (`244 s`) so its last screened Ranged row arrives at `04:20`; Combat Countdown and mission duration do not change. Ranged first appears at `00:51.30`, behind two Basic rows; Hunter first appears at `02:00`. e1/e2 use fixed Top encounter entry; e3–e6 use `unspecified` because their staged rows combine Top and fixed Sides. All six Encounter `formation` values are `authored-stagger` and old role delays are removed.

Every formation below is explicit authored content. As in §2.1, row offsets are `0`, `0.65`, `1.30`, and where needed `1.95 s` (`39` fixed steps apart). Four-column Top fractions are `[0.32, 0.44, 0.56, 0.68]`; six-column fractions are `[0.25, 0.35, 0.45, 0.55, 0.65, 0.75]`. Within a row, order Top members left-to-right, then left-side Hunters by ascending `Y`, then right-side Hunters by ascending `Y`. `H4` means two fixed Hunters per side at `Y = 0.15, 0.25 VH`; `H6` means three per side at `Y = 0.10, 0.20, 0.30 VH`. All 4 or 6 Hunters of one side-wave are created on the **same fixed step**, without shared-position overlap at `1280 × 600`. The sides are symmetric, not a seed-selected single flank. Thus the superseded Mission 02 `V02-DEC-026` three binary side draws are no longer consumed by this mission; no phantom `mission-data` draws are retained. Mission 03 likewise consumes no seeded-side draws under V021-DEC-003 in §2.3.

`R4` rows are always behind earlier Basic rows. Do not alter Basic/Ranged movement speeds to achieve screening. The names here are Mission 02-local (`R4-12` is deliberately not Mission 01's `BR12`); a pure content-construction helper may expand only the 35 explicit start/template entries. The validator must inspect the fully expanded exact projection, not just the listed totals.

| Mission 02 template | Ordered rows at successive `0.65 s` offsets | Total |
| --- | --- | --- |
| `B16` | `4B / 4B / 4B / 4B` | 16 Basic |
| `R4-12` | `4B / 4B / 4R` | 8 Basic + 4 Ranged |
| `R4-16` | `4B / 4B / 4B / 4R` | 12 Basic + 4 Ranged |
| `H4-12` | `(4B + H4) / 4B` | 8 Basic + 4 Hunter |
| `RH6-16` | `(6B + H6) / 4R` | 6 Basic + 4 Ranged + 6 Hunter |

| Parent | Formation start (Mission Clock) | Template |
| --- | --- | --- |
| e1 | `00:10`, `00:18`, `00:26`, `00:34`, `00:42` | `B16` at each |
| e2 | `00:50` | `R4-12` |
| e2 | `00:57` | `R4-16` |
| e2 | `01:04` | `R4-12` |
| e2 | `01:11` | `R4-16` |
| e2 | `01:18` | `R4-12` |
| e2 | `01:25` | `R4-16` |
| e2 | `01:32` | `R4-12` |
| e3 | `01:40` | `R4-16` |
| e3 | `01:47` | `R4-12` |
| e3 | `01:54` | `R4-16` |
| e3 | `02:00` | `H4-12` |
| e3 | `02:08` | `R4-12` |
| e3 | `02:15` | `R4-16` |
| e3 | `02:22` | `R4-12` |
| e4 | `02:30` | `H4-12` |
| e4 | `02:37` | `R4-12` |
| e4 | `02:44` | `RH6-16` |
| e4 | `02:51` | `R4-12` |
| e4 | `02:58` | `R4-16` |
| e4 | `03:05` | `H4-12` |
| e4 | `03:12` | `R4-12` |
| e5 | `03:20`, `03:27`, `03:34` | `R4-12` at each |
| e5 | `03:42` | `H4-12` |
| e5 | `03:49` | `R4-12` |
| e5 | `03:56` | `B16` |
| e6 | `04:04` | `RH6-16` |
| e6 | `04:11`, `04:18.70` | `R4-12` at each; last Ranged row at `04:20` |

This is **35 formations, 480 regular enemies: 352 Basic + 100 Ranged + 28 Hunter**. The exact template counts are `6×B16`, `16×R4-12`, `7×R4-16`, `4×H4-12`, and `2×RH6-16`; Ranged occurs in 25 formations. The six fixed, simultaneous side-Hunter waves contain `4, 4, 6, 4, 4, 6` Hunters at `02:00`, `02:30`, `02:44`, `03:05`, `03:42`, `04:04`. The maximum gap between formation starts is `8 s`; every creation event has at least four members. No one/two-member filler, reactive spawn, dynamic difficulty, new side draw, artificial rest, or altered clock is authorized. Its roughly Mission-01-like regular enemies per minute is a design target, not proof of fair difficulty; it requires a natural local Mission 02 feel test.

### 2.3 Interception 03 — approved authored candidate for WI-02

**DECISION V021-DEC-003 (2026-10-10, Product Owner approved):** replace the
rejected first small-group Mission 03 schedule, not append to it. Retain the
eight stable Encounter IDs `interception-03-e1` through `-e8`; e1–e7 own the
regular formations below, and e8 creates exactly one Elite alone at `05:20`.
The Elite remains the last **authored arrival**, not necessarily the last enemy
destroyed. Success still requires the Elite to be destroyed and every regular
enemy to be Destroyed or Escaped. No regular is auto-destroyed/despawned on
Elite arrival or death; no artificial break, extra award, penalty, or changed
mission duration is introduced. This decision supersedes the Mission 03
regular schedule and its three seeded-side draws in V02-DEC-032, but preserves
its exact Elite Top `0.50` arrival and all unaffected entry rules.

Each template is explicit ordered Arrival Groups; rows after the first start at
`+0.65 s` and `+1.30 s` where present (39 fixed steps apart). A four-member Top
row uses ordered band fractions `[0.32, 0.44, 0.56, 0.68]`; a six-member Top row
uses `[0.25, 0.35, 0.45, 0.55, 0.65, 0.75]`. `H4` creates two Hunters per fixed
side at `Y = 0.15, 0.25 VH`; `H6` creates three per fixed side at
`Y = 0.10, 0.20, 0.30 VH`. Within one group, order Top members left-to-right,
then left-side Hunters by ascending Y, then right-side Hunters by ascending Y.
All Hunters in one side-wave are created on the same fixed step. These symmetric
fixed sides consume **zero** `mission-data` side-selection draws; do not retain
phantom draws from the superseded schedule. Ranged rows enter after Basic rows
and do not require a speed change to appear screened.

| Mission 03 template | Ordered rows | Total |
| --- | --- | --- |
| `B12` | `4B / 4B / 4B` | 12 Basic |
| `BR12` | `4B / 4B / 4R` | 8 Basic + 4 Ranged |
| `H4-12` | `(4B + H4) / 4B` | 8 Basic + 4 Hunter |
| `RH6-16` | `(6B + H6) / 4R` | 6 Basic + 4 Ranged + 6 Hunter |

| Parent | Formation start (Mission Clock) | Template |
| --- | --- | --- |
| e1 | `00:10`, `00:26`, `00:42` | `BR12` at each |
| e1 | `00:18`, `00:34`, `00:50` | `B12` at each |
| e2 | `00:55`, `01:02`, `01:09`, `01:16`, `01:23` | `BR12` at each |
| e2 | `01:30` | `B12` |
| e3 | `01:35` | `RH6-16` |
| e3 | `01:43`, `01:51`, `01:59` | `BR12` at each |
| e3 | `02:07` | `H4-12` |
| e3 | `02:15` | `B12` |
| e4 | `02:20`, `02:27`, `02:48`, `02:55` | `BR12` at each |
| e4 | `02:34` | `B12` |
| e4 | `02:41` | `H4-12` |
| e4 | `03:02` | `RH6-16` |
| e5 | `03:10`, `03:34`, `03:42` | `BR12` at each |
| e5 | `03:18` | `B12` |
| e5 | `03:26`, `03:50` | `RH6-16` at each |
| e6 | `03:55`, `04:16`, `04:23` | `BR12` at each |
| e6 | `04:02` | `B12` |
| e6 | `04:09` | `H4-12` |
| e6 | `04:30` | `RH6-16` |
| e7 | `04:35`, `04:49`, `04:56`, `05:03`, `05:18` | `BR12` at each |
| e7 | `04:42` | `B12` |
| e7 | `05:10` | `RH6-16` |
| e8 | `05:20` | one Elite, Top `0.50`, no later offset |

Expand the grouped table entries in ascending start-time order within each
Encounter; their grouped display does not reorder the authored runtime events.
The exact projection is **44 regular formations: 9×B12, 26×BR12,
3×H4-12, 6×RH6-16**, totalling **376 Basic + 128 Ranged + 48 Hunter = 552
regulars**, exactly 15% above Mission 02's 480, plus one Elite. Ranged occurs
in 32 formations and Hunters in nine fixed-side waves. The first Ranged member
arrives at `00:11.30`; the first Hunters at `01:35`; the last regular Ranged row
at `05:19.30`, only `0.70 s` before the Elite's separate `05:20` step. The
maximum gap between regular formation starts is `8 s`; every regular creation
event has at least four members. Regulars still active at `05:20` remain and
overlap the Elite. The exact-content validator must inspect the expanded
ordered groups/members, totals, placements, row offsets, zero side draws,
Encounter ownership, final regular/Elite steps and unchanged payout arithmetic;
totals alone are insufficient. No reactive spawn or interval generator is
authorized. The earlier `26 Basic / 8 Ranged / 6 Hunter` first pilot is
rejected historical context, not a current content source.

Mission 01 and Mission 02 retain their `03:10` and `04:20` final Combat
Countdown steps and Success conditions. Their final Encounters start at
`03:08.70` and `04:04` respectively; the encounter resolver derives
`finalArrivalTimeSeconds` and `finalArrivalStepIndex` from the **latest authored
Arrival Group step**, not merely the final Encounter start. Mission 03 retains
its `05:20` Elite arrival and final Countdown step under §2.3. The exact-content
validator for the changed missions must reject omitted/reordered formations, rows or members, an
individual creation event below four regulars, wrong fixed side/Y, non-39-step
row spacing, changed first role time, a gap above `8 s`, wrong totals or reward
arithmetic, a post-final creation, or a changed final Countdown step.
Evacuation's five-second commitment continues to spawn authored groups
normally. Accepted-v0.2 and rejected-pilot projections remain historical
evidence, never the current validator target.

## 3. Geometry and Hunter behaviour

Regular Basic, Ranged, and Hunter complete rendered width and height each multiply by `1.5` at every supported viewport; complete rendered area therefore multiplies by `2.25`. Preserve each prepared PNG's aspect ratio. The prepared PNG and procedural fallback retain identical configured centre, complete bounds, and orientation. The simulation-owned AABB equals the complete current rendered bounds; spawn placement, full-bounds activation, collision, escape, resize, and muzzle geometry derive from those bounds. Do not merely scale Phaser images around unchanged hitboxes. Elite Armoured/Vulnerable geometry and image bytes are unchanged.

The existing content field is an **area** ratio, not a linear scale. Its first-candidate values are Basic `1 → 2.25`, Ranged `1.2 → 2.7`, and Hunter `0.8 → 1.8`; do not multiply this field by `1.5` or change the Elite's `2.45`.

Hunter Side Entry still moves inward at `18% VH/s` and does not target until its complete current bounds first enter the viewport. `Approach` still targets the Aircraft's current centre without lead and uses the existing `35% VH` or `2.0 s` commitment condition. On the commitment step speed is `26% VH/s`. During the first **60 executed fixed steps** of `Committed Attack Run`, counting the commitment step, steer toward the Aircraft's current centre along the shortest signed turn by at most **`25°/s`** (`25/60°` per fixed step), unless the Aircraft is behind the Hunter's current travel direction. At **non-zero** centre-to-centre distance, "behind" means the dot product of the current unit travel vector and the vector from Hunter centre to Aircraft centre is `<= 0`. Once behind, steering ceases permanently for that Hunter. After 60 committed steps, direction is locked. No predictive lead, reversal/U-turn, reacquisition, speed change, damage change, or extra attack phase. Paused/hidden time does not consume these steps. At exactly zero centre-to-centre distance, retain the current heading for that step **without** setting the permanent behind latch; a later non-zero target remains eligible during the 60-step window. Exact opposite heading never authorizes a U-turn. This zero-distance precedence was explicitly approved by the Product Owner on 2026-10-07.

The Hunter's nose points along its actual simulation movement vector during Side Entry, Approach, and Committed Attack Run. Rotate both the prepared image and procedural fallback around their configured centre, without a separate presentation-owned heading. Its axis-aligned collision and visibility bounds enclose the complete rotated rendered rectangle at the new scale and update deterministically with heading and resize. Preserve identical gameplay with prepared and fallback assets. No other enemy rotates.

### 3.1 Mission 03 Elite attack — approved for WI-02

**DECISION V021-DEC-004 (2026-10-10, Product Owner approved):** every newly
entered `Armoured` phase starts a fresh **45-step** cannon timer (`0.75 s`),
halving the accepted v0.2 90-step interval. The first pair fires on the 45th
executed Armoured step after activation; subsequent pairs fire every 45 steps
while Armoured. The existing phase-boundary rule suppresses an old-phase shot
due on the same step, so a complete 720-step Armoured phase fires pairs on
steps `45, 90, …, 675`, never on the step-720 boundary.

Every newly entered six-second `Vulnerable` phase starts a fresh **30-step**
first-Core timer. Its six sequential launches are on executed Vulnerable steps
**`30, 90, 150, 210, 270, 330`** after the transition (`0.5, 1.5, 2.5, 3.5,
4.5, 5.5 s`); the transition step itself does not decrement the timer or fire.
The 360-step phase boundary suppresses an old-phase attack, so there is no
boundary or burst shot. The active homing-Core cap is **six** rather than two;
when capacity is genuinely full on a due step, preserve the accepted hold-at-
zero and first-available-step rule without firing in Armoured. Paused/hidden
time consumes no timer steps. Existing Cores/cannon projectiles retain their
normal lifecycle across phase changes. Elite phase lengths, projectile damage,
speed/turn/lifetime, movement, activation, geometry, and exactly-one-Elite rule
do not change. Verify the first, sixth, boundary, repeated-phase, cap and
terminal-freeze counter-cases at the deterministic owner; do not infer an
additional projectile or player-damage change from the new cadence.

## 4. Projectile silhouettes and committed terminal fade

Presentation only: Ranged red projectiles and Elite cannon red projectiles become **filled red circles**. Both circles are centred on their existing authoritative projectile centres; each diameter equals the **longer side of that projectile's unchanged authoritative AABB** (at `1280 × 600`, `7.2 px` for each). The pale-cyan Elite homing Core remains its current diamond. Machine Gun and Cannon share one filled teardrop silhouette, pointed at the leading/upward edge and rounded at the trailing edge; its extrema still touch its existing authoritative AABB. Projectile width, height, speed, lifetime, collision, damage, order, and single-hit removal do not change. No outline, glow, trail, particle, or extra asset/request is added. Verify actual readability at `1280 × 600`, including prepared and fallback enemy contexts; a visual that is indistinguishable from the old rectangle or ellipse is not accepted merely because its geometry code changed.

**DECISION V021-DEC-002 — red enemy projectile circles (2026-10-09, Product Owner approved after live local review).** The former horizontal Ranged and vertical Elite-cannon ellipses are rejected for WI-04-A; this circle contract supersedes only those two visuals. Do not make their hitboxes square or change any simulation rule to fit the picture. Because the existing AABBs are `7.2 × 3.6 px` and `3.6 × 7.2 px` at the minimum viewport, a `7.2 px` circle extends `1.8 px` beyond each shorter side while the AABB's four corners lie approximately `0.42 px` outside the ideal circle. This small, explicit visual/collision mismatch is accepted for this presentation-only checkpoint; do not claim the visual fully encloses the collision AABB. The Core and both player teardrops are unchanged.

After an exact-attempt terminal result is **durably committed**, freeze gameplay and fade every remaining non-Aircraft Combat entity: regular/Elite enemies, player and enemy projectiles, and transient hit/deflection feedback. Do not fade Aircraft, Combat background, HUD, controls, blocking recovery UI, or result UI. Keep the immutable terminal/economy payload untouched; fade is presentation exposure, not enemy escape, collision, damage, reward, or entity-state mutation. At zero opacity, visual objects are removed and cannot reappear on later frames or resize.

| Terminal | Fade | Continuation |
| --- | --- | --- |
| Success | exactly `15` running fixed steps (`0.25 s`) | Concurrent with the existing `30`-step Aircraft centring; upward flight/result timing otherwise unchanged. |
| Evacuated | exactly `30` running fixed steps (`0.5 s`) | Concurrent with existing `30`-step Aircraft centring; extend the existing fade to player projectiles and transient feedback. |
| Defeat, including Game Over | exactly `30` running fixed steps (`0.5 s`) | Aircraft does not centre or fly up; committed result/Game Over presentation waits until fade completes. |

Pending, failed, rejected, or inert terminal writes do not begin a fade. Save Error/Save Conflict and exact-payload Retry/Reload behaviour remain authoritative. Browser-safety pause stops fade time without changing its progress; no auto-resume, duplicate result, extra write, or terminal swap. Defeat priority over Success/Evacuation and terminal idempotency are unchanged.

**DECISION V021-DEC-001 — Defeat fade browser-safety continuation (2026-10-08, Product Owner approved).** Reuse the existing application-owned Resume-only `terminal-exit-pause` for committed Defeat/Game Over while its 30-step fade is pending. On hidden-tab or focus loss before Result/Game Over presentation, freeze the remaining fade steps and hold that Resume-only state. Return of focus never resumes automatically. Only explicit `Resume` clears the latch and permits the remaining running fixed steps; present the immutable Result/Game Over exactly once only after the fade reaches zero opacity. Repeated safety events, resize, stale/duplicate terminal callbacks, and a committed retry must not restart the fade, alter its payload, or expose Result/Game Over early. If the terminal write has not committed, keep the existing Save Error/Save Conflict and browser-safety rules and do not start a fade. The alternative of auto-finishing or presenting Defeat while hidden was rejected because it would bypass the established explicit-Resume safety contract. This decision changes only post-commit visual continuation, not Defeat priority, repair/economy, durability, or Aircraft movement. Related criterion: V021-AC-005.

### 4.1 Enemy destruction feedback — approved separate WI-05

**DECISION V021-DEC-005 (2026-10-10, Product Owner approved):** replace the
MVP's `100 ms` hitbox-free **white square** on enemy destruction with a bounded
procedural **shatter burst** for every truly Destroyed Basic, Ranged, Hunter or
Elite. This supersedes only the destruction presentation in MVP Combat §8.5 /
AC-024; nonlethal-hit and Armoured-deflection feedback stay unchanged. An
Escaped enemy or a nonlethal hit creates no shatter. Hunter kamikaze destruction
does create it even when the player's contact damage is suppressed by God Mode.
The enemy leaves gameplay/collision immediately, counts and pays exactly once
under existing rules, and the visual has no hitbox or authority over mission
resolution.

At the enemy's authoritative destruction centre, show a small four-point
`text-primary` glint for the first **two** executed steps, one expanding broken
ring, and tapered triangular fragments in `danger` with `text-primary`
highlights. Regular enemies use **six** fragments over **12 fixed steps
(`0.20 s`)**; the Elite uses **ten** fragments and a second broken ring starting
on effect step 4, over **15 fixed steps (`0.25 s`)**. Ring radius expands from
`0.20` to `0.80` times the destroyed enemy's maximum complete width/height;
fragment centres move from the destruction centre out to at most `0.60` times
that dimension, shrink and fade monotonically. Use the destroyed enemy's stable
ID only to rotate the fixed pattern; consume no gameplay RNG, wall clock, or
new asset request. The prepared-PNG and procedural-fallback paths use the same
effect bounds and timing. No rectangular white block, full-screen flash,
physics debris, sound, camera shake, hit-stop, glow or trail is authorized.

Create each visual record once on the lethal collision step. Its application-
owned visual age advances once per executed fixed step during active Combat.
When a committed terminal freezes gameplay, visual-only shatter ageing may
continue on the terminal's fixed fade steps; all gameplay entities, damage,
rewards and result timing remain frozen. The existing terminal-fade opacity
multiplies the shatter's own fading opacity, and removes it at terminal zero
even if its normal duration has not elapsed. An uncommitted, failed, rejected
or inert terminal write and a browser-safety Pause advance neither shatter age
nor terminal fade. Thus an Elite killed on the Success step can display its
complete 15-step effect inside the already approved 15-step Success fade,
without delaying Aircraft centring, flight or Result presentation. Never
recreate a removed effect after resize or later frames.

WI-05 owns this presentation change separately from WI-02's content and attack
rules. Verify deterministic duration, one-effect-per-destruction, no effect for
Escaped/nonlethal events, terminal/pause interaction, prepared/fallback pixels
at `1280 × 600`, cleanup and a proportional dense-kill frame-cost sample.
The Product Owner's local visual review is required before WI-05 acceptance;
the renderer may not claim that a mechanically correct burst is aesthetically
accepted. No full-mission autoplay is required solely for this effect.

## 5. Economy, compatibility, rollback, and test boundary

Per-kill rewards, escape penalties, completion rewards, Repair cost, unlocks,
and payout formulas stay unchanged for these local candidates. If the player
destroyed **all** regulars, theoretical maximum Success payout would be `418
Credits` for Mission 01 (`286×1 + 52×2 + 10×2 + 8`) and `620 Credits` for
Mission 02 (`352×1 + 100×2 + 28×2 + 12`). The superseded 398-enemy Mission 01
pilot would have yielded `472`; it is historical feedback, not the current
target. The new Mission 03 theoretical maximum is `752 Credits`
(`376×1 + 128×2 + 48×2 + 8` Elite + `16` completion); it is neither an
expected payout nor approval of the patch economy. These maxima are not
realistic expected earnings or accepted economy balance. Record actual Credits,
Repair usage, progression and escape penalties when reported in the natural
local Mission 01 and Mission 02 tests; unreported values stay unknown and do
not become invented balance evidence. The patch decision requires deterministic
economy/progression checks, not further full-mission play solely to fill missing
playtest fields.

No campaign or Settings schema change is approved. Use an isolated local browser origin/profile for the v0.2.1 playtest; do not reset or migrate the Product Owner's existing campaign. Code rollback to tag `v0.2.0` does not reverse Credits earned in a v0.2.1 save. No external playtest, deployment, minimum-system-requirement claim, or physical Windows 10 Chrome/Edge certification follows from this local review. The historical `V02-DEC-037` dev-toolchain security exception is **not** silently extended to patch acceptance; the separate v0.2.1 decision is `V021-DEC-007` below.

**DECISION V021-DEC-007 — bounded local dev-tool advisory exception (2026-10-14, Product Owner approved; independent amendment review required).** The Product Owner accepts the residual risk of exactly `GHSA-vfj7-8cjw-p6xm` / CVE-2026-93687 in dev-only `braces@3.0.3`, reached only through `stylelint@17.14.1 > micromatch@4.0.8 > braces`, for **local v0.2.1 patch acceptance only**. The 2026-10-14 audit reports seven affected package entries from this single advisory, no patched `braces` release, and zero runtime-install vulnerabilities. The current lint command uses a repository-owned CSS glob; it is not a player-input surface. Waiting for a patch would leave local acceptance indefinitely blocked, while replacing Stylelint solely for this advisory would enlarge the tested toolchain change during patch stabilization. Those alternatives are deferred, not declared unnecessary. The exception is effective only after an independent review accepts this exact amendment and the final candidate repeats `npm audit --omit=dev` with zero findings and records the complete `npm audit` non-zero outcome as **failed/excepted, never passed**. Any new advisory, runtime finding, changed dependency path or exposure invalidates this disposition and requires a new decision. Do not suppress the audit, add an override, force a downgrade, change a threshold, or relabel its exit code. Reassess when a patched release or viable dependency-path replacement appears and **before any external test build, external playtest, deployment, publication, device certification or minimum-system-requirement claim**. This is not an exception for another patch or for the final release; it authorizes no commit or push.

## 6. Acceptance criteria and negative requirements

- **V021-AC-001 — Authored density:** Mission 01, Mission 02 and Mission 03 are the exact authored §§2.1–2.3 tables, with regular-role totals `286/52/10`, `352/100/28`, and `376/128/48` respectively; Mission 03 additionally has exactly one Elite. Their ordered starts/groups/members, placements, fixed-side Hunter groups, `03:10`/`04:20`/`05:20` final steps, minimum four-member regular creation events, and maximum `8 s` regular formation-start gap are product requirements for this candidate. Mission 03's last regular row is `05:19.30`, its Elite is created alone at `05:20`, and no break, auto-cleanup or phantom side draw occurs. Verify content validity, deterministic resolution, zero Mission 03 side draws and representative real spawn/placement at the content/application boundary; do not require a browser to survive or inspect every wave to prove the table. A later deliberate retune requires a new Product Owner decision but not a new full-mission playback test for every authored row.
- **V021-AC-002 — Scale and collision:** at `1280 × 600` and after resize, every regular prepared/fallback visual and its authoritative full-bounds AABB have the same centre and `1.5×` width/height relative to v0.2; Elite scale is unchanged. Spawns remain fully beyond the selected boundary, Top enemies remain within the Aircraft engagement band, and visibility/contact/escape use the new complete bounds.
- **V021-AC-003 — Hunter guidance and orientation:** same commands/seed produce identical position, heading, contact, and escape; a player displacement inside the 60-step window bends the committed run by no more than `25°/s`; displacement after lock or behind the Hunter cannot bend it; both prepared and fallback noses follow actual movement and their rotating AABBs encompass the visuals.
- **V021-AC-004 — Projectile silhouettes:** both red non-Core enemy projectile kinds render the approved equal-diameter circles and both player weapons render the approved shared teardrop, while all existing authoritative projectile rules and Elite Core geometry remain unchanged. Minimum-viewport captured pixels must distinguish the red circles from the previous rectangles and superseded ellipses, and the player teardrops from the previous rectangles.
- **V021-AC-005 — Committed exits:** after a committed Success/Evacuated/Defeat, all named frozen non-Aircraft entities fade by the exact per-terminal step count and never reappear; Aircraft and non-Combat UI do not fade. Success flight, Evacuation flight, and Defeat economy/terminal priority remain exact. Failed/inert writes, Retry Save, browser-safety pause, resize, and duplicate callbacks cannot start an early/second fade, lose a result, or change payout.
- **V021-AC-006 — Performance and cleanup (V021-DEC-008):** Run one six-second ordinary-production Mission 01 spot check at `1366×768` using §7's fixed early-formation setup. Preserve raw frame intervals, source/build/browser identity, three active-Combat screenshots, sustained and minimum one-second-window FPS (both `>=50`), errors and post-Combat cleanup. Existing frame-time/long-task/asset budgets remain; a failed or invalid sample is retained and blocks its gate. Exact per-step role/collision/Core/shatter proof and a separate feasibility/mutation package are withdrawn for local v0.2.1 acceptance only. Existing mechanic and persistence tests remain mandatory. The sample supports only a bounded local observation, not worst-case, no-regression, full-mission or physical-device certification; historical evidence is not relabelled.
- **V021-AC-007 — Local human feel:** the Product Owner's labelled Mission 01 and Mission 02 playtests remain the available feel evidence; record their build identity, completed portion, outcome and any actually reported retries, Hull/Credits/Repair, pressure, readability, Hunter fairness and impossible segment. Mark unreported facts unknown rather than inferring them. The 2026-10-07 feedback (Mission 01 completed; Mission 02 Defeat after approximately two minutes) froze the current density/frequency candidate for implementation. On 2026-10-13 the Product Owner explicitly accepted the current Mission 03 candidate **without another manual full-mission playthrough**, after separately accepting the local Elite visual. This is a Product Owner risk decision, not evidence that Mission 03 balance, feel or every wave was playtested; no new Mission 03 manual run is a local patch gate. Mechanic, mission-boundary, terminal and persistence checks remain mandatory.
- **V021-AC-008 — Elite attack cadence:** a complete Armoured phase fires cannon pairs at post-activation steps `45, 90, …, 675`, never on the phase boundary; a complete Vulnerable phase fires six sequential Cores at post-transition steps `30, 90, 150, 210, 270, 330`, with a maximum of six active and no shot on the transition or boundary step. A new phase resets only its owning attack timer; pause, terminal freeze, capacity hold and existing projectile lifecycle preserve the §3.1 contract without additional damage, speed or phase changes.
- **V021-AC-009 — Destruction feedback:** each true regular/Elite destruction creates exactly one hitbox-free shatter at the destruction centre, with §4.1's regular/Elite fragment counts, geometry and 12/15-step timing. Escaped or nonlethally hit enemies create none. Prepared/fallback visuals match; shatter cannot alter rewards, collision, mission outcome, RNG, or terminal timing. A committed terminal may advance visual-only shatter age while its opacity fades; blocked writes and Pause cannot. The effect is removed by its own expiry or terminal zero and never reappears on resize. Product Owner local visual review and proportional frame-cost evidence are required for WI-05 acceptance.

No new mission, boss, dynamic spawning, overlapping-result side effect, hidden
test hook in production, asset request, dependency, persistence migration, or
economy cap is authorized. Do not weaken a browser assertion to hide a Defeat.
The failed v0.2 Pass-B and three-mission D04 `@release-evidence` attempts are
preserved as failed historical observations on this candidate, never counted
as WI-01 passes. They are outside the approved local-tuning gate in §7; their
v0.2 claims are not silently transferred to v0.2.1. A focused green check is
not a completed patch-release gate.

## 7. Bounded execution and earliest human test

**WI-01-C02 provisional-preview readiness (R2, historical):** The observable outcome is a
playable ordinary-production Mission 01 **and** Mission 02 with exact §§2.1–2.2
authored rows and the already-implemented §3 `1.5×` regular bounds. AC-001,
AC-002 and provisional AC-006/007 apply with §6 negative requirements. The
approved scope has no unresolved S0–S2 product choice: role totals, every
formation start/template, row order/offset, Top fraction, fixed Side/Y, final
step, and no-seeded-draw change are explicit. Allowed production owners are
mission content/validation and the existing encounter-data/final-arrival
boundary, plus direct regressions and the old passive D04 browser journey's
supported-input repair if required. Existing geometry consumers are preserved,
not redesigned. No migration, dependency, economy, weapon, Hunter-steering,
Elite, or terminal-lifecycle change is authorized. Focused deterministic and
ordinary-production browser checks are feasible on this host. The old D04
passive-aircraft survival premise was truthfully reported as an integration
blocker under the then-active C02 gate. The local human preview preceded that
failed gate; the later Product Owner decision below changes WI-01's acceptance
route prospectively, not the result of the C02 attempt.

1. **V021-WI-01-C01 — superseded 398-enemy Mission 01 pilot.** Its focused checks and Product Owner preview remain historical feedback. No `result.json`, final integration gate, independent acceptance, or commit follows from that pilot; its active transient handoff is replaced only by the newly authorized C02 assignment. Do not spend a full gate on this obsolete candidate.
2. **V021-WI-01-C02 — Mission 01/02 authored-density correction, blocked historical attempt.** Preserve the existing `1.5×` regular geometry and fixed-side placement owner. Replace the 398-enemy Mission 01 table with §2.1 and the v0.2 Mission 02 table with §2.2; leave Mission 03 staging/Elite unchanged. The exact content, deterministic plan and bounded geometry were checked at their owners; `npm run verify` and ordinary-production smoke passed. The Product Owner naturally completed Mission 01 and reached Defeat in Mission 02 after approximately two minutes, then froze this density/frequency candidate. The C02 `verify:isolated` attempt failed in the old v0.2 Pass-B and three-mission D04 `@release-evidence` cases; its result and raw failures remain blocked historical evidence, not a pass. Do not tune approved content to make an old scripted pilot survive.
3. **V021-WI-01-C03 — bounded verification-route correction, READY (R2).** Preserve the C02 candidate's game/content, reward, clock, spawn, persistence and visual behaviour. The local WI-01 acceptance route is: (a) `npm run verify` for format/lint/type/build and the existing deterministic content/geometry/terminal/persistence checks; (b) `npm run verify:smoke` for ordinary-production Boot → selected Mission Start → live Combat, asset/fallback/request boundaries, and the existing short Evacuation → committed Result → Operations path; (c) inspect the focused owners to confirm that at least one authored regular spawn is asserted at the fixed-step layer and that the short production path checks the durable mission marker and exactly-once result write. Add only a missing narrow assertion, not a full new mission journey. The Product Owner's labelled local M01/M02 feedback satisfies the WI-01 feel checkpoint with unreported metrics marked unknown. Remove the temporary `dist/playtest-setup.html` before delivery and confirm no playtest setup is shipped. Record the C02 failed isolated attempt without rerunning it or marking it green. `npm run verify:isolated`, long natural mission playback, historical Pass-B timing, the three-mission D04 asset journey and the new dense-overlap performance claim are **not WI-01 acceptance gates**; they are deferred to patch stabilization, where a proportionate current-build method must be approved. Do not skip, delete or weaken their v0.2 historical evidence to manufacture a pass. After these bounded checks and a truthful `result.json`, obtain independent WI-01 review before starting WI-03.
4. **V021-WI-02 — Mission 03 authored density and Elite attack; accepted local checkpoint (R2, 2026-10-12).** The independent verdict is `verification/v021-wi-02-local-acceptance.md`, bound to source fingerprint `2778c6a5` and the corrected C01 handoff. It accepts the exact §2.3 schedule and §3.1 attack cadence for the bounded local route, including real two-cycle Elite cadence and a short ordinary-production first-row assertion. It does not accept Mission 03 balance, the superseded WI-06 instrumented Elite records, historical `@release-evidence` journeys, integrated FPS or the v0.2.1 patch. WI-05 is separate and may consume this accepted local candidate without changing its content or attacks.
5. **V021-WI-03 — Hunter guidance and rotating presentation, accepted local checkpoint (R2, 2026-10-08).** The independent verdict is `verification/v021-wi-03-local-acceptance.md`, bound to source fingerprint `4748684b`; the Product Owner also confirmed the local Hunter visual test. This accepts V021-AC-003 for the bounded WI-03 route only, not integrated patch performance or release. Player outcome: a Hunter briefly corrects its committed attack toward the Aircraft and visibly points its nose along its actual movement in Side Entry, Approach and Committed Attack Run. The application Combat simulation owns one heading and enclosing rotated AABB; Phaser rotates prepared/fallback visuals about their configured centre. Other enemy roles, WI-01 content, economy, persistence, mission timing and terminal authority remain unchanged. The old long `@release-evidence` cases and integrated dense-workload FPS remain at patch stabilization, never passed or erased by the WI-03 verdict.
6. **V021-WI-04 — Projectile shape and terminal fade; WI-04-A and WI-04-B accepted locally (R2, 2026-10-10).** The Product Owner approved Defeat browser-safety decision V021-DEC-001 and the WI-04-only local verification route in Verification §18; a different agent independently accepted that route (`verification/v021-wi-04-route-amendment-acceptance.md`). The two bounded handoffs were completed in order: **V021-WI-04-A (R1, V021-AC-004)** owns only §4 projectile silhouettes in the existing Phaser Combat presentation and minimum-viewport prepared/fallback visual evidence; its corrected circle candidate is independently accepted for this local checkpoint (`verification/v021-wi-04-a-local-acceptance.md`). **V021-WI-04-B (R2, V021-AC-005)** owns the committed Success/Evacuated/Defeat fade and application-owned terminal/browser-safety lifecycle; it is independently accepted for its bounded local route (`verification/v021-wi-04-b-local-acceptance.md`). AC-006 dense-overlap/integrated performance and remaining AC-007 local feel are patch-stabilization obligations, not passes from either checkpoint. The historical `@release-evidence` failures remain failed observations and the full browser lane was omitted only for these local checkpoints because A changed renderer geometry only and B substituted focused tests of every affected terminal path plus the short production Defeat/Evacuation routes; neither verdict is patch integration.
7. **V021-WI-05 — enemy destruction shatter; accepted local checkpoint (R2, 2026-10-13).** The Product Owner approved §4.1/V021-DEC-005 and V021-AC-009 as a separate presentation Work Item after WI-02 and approved the ordinary local preview's visual feel. The independent verdict is `verification/v021-wi-05-local-acceptance.md`, bound to corrected source fingerprint `a000d2be` and C01. The correction puts the Elite's second ring on visible effect step 4 (`ageSteps: 3`), with fail-sensitive renderer and geometry tests; the bounded verification route passed. This acceptance covers the local destruction effect only. The Product Owner's preview did not establish manual Elite/fallback review, the earlier candidate's detailed browser measurements are historical, and the proportional cost observation is not integrated FPS evidence. No reward, hitbox, mission/terminal authority, asset, RNG, enemy/weapon behaviour or other Work Item changes are accepted by this verdict. `verify:isolated`, historical `@release-evidence` journeys and integrated patch performance remain patch-stabilization obligations, not silently passed or waived here.

   | Current state | Event and guard | Next visual state / player-visible result | Durable write and forbidden side effect |
   | --- | --- | --- | --- |
   | Active Combat | One true lethal destruction, including Hunter contact | One shatter starts at the authoritative centre; enemy is removed under existing rules | Existing reward/count write only; shatter cannot cause another write or collision |
   | Active Combat | Escape or nonlethal hit | No shatter; existing feedback applies | No new reward, damage, outcome or RNG draw |
   | Active Combat / pending terminal write | Failed, rejected or inert write | Existing Save Error/Conflict or frozen state; shatter age does not advance | No visual-driven retry or terminal transition |
   | Committed terminal fade | Each executed fade step | Visual-only age and multiplied opacity advance; remove at expiry or terminal zero | Gameplay and durable result stay frozen; no exit delay |
   | Browser-safety Pause | Hidden/focus loss until explicit Resume | Same visual age and fade progress remain visible when resumed | No auto-resume or duplicate write |
   | Disposed / resized after removal | Late frame or resize | Removed shatter stays absent | No re-created entity, write or asset request |
8. **Patch stabilization and integration review — V021-DEC-006 (2026-10-13, Product Owner approved; verification amendment independently accepted).** The Product Owner accepts the current Mission 03 candidate without another full playthrough and prioritizes code/mechanic correctness over precise wave counts and timing in browser evidence. The exact current authored tables remain candidate content and stay checked at the deterministic content/application owner; future intentional retuning requires a new decision, not a repeated full-mission browser route. For this **local v0.2.1 patch only**, replace the obsolete four long `@release-evidence` scenarios and `verify:isolated`/`verify:all` as acceptance gates with the narrow route in Verification §18.1: `npm run verify`, the existing short ordinary-production `verify:smoke`, one short current-build dense-performance record, current dependency/security preflight, source-qualified AC traceability and independent integration review. Reuse the already accepted WI-01–05 focused evidence when the relevant source is unchanged; add a targeted regression only for an actual uncovered critical boundary. The critical claims are Boot/mission start, a real authored spawn, terminal commitment and durable exactly-once result/recovery, Elite phase/attack and destruction logic, request/fallback boundaries and post-Combat cleanup. **No full-mission autoplay, exact-wave browser census, six-record legacy comparison chain or additional Mission 03 human playthrough is required.** The old cases and their failures remain in their original suite as historical diagnostic evidence; do not delete, skip within that suite, relabel as passing, weaken or replace their raw records. A green short route does not claim that `verify:all` passed. The existing absolute FPS/asset/cleanup budgets remain binding, while absence of a matched baseline forbids a no-regression claim. Physical Windows/browser validation, external playtest, deployment and minimum-system-requirement claims remain separate. Patch acceptance and any commit/push require distinct explicit authority. The performance method is prospectively simplified by V021-DEC-008 below; the other V021-DEC-006 protections remain in force.

**DECISION V021-DEC-008 — proportionate local performance spot check (2026-10-15, Product Owner approved; independent amendment review accepted in `verification/v021-simple-performance-route-amendment-review.md`).** The Product Owner approved replacing the overbuilt C02 evidence system with three substantive checks: one `npm run verify`, the existing short `npm run verify:smoke`, and one six-second performance spot check. This prospectively supersedes only V021-DEC-006's formal combined-stress performance method, V021-AC-006's previous per-step workload requirements and the former C02 envelope. It does not change any game mechanic, authored content, existing accepted evidence or failure outcome.

Use the **ordinary production build**, an isolated browser context at `1366×768`, New Game and Mission 01. Move the Aircraft through supported pointer input to approximately `10% VW / 80% VH`; when Countdown first shows `02:58` (approximately Mission Clock `00:12`, after the first two authored formations begin), collect one six-second sample under continuous automatic fire. Record the actual start/countdown and retain screenshots at sample start, middle and end with active Combat/HUD and a visible populated field. No Debug, invulnerability, shortened clock, simulated warm-up, forced result, application evidence bridge or per-step recorder is required. If the observed scene is empty, paused or terminal, report the sample invalid rather than choosing a better interval after seeing the result.

Preserve raw frame intervals, source/build/browser/viewport identity, sustained FPS, minimum one-second-window FPS using the existing measurement method, page/console errors, available frame-time distribution and the three screenshots. Both unchanged FPS floors remain `>=50`. After the sample, use the existing Evacuation/Continue lifecycle and verify Operations with zero Combat canvas, HUD or blocking Overlay; stop the measurement observers before checking cleanup. Write raw results before assertions, run once without retry-until-pass and retain a failed or invalid result.

There is **no requirement** to prove a selected workload bucket, every executed step's population or collision work, a 20-step six-Core overlap, individual Core provenance, or a lethal shatter in the timed window; there is no separate browser preflight or new mutation matrix. Correct attacks, collisions, terminal/result persistence and destruction logic remain covered by their existing deterministic and focused browser evidence. The spot check is a bounded ordinary-production observation, **not** worst-case/combined-Elite certification, a no-regression comparison, a full mission test or a physical-device claim. Current security disposition, final independent integration review, Product Owner patch acceptance and Git/external authority remain separate. A different qualified reviewer must accept this exact documentation amendment before implementation under it.

**V021-PATCH-STAB-01 assignment readiness (R2, revised 2026-10-15):** After independent review of V021-DEC-008, C02 delivers only a thin ordinary-production spot-check case and its local command/configuration, then runs `verify`, `verify:smoke` and that single six-second case. Reuse existing frame measurement and cleanup helpers where practical; do not build a new validator framework, per-step telemetry model, provenance system or broad counter-test suite. Allowed changes are the dedicated browser case/config/script wiring and careful removal of unfinished C02-only recorder/test additions after backup; accepted C01 and WI-01–05 behaviour must survive. No application evidence hook or gameplay/content/dependency/save change is needed. Identity and handoff validation remain routine checks. Independent review checks the amendment first and the final case/raw result afterwards; final security audit and patch acceptance remain separate.

WI-01-C02 previews were deliberately earlier than patch stabilization so
human feel can invalidate poor tuning cheaply. DeepSeek owns a new unused local
origin distinct from v0.2.0 and all earlier patch previews, serves its exact
ordinary-production build, and labels both tests **provisional and local**.
For the Mission 02 playtest, first use the Product Owner's genuinely unlocked
Mission 02 progress if available in that isolated origin; otherwise create a
valid local-only campaign fixture with Mission 01 completed and Mission 02
unlocked, Hull `100`, `0` Credits and default equipment before the ordinary
production app loads. Record that setup. It must not modify the Product Owner's
existing save, inject a production hook, grant combat invulnerability, or alter
Mission 02 simulation, enemy content, timer or payout.
Record source/build identity, browser/viewport, portion reached, outcome,
attempts, Hull, Credits, Repair, perceived pressure, screened-Ranged
readability, 4/6-Hunter fairness, and empty/impossible stretches. No Debug,
invulnerability, shortened clock or forced result. The Product Owner's decision
froze the current WI-01 density/frequency candidate; it did not accept the patch
or waive patch-stabilization evidence. The short WI-01 route in item 3 is a
local checkpoint only. A focused green check never equals patch acceptance.
Governance §15 / Verification §18 route the gates. The two-WI P123 **v0.3**
trial count remains `0/2`; this patch does not silently count as a v0.3 WI.

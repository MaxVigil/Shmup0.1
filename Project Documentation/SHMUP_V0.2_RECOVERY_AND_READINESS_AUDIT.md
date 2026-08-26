# Shmup v0.2 Recovery and Readiness Audit

- **Audit date:** 2026-08-27
- **Audited baseline:** `2812fc0cc3acebd8f5be3d98d8c7ddf798772b6f`
- **Baseline relation:** local `main` and `origin/main` were identical (`0 ahead / 0 behind`) after fetch
- **Result:** recovered, corrected, and ready for bounded Work Item handoffs
- **Implementation state:** not started

## 1. Recovery result

The missing conversation records were not recoverable as complete chats. Their durable outputs were recoverable:

- the complete `SHMUP_V0.2_TACTICAL_COMBAT_FOUNDATION_SPECIFICATION.md` product definition;
- twenty-eight v0.2 acceptance criteria;
- three authored mission timelines and verified enemy/reward totals;
- four enemy behaviours, Elite phases, economy, persistence, lifecycle, HUD, result, Debug, and negative-requirement contracts;
- five Product-Owner-approved enemy sprite originals;
- the Product/Development Rules v1.1 governance work, already merged and pushed in revision `20cb9d9`;
- accepted governance review evidence retained in local Codex attachments.

No v0.2 gameplay implementation, v0.2 commit, or active implementation handoff was found. Product-definition work must not be reported as implemented code.

## 2. Freshness audit

The recovered specification named revision `5717191` as its baseline. The audited accepted baseline additionally contains `3a60dd1` (natural-defeat E2E timeout correction), `20cb9d9` (post-MVP governance v1.1), and `2812fc0` (development E2E readiness decoupled from the production artifact). These revisions do not change approved gameplay behaviour. The specification therefore remained behaviourally usable but required governance, authority, traceability, and baseline-freshness updates.

The current v0.1 implementation baseline passed on 2026-08-26:

- formatting, lint, and strict TypeScript checks;
- `56` Vitest files and `471` tests;
- production build.

The build retains an existing large-chunk warning for the lazy Combat entry. It is not a new v0.2 regression; v0.2 performance acceptance remains owned by `V02-WI-07`.

## 3. Corrected blockers

| Blocker | Correction | State |
|---|---|---|
| Recovered spec and assets were untracked | Added to the canonical repository change and documentation index | Closed |
| Spec claimed readiness while requiring missing traceability/workload | Added full `V02-AC-001–028` traceability and three approved workload definitions | Closed |
| Master had higher-priority conflicting v0.1 behaviour | Added explicit post-MVP authority and supersession boundaries to Master | Closed |
| Glossary exposed obsolete v0.1 meanings to v0.2 work | Added explicit v0.2 canonical-term overrides | Closed |
| Historical readiness file still said definition required | Marked it superseded and linked the canonical v0.2 owners | Closed |
| Hunter, Elite, countdown, and Evacuation behaviours were ambiguous | Recorded `V02-DEC-009–013` and updated normative requirements | Closed |
| Enemy originals exceeded runtime budget | Preserved originals under `assets/source/`; created deterministic optimized runtime PNGs | Closed |
| Enemy runtime pack was `5,553,254` bytes | Reduced to `221,772` bytes; complete runtime set is `1,800,725` bytes of `2,097,152` allowed | Closed |
| Asset provenance history was incomplete | Added a truthful provenance record and external-distribution restriction | Closed for local work; external rights gate remains |
| Dexie version was unspecified | Approved exact pin `dexie@4.4.5`; install/update remains `V02-WI-02` work | Closed |
| No bounded implementation sequence existed | Added seven sequential Work Items with AC ownership and gates | Closed |

## 4. Asset evidence

The optimization was deterministic downscaling, not generative redraw. Approved shapes, family distinction, Elite state pairing, orientation, and alpha were preserved.

| Runtime file | Dimensions | Bytes |
|---|---:|---:|
| `basic-drone.png` | `192×101` | `16,606` |
| `ranged-drone.png` | `224×163` | `38,787` |
| `hunter-drone.png` | `114×192` | `18,276` |
| `elite-drone-armoured.png` | `214×320` | `62,210` |
| `elite-drone-vulnerable.png` | `281×320` | `85,893` |
| **Enemy pack** | | **`221,772`** |

The original files total `5,553,254` bytes and remain non-runtime source material. The provenance record blocks external distribution until generator-rights evidence is confirmed.

## 5. Work completed versus work remaining

Completed product/governance work:

- scope, behaviours, tuning, timelines, economy, transitions, persistence contract, UI contract, negative requirements, and 28 AC;
- Product Owner visual acceptance;
- process/governance v1.1;
- cross-document authority, terminology, traceability, workload, asset-budget, provenance, and Work Item corrections in this recovery change.

Remaining implementation work:

- runtime asset integration;
- Dexie persistence and recovery;
- mission content/progression;
- regular-enemy Combat and Mission 01;
- Evacuation/Defeat/Game Over and Mission 02;
- Elite and Mission 03;
- final Debug, cleanup, performance, and full-Epic acceptance.

These are owned sequentially by `SHMUP_V0.2_IMPLEMENTATION_SLICES.md`. No implementation Work Item is accepted merely because this recovery audit is complete.

## 6. Residual gates

- The Product Owner must confirm sufficient AI-generator rights evidence before any external distribution.
- Every Work Item requires an explicit separate handoff and accepted revision before its dependent Work Item starts.
- Physical reference-device performance remains mandatory before external playtest or minimum-system-requirement claims.
- Actual runtime mapping, gameplay-scale visual acceptance, fallback behaviour, and production-build requests remain implementation evidence under `V02-AC-025`.

## 7. Audit verdict

The recovered Epic is current, internally consistent, source-qualified, budgeted, and decomposed. It is **APPROVED — READY FOR BOUNDED WORK ITEM HANDOFFS**. It is not implemented and must not be assigned as one unbounded Epic task.

## 8. Recovery-change verification

The completed recovery change passed on 2026-08-27 against an isolated checkout of the audited baseline plus the exact recovery change:

- project-context validation against canonical `main` and `origin/main`;
- Prettier, ESLint, Stylelint, and strict TypeScript checks;
- `56` Vitest files and `471` unit/integration tests;
- production build;
- `74` development Playwright tests;
- `13` production Playwright tests;
- source/runtime PNG dimension and alpha inspection;
- enemy-pack and complete-runtime byte accounting;
- documentation whitespace and `V02-AC-001–028` continuity checks.

The production build continues to report the known pre-v0.2 Combat chunk warning (`1,406.28 kB` before gzip, `367.01 kB` gzip). The warning is recorded rather than hidden; comparative performance and any justified code-splitting decision remain `V02-WI-07` acceptance work.

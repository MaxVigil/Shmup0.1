# Shmup MVP Development Process Audit v1.0

**Audit date:** 2026-08-24
**Baseline revision:** `b99580540f42b2df74171963dc00026d29c18a65`
**Product status at audit:** `S01–S14 Accepted`; `Feature Complete and Proxy Performance Verified`
**Lifecycle:** Historical process baseline. Standing rules now live in `AGENTS.md`, Code Principles, Verification and Quality Gates, and DeepSeek Governance.
**Language and governance update:** 2026-08-26

## 1. Executive verdict

The MVP was completed on a strong architecture and verification foundation. The largest remaining development-cost risks were process risks rather than product-code failures:

1. new agent dialogues could load much more canonical text than a task needed;
2. reviewers could load full evidence packages before the diff or `result.json` justified that cost;
3. milestone-only browser scenarios ran with ordinary production checks;
4. token use and API cost were not recorded consistently, so retrospective cost savings could not be proved.

The audit did not recommend weaker gates. It recommended better routing and cadence:

- keep exact formulas, RNG, state transitions, and simulation in deterministic tests;
- keep browser tests for wiring, lifecycle, focus, rendering, viewport, assets, and cleanup;
- keep `npm run verify:all` as the milestone and release gate;
- load only the canonical sections required by changed owners and criteria;
- inspect complete evidence files only when changed risk or a discrepancy requires them.

## 2. Scope and measurement limits

The audit inspected the complete approved product and technical package, repository `AGENTS.md`, project skills, Git history, Slice audit records, test configuration, and final S14 evidence.

Word count was used only as a context-size proxy. Words are not model tokens. The process did not have one durable record of actual input, cache-hit, cache-miss, output-token, and cost data.

## 3. Delivery baseline

### 3.1 Accepted state

- All fourteen canonical MVP Slices were accepted.
- The production build ran locally through `localhost`.
- Debug UI was absent from production.
- Phaser remained in a separate lazy Combat chunk.
- Deterministic, DEV browser, and compact production suites passed.
- The physical Windows reference-device gate was not claimed as passed. Under `DELIVERY-DEC-002`, it remained mandatory before the first external playtest or a minimum-system-requirement claim.

### 3.2 Final measured verification

| Gate | Final measured result | Primary purpose |
| --- | ---: | --- |
| Vitest | `450` tests / `54` files | deterministic Domain, application, and UI contracts |
| DEV Playwright | `74` tests | complete browser-observable behaviour |
| Production Playwright | `13` tests | production golden path, build boundaries, cleanup, and Debug exclusion |
| `verify:all` | approximately `108 s`; observed range `107–111 s` | final integrated acceptance |
| Production build | initial entry approximately `229 kB`; lazy Combat approximately `1.406 MB` before gzip | delivery and lazy-boundary evidence |

Production duplication fell from `73` production passes to `13`, approximately `82%` fewer production cases. Total milestone time did not fall because S14 added unique natural-Defeat, five-mission cleanup, request, artifact, and build checks. The change reduced duplication and maintenance surface, but did not prove a wall-clock saving for the full gate.

## 4. Workflow at the audit baseline

```text
Product Owner decision
→ Codex product and technical formalisation
→ canonical documentation
→ delta-only .agent-handoff/control.json
→ DeepSeek/Cline implementation
→ compact .agent-handoff/result.json plus referenced evidence
→ Codex independent review
→ Accepted or one consolidated correction Work Item
→ accepted commit
→ authorised fast-forward push to origin/main
```

Already effective controls included delta-only handoffs, structured results, no agent-authored requirement mirrors, no generic skill router, deterministic low-layer tests, a typed validated content catalogue, and separation of Domain/application behaviour from React and Phaser.

The filesystem handoff had already reduced Product Owner relay to one short message. A full direct Codex-to-Cline orchestrator had low expected return because it would remove only that relay while adding integration, permission, failure-recovery, and observability surfaces.

## 5. Context baseline

Word counts at revision `b995805`:

| Source set | Words | Interpretation |
| --- | ---: | --- |
| All canonical documents | approximately `46,523` | maximum corpus; not normal task context |
| `AGENTS.md` | approximately `3,048` | standing governance for a new session |
| Three project skills | approximately `1,250` | normally only one skill is needed |
| Full Base route at that time | approximately `17,430` | excluded conditional Master and Design System additions |
| Full Combat route at that time | approximately `21,603` | excluded conditional Master and Design System additions |
| Combat plus Design System | approximately `27,819` | prior upper bound for a Combat HUD/UI task |

The main context risk was repeated full-document reading, not the small `control.json`. For example, the Combat Specification contained approximately `9,971` words while a projectile-rendering correction might need only a few Combat sections, relevant criteria, the presentation boundary, and one verification section.

The final S14 transient package contained approximately `3.1 kB` of control data, `5.0 kB` of result data, and `24.7 kB` across six principal evidence records, plus screenshots. That size was reasonable with evidence on demand and wasteful when every review preloaded it.

## 6. Rework patterns

| Defect class | Examples | Process lesson |
| --- | --- | --- |
| Viewport/focus evidence did not measure the real viewport | S03 overflow and clipped focus ring | assert numeric bounds; screenshots are supporting evidence |
| Lifecycle/resize ownership was incomplete | S07 resize; S13 lifecycle identity | route cross-owner criteria to the application owner before presentation work |
| Input rules remained in an adapter | S08 routing correction | binding, repeat, and focus policy belongs in the pure application router |
| Delayed command identity became stale | S12 result commands; S13 loader/lifecycle commands | every delayed cross-mission command needs Mission Instance identity and a no-op regression |
| Reviewer found bounded gameplay defects | S11 feedback duration and God Mode cooldown | deterministic low-layer regressions are cheaper than another broad agent cycle |
| Human review found a geometric edge case | S13 unreachable Top Entry after resize | test the reachable gameplay band, not only viewport bounds |
| An evidence claim exceeded its measurement | S14 frame interval, build revision, and heap wording | match each claim to a physical invariant and reproducible method |

S02 had two known correction iterations but no durable local S02 audit record. Total model turns and correction cycles therefore could not be reconstructed reliably from Git alone.

## 7. Recommendations and disposition

| Priority | Recommendation | Audit estimate or reason | Current disposition |
| --- | --- | --- | --- |
| P0 | Route exact canonical sections by changed owner and criteria | estimated `40–60%` less canonical text for ordinary isolated tasks; medium-confidence estimate, not measured tokens | Implemented on 2026-08-24 |
| P0 | Record provider usage and process metrics | no direct saving; required to prove later savings | Implemented and expanded on 2026-08-26 |
| P1 | Review identity and diff before risk-linked evidence | high expected saving for evidence-heavy reviews; exact token effect unknown | Implemented |
| P1 | Route heavy production scenarios by changed risk | measured opportunity of up to `25–27 s` for an ordinary production run when those scenarios are irrelevant | Remains a tooling decision; full milestone gate unchanged |
| P1 | Bound dialogue lifecycle | reduce stale context and accidental carry-over | Revised on 2026-08-26 to one independently reviewable post-MVP Work Item by default |
| P2 | Audit content templates immediately before a content-heavy Epic | avoid a universal schema for hypothetical mechanics | Standing rule |
| P2 | Use a separate interface checkpoint only for an expensive long-lived boundary | avoid an extra relay for ordinary local types | Standing rule |

The `40–60%` context figure was an estimate derived from document word counts. It must not be presented as measured token or cost reduction.

The audit rejected a direct Codex-to-Cline orchestrator until three post-MVP scopes demonstrate material relay cost or a real need for parallel agents. It also rejected a new `verify:fast` command while `npm run verify` remained approximately `14 s`; focused tests already serve the inner loop. Reconsider only if the normal gate consistently exceeds `30 s` or measurement shows a different bottleneck.

## 8. Quality invariants

No process optimization may:

- reduce approved product behaviour;
- let an implementation agent decide an S0–S2 ambiguity;
- remove independent acceptance;
- replace deterministic tests with approximate browser tests;
- replace required browser or human evidence with unit tests;
- hide a flaky-test retry;
- skip a relevant production, lifecycle, cleanup, or performance gate;
- call proxy evidence a physical reference-device pass;
- create duplicate requirement authority;
- commit or push before acceptance;
- expand an Epic through speculative architecture.

## 9. Implementation record — 2026-08-24

Cycle A implemented:

- exact section-level context routing in `AGENTS.md`, governance, and the three project skills;
- bounded dialogue lifecycle;
- evidence-on-demand review order;
- compact protocol-v2 handoffs with tested protocol-v1 compatibility;
- lightweight process metrics;
- evidence thresholds for external audits;
- content-heavy and Combat-heavy readiness classification for the planned enemy-types Epic.

No enemy schema, behaviour, balance, schedule, asset, or optimization mechanism was added.

## 10. Governance amendment — 2026-08-26

The following controls supersede narrower workflow statements in the historical baseline:

- `npm run context:validate` verifies repository identity and rejects a stale handoff before work;
- repository documentation and agent-to-agent communication use English; communication with Maksym uses Ukrainian by default;
- stable DeepSeek prompt prefixes and provider-reported cache-hit/cache-miss metrics are used when the interface permits;
- a post-MVP Epic is decomposed into small reviewable Work Items; one implementation dialogue per independently reviewable Work Item is the default;
- an author of production code, committed tests, build configuration, or canonical governance cannot be the only judge of adequacy;
- when the acceptance reviewer authors a substantive amendment, a different qualified reviewer must accept it.

## 11. External references

- [DeepSeek Context Caching](https://api-docs.deepseek.com/guides/kv_cache/)
- [Google Engineering Practices: Small CLs](https://google.github.io/eng-practices/review/developer/small-cls.html)
- [Google Engineering Practices: What to look for in a code review](https://google.github.io/eng-practices/review/reviewer/looking-for.html)
- [Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172)
- [GDS: Test-driven development](https://gds-way.digital.cabinet-office.gov.uk/standards/test-driven-development.html)
- [Michael Feathers: Characterization Testing](https://michaelfeathers.silvrback.com/characterization-testing)

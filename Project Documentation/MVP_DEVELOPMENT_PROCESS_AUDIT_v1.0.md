# Shmup MVP Development Process Audit v1.0

**Дата:** 2026-08-24

**Baseline revision:** `b99580540f42b2df74171963dc00026d29c18a65`

**Статус продукту:** `S01–S14 Accepted`; `Feature Complete and Proxy Performance Verified`

**Мета:** знайти подальші способи зменшити вартість, кількість agent cycles і використання токенів без послаблення product contract або quality gates.

## 1. Executive verdict

MVP завершено з сильною архітектурною та verification-базою. Найбільші ризики для подальшої вартості розробки знаходяться не в product code, а в чотирьох процесних місцях:

1. новий agent dialogue може завантажувати значно більше канонічного тексту, ніж потрібно конкретній задачі;
2. reviewer може читати повні evidence-пакети до того, як diff або `result.json` довели потребу в цьому;
3. важкі milestone-only browser scenarios запускаються разом зі звичайними production checks;
4. фактичні token usage і API cost не записувалися структуровано, тому точну грошову економію неможливо довести ретроспективно.

Quality gates не треба скорочувати. Потрібно змінити їх routing і cadence:

- точні формули, RNG, state transitions і simulation залишаються в deterministic unit tests;
- browser tests залишаються для wiring, lifecycle, focus, rendering, viewport, assets і cleanup;
- повний `verify:all` залишається обов’язковим milestone/release gate;
- агент читає тільки канонічні секції, які потрібні зміненим owners і AC;
- reviewer відкриває повні evidence-файли тільки за ризиком або невідповідністю.

## 2. Scope і джерела аудиту

Аудит спирається на:

- [Master Design Document](./MVP_MASTER_DESIGN_DOCUMENT_v0.1.md);
- [Base and Pre-Combat Specification](./MVP_BASE_AND_PRECOMBAT_SPEC_v0.1.md);
- [Combat Specification](./MVP_COMBAT_SPEC_v0.1.md);
- [Design System Specification](./MVP_DESIGN_SYSTEM_SPEC_v0.1.md);
- [Delivery Specification](./MVP_DELIVERY_SPEC_v0.1.md);
- [Technical Foundation](./MVP_TECHNICAL_FOUNDATION_v0.1.md);
- [Repository Architecture](./MVP_REPOSITORY_ARCHITECTURE_v0.1.md);
- [Code Principles](./MVP_CODE_PRINCIPLES_v0.1.md);
- [Verification and Quality Gates](./MVP_VERIFICATION_AND_QUALITY_GATES_v0.1.md);
- [Implementation Slices](./MVP_IMPLEMENTATION_SLICES_v0.1.md);
- [DeepSeek Governance and Skill Routing](./MVP_DEEPSEEK_GOVERNANCE_AND_SKILL_ROUTING_v0.1.md);
- [Traceability Matrix](./MVP_TRACEABILITY_MATRIX_v0.1.md);
- repository `AGENTS.md`, project-specific skills, Git history, Slice audit records, test configuration and the final S14 evidence.

Вимірювання word count є лише proxy для context cost. Слова не дорівнюють model tokens. Фактичні input, cached-input і output tokens не записувалися в єдиному процесному журналі.

## 3. Delivery baseline

### 3.1 Product status

- Усі чотирнадцять canonical Slices прийняті.
- Production build працює локально через `localhost`.
- Debug UI відсутній у production.
- Phaser залишається в окремому lazy Combat chunk.
- Повний deterministic unit suite, DEV browser suite і compact production suite пройшли.
- Фізичний Windows reference-device gate не заявлений як пройдений. За `DELIVERY-DEC-002` він обов’язковий перед першим зовнішнім плейтестом або minimum-system-requirement claim.

### 3.2 Final verification baseline

| Gate | Final measured result | Основне призначення |
|---|---:|---|
| Vitest | `450` tests / `54` files | deterministic Domain, Application, UI contracts |
| DEV Playwright | `74` tests | full browser-observable behaviour |
| Production Playwright | `13` tests | production golden path, build boundaries, cleanup, Debug exclusion |
| `verify:all` | approximately `108 s`; observed range `107–111 s` | final integrated acceptance |
| Production build | initial entry approximately `229 kB`; lazy Combat approximately `1.406 MB` before gzip | delivery and lazy-boundary evidence |

Production duplication зменшено з `73` production passes до `13`. Це приблизно на `82%` менше production test cases. Проте загальний wall-clock не скоротився: у S14 були додані унікальні natural-Defeat, five-mission cleanup, request, artifact і build checks. Тому цей крок зменшив дублювання та майбутню maintenance surface, але ще не дав доведеної економії часу повного milestone gate.

## 4. Current workflow

```text
Product Owner decision
→ Codex product/technical formalisation
→ canonical documentation
→ delta-only .agent-handoff/control.json
→ DeepSeek/Cline implementation
→ compact .agent-handoff/result.json + referenced evidence
→ Codex independent review
→ Accepted or one consolidated correction Work Item
→ accepted commit
→ authorised fast-forward push to origin/main
```

### 4.1 Що вже добре оптимізовано

- Product Owner передає після implementation cycle лише `DeepSeek completed the cycle.`
- Standing rules не повторюються у кожному повідомленні.
- `control.json` містить variable delta, risks і gates.
- `result.json` є структурованим handoff, а не довгим чат-звітом.
- Work Items не маскуються під нові Slices.
- Corrections одного Slice залишаються всередині цього Slice.
- Reviewer може автономно виправляти bounded micro-corrections.
- DeepSeek не комітить до independent acceptance.
- Після Accepted Codex може автоматично commit і fast-forward push тільки до чинного `origin/main`.
- Generic skill router, Memory Bank і condensed duplicate specifications заборонені.
- Domain/Application logic відокремлена від React/Phaser, що дозволяє дешеві deterministic tests.
- Content catalogue уже typed і має runtime validator; монолітний JSON registry не потрібний.

### 4.2 Relay cost

Filesystem handoff уже прибрав майже весь нетехнічний relay. Повний Codex↔Cline orchestrator зараз має низький очікуваний ROI:

- він прибере одне коротке повідомлення Product Owner;
- але додасть integration, permissions, failure recovery і observability surface;
- він не прибере product decisions або independent acceptance review.

**Рекомендація:** не будувати direct orchestrator, доки relay знову не стане вимірюваною проблемою або не з’явиться паралельна робота кількох implementation agents.

## 5. Context baseline

Word count на revision `b995805`:

| Source set | Words | Interpretation |
|---|---:|---|
| Усі canonical documents | approximately `46,523` | максимальний documentation corpus; не повинен завантажуватися для кожної задачі |
| `AGENTS.md` | approximately `3,048` | standing governance, обов’язковий у новій agent session |
| Три project skills разом | approximately `1,250` | зазвичай потрібен лише один skill |
| Current Base route | approximately `17,430` | без Master і Design System additions |
| Current Combat route | approximately `21,603` | без Master і Design System additions |
| Combat + Design System | approximately `27,819` | типовий upper bound для Combat HUD/UI task |

Current route оцінено з повних документів, які `AGENTS.md §2` вимагає для нового dialogue: README, relevant feature specification, Glossary, Repository Architecture, Code Principles, Verification, Implementation Slices і selected skill. Master, Design System, Delivery, Technical Foundation або Narrative Rules додаються залежно від scope.

### 5.1 Main token risk

Найбільший context risk — не розмір одного `control.json`, а повне повторне читання великих документів у кожному новому dialogue. Наприклад, повний Combat Specification має приблизно `9,971` слово, хоча isolated projectile rendering correction може потребувати лише кількох Combat sections, відповідних AC, presentation boundary і verification section.

### 5.2 Evidence context risk

Final S14 transient package мав приблизно:

- `control.json`: `3.1 kB`;
- `result.json`: `5.0 kB`;
- six principal evidence records: approximately `24.7 kB`;
- screenshots окремо.

Цей обсяг прийнятний, якщо reviewer використовує evidence-on-demand. Він стає зайвим token cost, якщо кожен audit починається з читання всіх evidence-файлів замість `result.json`, diff і risk-based selection.

## 6. Correction and rework analysis

Git history та локальні Slice audits показують повторювані defect classes.

| Defect class | Приклади | Process lesson |
|---|---|---|
| Viewport/focus evidence не вимірювало реальний viewport | S03 overflow і clipped focus ring | Browser evidence повинно перевіряти numeric bounds, а не покладатися лише на screenshot |
| Lifecycle/resize ownership визначено неповністю | S07 resize correction; S13 lifecycle identity | Cross-owner AC треба маршрутизувати до application owner до presentation implementation |
| Input rules залишилися в adapter | S08 routing correction | Binding/repeat/focus policy належить pure application routing table |
| Stale asynchronous command identity | S12 result commands; S13 delayed loader/lifecycle commands | Кожна delayed cross-mission command потребує Mission Instance identity і no-op regression |
| Reviewer знайшов bounded gameplay defects | S11 feedback duration і God Mode during cooldown | Deterministic low-layer regression plus micro-correction lane ефективніші за новий agent cycle |
| Human checkpoint знайшов геометричний edge case | S13 unreachable Top Entry after resize | Automated bounds повинні використовувати reachable gameplay band, а не лише viewport bounds |
| Evidence claim був сильніший за вимірювання | S14 negative frame interval, build revision, heap wording | Evidence schema потребує physical invariants, reproducible method і claim-to-assertion matching |

S02 мав два correction iterations, відомі з implementation relay history, але не має окремого durable S02 audit record у поточному local evidence package. Через це точну загальну кількість model turns і correction cycles неможливо надійно реконструювати лише з Git.

### 6.1 Що вже запобігає повторенню

- viewport and focus-ring browser regressions;
- pure input-routing tests;
- Mission Instance identity checks;
- delayed-loader ownership guard;
- reachable engagement-band tests after resize;
- dirty build identifier;
- finite non-negative frame-interval evidence;
- bounded heap claim із recorded series;
- micro-correction lane;
- consolidated correction policy.

## 7. Recommended optimisations

### P0 — Add section-level context routing

**Зміна:** оновити `AGENTS.md §2` і governance routing. Новий dialogue завжди читає повністю `AGENTS.md`, active assignment і selected `SKILL.md`, але canonical documents завантажує за section-level route.

Minimum routes:

- isolated Combat simulation: affected Combat sections/AC, relevant Code Principles, Repository Architecture owner і Verification gate;
- Base UI: affected Base sections/AC, affected Design System component/token/focus sections, relevant Verification gate;
- content: content model/validation owners і relevant product sections;
- cross-system lifecycle: relevant Master, Base/Combat transition, identity and verification sections;
- build/tooling: Delivery, Verification, relevant Repository Architecture and package boundary;
- Narrative Rules: only copy, localisation, people, factions, countries, technologies, narrative content or narrative-dependent assets.

Escalation rule: якщо diff торкається нового owner, cross-system import або AC поза route, agent розширює context до відповідної canonical section до редагування.

**Estimated effect:** приблизно `40–60%` менше canonical text для ordinary isolated tasks. Це estimate із середньою впевненістю, а не виміряний token result.

**Quality impact:** neutral або positive, якщо routing table revision-controlled і має escalation rule. Заборонено створювати condensed duplicate specs або Memory Bank.

### P0 — Record process-token telemetry

Без telemetry неможливо довести економію грошей. Для кожного post-MVP Slice або Epic треба записувати:

```text
model/provider
dialogue identifier
input tokens, cached-input tokens, output tokens — if provider exposes them
agent turns
implementation cycles
correction cycles
control/result byte count
documents/sections loaded
gate durations
```

Якщо provider не показує tokens, записувати prompt/context bytes, turns і wall-clock як proxy. Це development-process evidence, не player telemetry і не частина runtime гри.

**Expected effect:** пряма економія від самого запису відсутня. Він дає baseline, без якого наступні optimisation claims залишаться припущеннями.

### P1 — Use evidence-on-demand review order

Reviewer sequence:

1. validate `control.json` and `result.json` identity;
2. inspect Git diff and changed owners;
3. inspect failed, deviated або risk-linked evidence;
4. open full audit records/screenshots only for applicable manual or high-risk gates;
5. rerun the smallest independent gate sufficient for the changed risk, then the required acceptance gate.

Не завантажувати всі попередні Slice audits. Не читати screenshots як text context. Не повторювати canonical requirements у review response.

**Estimated effect:** high savings on evidence-heavy milestone reviews; точний token effect невідомий.

### P1 — Separate ordinary production smoke from milestone-only scenarios

Current production suite займає близько `33 s`. Natural Defeat використовує приблизно `25 s`; five-mission cleanup — приблизно `2 s`.

Рекомендована структура для post-MVP:

- focused browser spec during implementation;
- compact production smoke for ordinary browser-affecting Slice acceptance;
- milestone-only natural-Defeat, five-mission memory, full keyboard/Design System/performance audits before external build or after зміни відповідних owners;
- full `verify:all` залишається mandatory milestone/release gate.

Це не дозволяє пропускати relevant regression. Зміна mission resolution, lifecycle, cleanup, performance або build boundary автоматично маршрутизує milestone scenarios назад у Slice gate.

**Measured opportunity:** до `25–27 s` менше на ordinary production run, якщо важкі scenarios не є relevant. Потрібна окрема tooling decision перед реалізацією.

### P1 — Codify dialogue lifecycle

- один новий DeepSeek/Cline dialogue на canonical Slice або post-MVP Epic;
- усі Work Items і corrections цього scope залишаються в тому самому dialogue;
- після Accepted dialogue закривається;
- новий scope починається з нового dialogue і section-routed reread.

Це обмежує stale context та accidental carry-over. Section routing компенсує reread cost нового dialogue.

### P2 — Audit content templates immediately before a content-heavy Epic

Поточний repository уже має:

- typed `ContentCatalogue`;
- окремі aircraft, weapon, enemy, mission і pilot modules;
- validators для required fields, IDs, ranges і malformed input;
- deterministic validation tests.

Перед першим content-heavy Epic потрібно перевірити тільки відсутні поля, cross-references, templates і error messages, які реально потрібні затвердженому scope.

Не створювати:

- один великий JSON registry;
- generic ECS framework;
- універсальний content engine;
- schema для гіпотетичних mechanics наступних років.

### P2 — Keep interface-first inside one delivery cycle

Окреме людське погодження TypeScript interfaces перед кожною реалізацією створить додатковий relay і agent cycle. Використовувати окремий interface checkpoint лише для дорогого, довгоживучого cross-system boundary. Для звичайного Slice types та implementation перевіряються одним independent review.

### Rejected for now — Full direct Codex↔Cline orchestrator

Причина: filesystem handoff уже зменшив участь Product Owner до одного короткого повідомлення. Direct orchestrator не усуває product decisions та acceptance review, але додає нову infrastructure surface. Повернутися до ідеї, якщо три послідовні post-MVP scopes покажуть значний relay cost або потребу в parallel agents.

### Rejected for now — New `verify:fast` command

Current `npm run verify` уже проходить приблизно за `14 s` і включає formatting, lint, strict typecheck, `450` unit tests та production build. Новий command, який лише дублює частину цього gate, матиме малий ROI.

Під час роботи використовувати focused tests. Перед handoff використовувати `verify`; browser і milestone gates маршрутизувати за changed risk. Переглянути рішення, якщо `verify` стабільно перевищить `30 s`.

## 8. Recommended next sequence

### Cycle A — Governance optimisation before the next Epic

1. Додати section-level context routing.
2. Зафіксувати one-dialogue-per-Slice/Epic rule.
3. Зафіксувати evidence-on-demand reviewer order.
4. Додати lightweight process-metrics record або export procedure.
5. Не змінювати product code.

### Cycle B — Define the next Epic

1. Закрити product scope та AC.
2. Визначити owners, performance impact і content impact.
3. Лише після цього вирішити, чи потрібні content-validator additions або test-gate routing changes.
4. Не будувати architecture runway більше ніж на один approved Epic уперед.

### Cycle C — Re-audit after three post-MVP scopes

Порівняти з цим baseline:

- median input/output tokens;
- correction cycles per accepted scope;
- time from assignment to acceptance;
- full-gate and focused-gate duration;
- context words/sections loaded;
- Product Owner relay messages;
- defects escaped to human checkpoint.

Не продовжувати optimisation, якщо metric не покращується або quality defects зростають.

## 9. Quality invariants

Жодна process optimisation не може:

- змінити або скоротити approved product behaviour;
- дозволити implementation agent самостійно вирішувати S0–S2 ambiguity;
- прибрати independent acceptance;
- замінити deterministic tests браузерними приблизними перевірками;
- замінити browser/manual evidence unit tests там, де потрібен реальний browser або human judgement;
- приховати flaky test retry;
- пропустити relevant production, lifecycle, cleanup або performance gate;
- дозволити proxy evidence називатися physical reference-device pass;
- створити duplicate requirements authority;
- автоматично commit/push до Accepted;
- розширити Epic через speculative architecture.

## 10. Audit conclusion

Найкраща наступна економія — не «менше тестувати» і не «писати коротші специфікації». Потрібно точніше подавати правильні canonical sections правильному agent scope, читати evidence за ризиком і вимірювати фактичні tokens/cycles.

Очікувана користь:

- section routing: найбільший потенційний token reduction;
- evidence-on-demand: великий потенціал для milestone reviews;
- production gate routing: вимірювана економія wall-clock на ordinary scopes;
- process telemetry: необхідна умова для доказової подальшої оптимізації;
- content templates: економія лише перед конкретним content-heavy Epic;
- direct orchestrator та новий generic framework: зараз не виправдані.

Цей звіт є baseline для наступного governance cycle. Він не змінює product requirements, architecture або quality gates сам по собі.

## 11. Implementation record — 2026-08-24

The approved process changes from Cycle A are now implemented:

- `AGENTS.md`, governance, and all three project skills route exact canonical sections instead of requiring the complete documentation route for every dialogue;
- a new DeepSeek/Cline dialogue is used per post-MVP Epic, with corrections retained in that dialogue;
- independent review uses handoff identity, diff, and risk-linked evidence before opening full evidence packages;
- filesystem handoff protocol v2 carries only scope ID, exact canonical sections, delta, risks, and required gates; the validator retains tested protocol-v1 compatibility for legacy MVP records;
- `verification/process-metrics-template.md` records token usage when available and stable proxies when it is not;
- external audit claims require an exact repository/revision, real dependency or code-path evidence, and reproducible measurements before they can authorise refactoring;
- the first enemy-types Epic is classified as both content-heavy and Combat-heavy in `POST_MVP_ENEMY_TYPES_EPIC_READINESS_v0.1.md`.

No enemy schema, behaviour, balance, schedule, asset, or optimisation mechanism was added. Those changes remain blocked until the Product Owner approves the Epic contract and representative workload.

# MVP Master Design Document v0.1

**Product:** Shmup  
**Scope:** Complete MVP product boundary and cross-system integration  
**Status:** MVP IMPLEMENTATION PACKAGE READY  

## 1. Purpose

This document is the canonical index and integration contract for the complete Shmup MVP.

It does not duplicate detailed subsystem requirements. It defines:

- the complete MVP system inventory;
- the authoritative source for each system;
- the end-to-end player and application lifecycle;
- cross-system state ownership and transitions;
- traceability and readiness of the MVP as a whole;
- master-audit results and readiness gates.

A subsystem marked READY does not make the complete MVP READY. The complete MVP becomes READY only after this document has no unresolved S0–S2 gaps and its final consistency review passes.

## 2. Source-of-truth hierarchy

For the approved MVP, authority is applied in this order:

1. Latest explicit Product Owner decision recorded during the master audit.
2. This Master Design Document for product boundary and cross-system integration.
3. `MVP_NARRATIVE_RULES_v1.0.md` for durable worldbuilding and content constraints.
4. `MVP_COMBAT_SPEC_v0.1.md` for Combat behaviour.
5. `MVP_BASE_AND_PRECOMBAT_SPEC_v0.1.md` for Base and pre-Combat behaviour.
6. `MVP_DESIGN_SYSTEM_SPEC_v0.1.md` for UI composition, presentation, and governance.
7. `MVP_TECHNICAL_FOUNDATION_v0.1.md` for approved implementation architecture and technical boundaries.
8. `MVP_REPOSITORY_ARCHITECTURE_v0.1.md` for repository structure, module ownership, and dependency directions.
9. `MVP_CODE_PRINCIPLES_v0.1.md` for mandatory implementation and review rules.
10. `MVP_VERIFICATION_AND_QUALITY_GATES_v0.1.md` for commands, automated gates, and manual evidence.
11. `MVP_DEEPSEEK_GOVERNANCE_AND_SKILL_ROUTING_v0.1.md` for implementation-agent authority and skill routing.
12. `MVP_FINAL_TECHNICAL_AUDIT_v0.1.md` for implementation-readiness evidence and authorization.
13. `MVP_DELIVERY_SPEC_v0.1.md` for production-mode build and localhost-delivery acceptance.
14. `MVP_GLOSSARY_v0.1.md` for canonical vocabulary.
15. `MVP_TRACEABILITY_MATRIX_v0.1.md` for requirements coverage.
16. Repository `AGENTS.md` and project-specific implementation skills.
17. Implementation-agent assumptions, which are never authoritative.

When two sources conflict, implementation must stop and report the conflict. It must not silently select one version.

## 3. MVP product outcome

The MVP must provide one complete repeatable loop:

```text
start session
→ inspect the available Interception mission
→ inspect aircraft readiness in Hangar
→ optionally select a Primary Weapon
→ optionally Repair when damaged and affordable
→ start the mission
→ play Combat
→ resolve Success, Defeat, or Aborted
→ return to Operations with the correct shared state
→ repeat
```

The MVP validates:

- the Base-to-Combat loop;
- two distinct Primary Weapon damage profiles;
- persistent in-session aircraft damage and Repair;
- one mission reward and Credit spend loop;
- keyboard and mouse aircraft control;
- browser performance on the approved reference device;
- the approved minimal Design System and component governance.

## 4. Current system inventory

| System | MVP responsibility | Detailed authority | Audit state |
|---|---|---|---|
| Application Boot | Initialize one session or show fatal startup failure | This document | Master audit approved |
| Shared Session State | Credits, aircraft, Hull, weapon, Pilot, Settings, mission availability | Base and Pre-Combat Specification | Master audit approved |
| Base Navigation | Navigation between Operations and Hangar | Base and Pre-Combat Specification | Master audit approved |
| Operations | Display and select one Interception mission | Base and Pre-Combat Specification | Master audit approved |
| Mission Details | Confirm mission start | Base and Pre-Combat Specification | Master audit approved |
| Hangar | Inspect aircraft and access weapon selection and Repair | Base and Pre-Combat Specification | Master audit approved |
| Weapon Selection | Select Machine Gun or Cannon | Base and Pre-Combat Specification | Master audit approved |
| Repair | Spend one Credit for full Repair when allowed | Base and Pre-Combat Specification | Master audit approved |
| Combat | Movement, enemies, weapons, collisions, mission resolution | Combat Specification | Master audit approved |
| Pause and Settings | Pause runtime and control Mouse Movement setting | Combat and Base specifications | Master audit approved |
| Debug Mode | Development-only Combat controls and observability | Combat Specification | Master audit approved |
| Browser Lifecycle | Focus, visibility, resize, refresh | Combat and Base specifications | Master audit approved |
| Design System | UI tokens, primitives, composition, assets, governance | Design System Specification | Master audit approved |
| Performance Verification | Runtime, interaction, transfer, and lifecycle budgets | Master and Combat specifications | Master audit approved |
| Local Delivery | Static production-mode build and localhost acceptance | Delivery Specification | Master audit approved |
| Canonical Terminology | One vocabulary across product, UI, tests, and implementation | Glossary | Master audit approved |
| Requirements Traceability | Normative-section to acceptance-criteria coverage | Traceability Matrix | Master audit approved |
| Narrative Foundation | PRC, Ukrainian, and Russia-absence content constraints | Narrative Rules | Approved; no new MVP feature scope |
| Technical Foundation | Framework direction, state ownership, deterministic simulation, adapters, verification strategy | Technical Foundation | Architecture approved; remaining readiness gates pending |
| Repository Architecture | Source tree, module ownership, dependency direction, lazy Combat boundary | Repository Architecture | Approved |
| Code Principles | Type safety, deterministic code, mutation, errors, cleanup, performance, testing, change discipline | Code Principles | Approved |
| Verification and Quality Gates | Reproducible commands, automated checks, manual evidence, milestone blocking | Verification and Quality Gates | Approved; scaffold checks passed |
| Agent Governance and Skill Routing | Agent authority, stop rules, skill allowlist/denylist, reporting | DeepSeek Governance and Skill Routing | Approved |
| Final Technical Audit | Cross-document, repository, toolchain, artifact, and governance readiness | Final Technical Audit | Passed; implementation authorized by explicit task |
| Audio | No audio system or audio content in MVP | This document | OUT OF SCOPE |

## 5. Application Boot

### 5.1 Boot View

While application initialization is incomplete, the browser displays only:

```text
solid canvas background
Loading…
```

- `Loading…` uses `text-body`.
- There is no progress bar, spinner, animation, or interaction.
- `Boot View` is a technical application state, not a Base Screen and not a navigation destination.

### 5.2 Successful boot

After successful critical initialization and completion of the bounded asset-preload phase:

1. Creates exactly one new session.
2. Selects one Pilot according to the approved Base rule.
3. Creates the approved initial shared state.
4. Opens `Operations Screen`.

The MVP has no Title Screen, Main Menu, profile selection, or separate `Start Game` action.

### 5.3 Non-blocking asset failure

Failure of a background, aircraft image, IBM Plex Mono font, or approved icon does not block application startup. The applicable approved fallback is used.

One non-critical asset must not leave Boot View active indefinitely.

### 5.4 Fatal initialization failure

Failure to create application state or start the primary application runtime displays only:

```text
Unable to start game.

[Reload]
```

- Ordinary game UI is hidden.
- `Reload` performs a full page reload.
- No partial session, mission, Credit, or reward state remains.
- There is no automatic infinite retry.
- The technical reason is written to the development console and is not exposed as player-facing technical detail.

### 5.5 Initialization idempotency

One page load creates at most one session and one application instance.

Repeated callbacks or asset-completion events must not:

- select another Pilot;
- duplicate shared state;
- open another Screen instance;
- grant Credits or rewards;
- start another application runtime.

### 5.6 Runtime asset preload

Boot starts all approved runtime asset requests in parallel:

```text
assets/runtime/backgrounds/operations-background.webp
assets/runtime/backgrounds/hangar-background.webp
assets/runtime/aircraft/german-fighter.png
assets/runtime/fonts/ibm-plex-mono-regular.woff2
assets/runtime/fonts/ibm-plex-mono-medium.woff2
assets/runtime/fonts/ibm-plex-mono-semibold.woff2
assets/runtime/icons/gear.svg
assets/runtime/icons/pause.svg
assets/runtime/icons/crosshair.svg
assets/runtime/icons/map-trifold.svg
assets/runtime/icons/warehouse.svg
assets/runtime/icons/check.svg
```

Critical initialization consists only of creating the application runtime, shared session-state capability, required Screens, and required product systems. Runtime image, font, and icon assets are non-critical.

Boot leaves `Boot View` on the first of these conditions:

```text
all runtime asset requests settle as success or failure
OR
5 s elapse from the start of asset preload
```

- Image success requires successful load and decode.
- Font success requires the corresponding approved weight to be ready for use.
- An asset unresolved at the `5 s` deadline is unavailable for the current session and uses its approved fallback.
- A late completion after the deadline must not replace the fallback, shift layout, reopen a Screen, or repeat Boot.
- There is no automatic asset retry. Refresh starts one new bounded attempt as part of the new page load.
- After Boot, Screens and Overlays use the prepared asset or its stable fallback without another loading view, spinner, skeleton, progress indicator, or artificial transition delay.
- Runtime requests are restricted to `assets/runtime/`. Source JPEGs, remote image URLs, font CDNs, complete icon/font packages, and speculative unused assets are prohibited.
- Standard browser HTTP caching is allowed. Service Worker, offline mode, Cache Storage management, custom persistent asset caching, and asset-cache migration are outside MVP scope.
- Each manifest asset must be requested no more than once per page load by application loading logic. Resize and Screen navigation do not repeat asset requests.

## 6. End-to-end lifecycle

### 6.1 Normal entry

```text
Page Load
→ Boot View
→ Session Initialized
→ Operations Screen
```

### 6.2 Base preparation

```text
Operations ↔ Hangar
```

During Base navigation, one authoritative shared session state retains:

- Credits;
- Aircraft;
- Hull Integrity;
- Primary Weapon;
- Pilot;
- Mouse Movement Enabled;
- Mission availability.

### 6.3 Mission start

```text
Operations
→ Mission Details Overlay
→ Start Mission
→ one Active Mission
→ Combat Screen
```

Exactly one Active Mission may exist. Base mutation is unavailable while Combat is active.

### 6.4 Mission Success

```text
Combat Success
→ apply result exactly once
→ Mission Result Overlay
→ Continue
→ Operations
```

### 6.5 Mission Defeat

```text
Hull Integrity <= 0
→ Defeat has priority
→ apply emergency recovery exactly once
→ Mission Result Overlay
→ Continue
→ Operations
```

### 6.6 Mission Aborted

```text
Combat
→ Pause Overlay
→ Return to Base
→ discard Combat runtime
→ apply Aborted result exactly once
→ Operations
```

No Mission Result Overlay is shown for Aborted.

### 6.7 Page refresh

Refresh from any Screen, Overlay, or Combat state:

```text
discard current session and Active Mission without reward
→ full page load
→ Boot View
→ one new initial session
→ Operations
```

## 7. Combat presentation decisions added by master audit

### 7.1 Player aircraft

- Asset: `assets/runtime/aircraft/german-fighter.png`.
- Rendered height: `12% of viewport short side`.
- Width preserves source aspect ratio.
- The aircraft points upward and is not cropped, deformed, rotated, or animated.
- Asset failure uses the approved light-grey upward-triangle fallback with unchanged gameplay geometry.

### 7.2 Movement margin

```text
movementMargin = 3% of viewport short side
```

The same margin applies to every edge and constrains the complete rendered aircraft sprite.

### 7.3 Enemy and projectile

- Basic Drone: solid `danger` square without asset, outline, animation, or rotation.
- Projectile: solid `text-primary` rectangle without outline, trail, glow, particle effect, or animation.
- Machine Gun and Cannon use the same projectile presentation.

### 7.4 Combat Hull Integrity Bar

```text
barWidth = 80% of rendered aircraft width
barHeight = 0.5rem
barGap = 1% of viewport short side
bar horizontal centre = aircraft horizontal centre
bar top edge = aircraft bottom edge + barGap
```

The Bar follows the aircraft, retains Hull ratio on resize, and does not affect collision geometry or Movement Bounds.

### 7.5 Combat damage feedback

- A non-destroying projectile hit makes the `Basic Drone` flash white for `50 ms`; the drone remains active and its hitbox remains enabled.
- A destroyed drone immediately loses its hitbox, flashes white for `100 ms`, and then disappears.
- Valid player contact damage updates Hull Integrity and its Bar immediately and makes the aircraft flash `danger` for `100 ms`.
- Contact during the player damage cooldown does not reduce player Hull Integrity and does not replay the aircraft flash; the drone still receives `25` damage.
- `God Mode` prevents both player Hull loss and the aircraft damage flash without changing enemy contact damage or destruction feedback.
- Defeat resolution does not wait for a damage flash to finish.
- Damage feedback uses no particles, glow, screen shake, knockback, or audio.

### 7.6 Global Settings contract

- The MVP has one Settings value in shared session state: `Mouse Movement Enabled`.
- Base and Combat use the same `Settings Overlay`, canonical Checkbox, and component implementation.
- The Overlay contains only `Mouse Movement Enabled` and `Close`; there is no `Save`, `Apply`, or `Reset`.
- A Checkbox change updates shared session state immediately.
- Base Settings are available from Operations and Hangar. Closing does not change the current Base Screen.
- Combat Settings can open only while Combat is active, running, and no blocking Overlay is open. Opening pauses Combat; `Close` or `Esc` resumes it.
- A command to open Settings while Combat is paused or a blocking Overlay is open is ignored.
- In running Combat, `F` changes the mutually exclusive control mode and synchronizes the shared setting. While a blocking Overlay or Base is visible, `F` has no Settings effect.
- Clicking outside Settings does not close it.
- The setting persists only for the current session and resets to `true` on refresh.
- Independent Base or Combat copies, additional setting categories, persistence, and automatic control-mode detection are prohibited.

### 7.7 Browser lifecycle contract

- Focus loss or a hidden tab in Base preserves the current Screen, blocking Overlay, and shared session state. Base does not open `Pause Overlay`.
- Base resize reflows the existing Screen and Overlay without closing or recreating them, repeating asset loading solely because of resize, or changing state.
- Layout below `1280 × 600` is unsupported, but changing viewport size must not mutate session state. No mobile layout or unsupported-size warning is included.
- Focus loss, a hidden tab, or resize during running Combat pauses simulation, opens one `Pause Overlay`, and requires explicit `Resume`.
- If Settings or Debug is open when a browser safety event occurs, that Overlay remains open. Closing it opens `Pause Overlay` instead of resuming Combat.
- If Pause is already open, browser events do not create another Overlay or pause state.
- Browser events while `Mission Result Overlay` is open do not modify or reapply mission result, reward, or shared state.
- Boot and fatal startup views may reflow, but browser events do not cancel or duplicate initialization, session creation, or application instances.
- Repeated focus, visibility, and resize events are idempotent and must not restart Screens or Combat, duplicate runtime state, or repeat reprojection for unchanged effective dimensions.
- In development, `F1` may perform the explicit single-Overlay handoff `Pause Overlay → Debug Overlay → Pause Overlay`; it never opens Debug over Settings or Mission Result.

### 7.8 Combat entry and boundary presentation

- Combat initializes the aircraft at viewport center `50% × 80%`, at zero velocity, inside Movement Bounds.
- Initial mouse target equals aircraft position and changes only after pointer movement inside the Combat viewport.
- A spawned drone is fully outside the viewport with its nearest hitbox edge touching its selected entry boundary; there is no additional spawn offset.
- Spawn coordinates account for full drone bounds. Group members spawn simultaneously, select entry data independently, and may overlap without repositioning.
- Drone entry uses no marker, warning, protection, fade, or animation. Its hitbox is active from creation.
- A projectile is created with its horizontal center aligned to the aircraft and its bottom edge aligned to the aircraft top edge. It is immediately visible and collision-active.
- A projectile remains active while any part is visible and is removed after its complete bounds leave the viewport.
- Combat follows the approved background–drone–projectile–aircraft–Hull Bar–utility–Overlay render order.
- Muzzle flash, projectile trail, random muzzle offset, automatic enemy separation, camera movement, and screen shake are prohibited.

### 7.9 Accessibility and keyboard boundary

- MVP UI is fully keyboard-operable and uses native semantic Buttons, Checkboxes, radio-group behaviour, and navigation semantics.
- All focused interactive controls use visible focus; disabled controls are skipped and cannot activate.
- Base follows the approved Navigation–Screen actions–Settings focus order.
- Each Overlay has an explicit initial control, traps sequential focus, and restores focus when its opener remains in context.
- Base Screen transitions move programmatic focus to the new Screen heading without adding it to sequential Tab order.
- Combat Pause and Settings controls are keyboard reachable; Tab alone does not pause gameplay, while `Enter` or `Space` activates the focused control.
- Blocking Combat Overlays suppress gameplay shortcuts except their explicitly approved operation or closing key.
- Hull Integrity Bar exposes `0–100` progress semantics without a visible numeric value.
- Important UI state is not communicated by colour alone, and non-essential motion respects `prefers-reduced-motion`.
- Formal WCAG certification, non-visual real-time Combat accessibility, Combat narration, remapping, contrast presets, colour-blind presets, text-size settings, skip links, and an Accessibility Settings category are outside MVP scope.

### 7.10 Whole-application performance budget

Performance is a continuous feature-completion gate. Each new system must fit the budget when introduced; optimization must not be deferred until feature accumulation is complete.

The approved whole-application budgets are:

```text
runtime asset manifest:        <= 2 MiB on disk
current runtime asset total:   1,578,953 bytes
total cold Boot response body: <= 3 MiB
local cold-cache Boot:         Operations interactive within 2 s
Boot safety deadline:          5 s
UI action response:            visible state begins within 100 ms
Combat target:                 60 FPS / 16.7 ms frame budget
Combat sustained floor:        not below 50 FPS
```

- Cold Boot is measured on the approved reference device from navigation start to interactive Operations, served from a local production static server with browser cache disabled. The `5 s` safety deadline remains the failure-path ceiling.
- Total cold Boot response body includes HTML, production JavaScript, CSS, and the approved Boot asset manifest. Response headers and browser-internal traffic are excluded.
- Base and blocking Overlays must not run application-authored continuous animation, polling, or state-mutation loops while idle.
- Screen navigation, Overlay opening, Checkbox changes, selection feedback, and Button feedback begin visibly within `100 ms` of valid input on the reference device.
- No repeatable application-attributable main-thread task longer than `50 ms` is allowed during Boot completion, Base interaction, or the representative Combat scenario.
- After Boot, application-driven asset loading causes no layout shift or late visual replacement.
- Combat retains its detailed reference-device scenario, FPS, entity cleanup, and five-mission lifecycle gates from the Combat Specification.
- After each of five consecutive missions, no obsolete Combat-owned entity, timer, schedule, listener, or Screen instance may remain. Post-cleanup memory must not show monotonic growth attributable to retained Combat state.
- Exact framework-specific chunk, tree-shaking, and dependency rules remain deferred until the repository configuration and delivery-command contract are approved; they must satisfy these product-level budgets.

### 7.11 Local delivery boundary

The production-mode artifact is a client-only static web application with one entry URL, delivered only for local play through `localhost`. Detailed acceptance is defined in `MVP_DELIVERY_SPEC_v0.1.md`.

- No backend, database, account, authentication, analytics, advertising, telemetry, remote content API, or runtime CDN is part of MVP.
- Development and final acceptance run through documented local HTTP servers on `localhost`.
- Direct `file://` execution is unsupported.
- The locally servable output contains production runtime files only and excludes source JPEGs, test files, development-only assets, and Debug UI activation.
- `DEV_MODE = false` in production and `F1` has no product effect.
- One build identifier is available for console diagnostics and performance records but is not shown in normal player UI.
- Hosting-provider selection, external deployment, public URL, publication, and release-channel work are outside the MVP. GitHub is source backup only.

## 8. Master acceptance criteria defined so far

### MASTER-AC-001 — Successful boot

**Given** required application initialization succeeds,  
**when** one page load completes,  
**then** exactly one initial session is created and `Operations Screen` opens without a Title Screen or separate start action.

### MASTER-AC-002 — Boot idempotency

**Given** initialization callbacks or asset completion signals occur repeatedly,  
**when** boot processing handles them,  
**then** no second application instance, session, Pilot selection, Screen, Credit grant, or reward is created.

### MASTER-AC-003 — Non-critical asset failure

**Given** a background, aircraft image, font, or icon fails to load,  
**when** application initialization otherwise succeeds,  
**then** the applicable fallback is displayed and Boot View does not remain active indefinitely.

### MASTER-AC-004 — Fatal initialization failure

**Given** application state or the primary runtime cannot initialize,  
**when** boot fails,  
**then** ordinary game UI is hidden, no partial session remains, and `Unable to start game.` with `Reload` only is displayed.

### MASTER-AC-005 — Complete repeatable loop

**Given** a new session,  
**when** the player prepares the aircraft, starts and resolves a mission, and returns to Operations,  
**then** shared state reflects the result exactly once and the same Interception mission can be started again.

### MASTER-AC-006 — No audio subsystem

**Given** any MVP Screen, Overlay, Combat action, or result,  
**when** the application runs,  
**then** no music, sound effect, UI sound, audio asset, volume or mute control, Audio Settings, AudioContext initialization, or audio-unlock prompt is present.

### MASTER-AC-007 — Combat damage feedback does not alter resolution

**Given** an enemy or the player receives damage,  
**when** the approved damage flash is displayed,  
**then** gameplay-state changes occur immediately and the flash does not delay damage, collision removal, destruction, defeat, or mission resolution.

### MASTER-AC-008 — Shared Settings consistency

**Given** the player changes `Mouse Movement Enabled` through Base Settings, Combat Settings, or `F` during running Combat,  
**when** another eligible Screen or the active Combat control system reads Settings,  
**then** it reads the same updated shared-session value without an independent copy, and page refresh resets that value to `true`.

### MASTER-AC-009 — Browser lifecycle preserves product state

**Given** one or more focus, visibility, or viewport-size events occur during Boot, Base, Combat, or a blocking Overlay,  
**when** the application processes those events,  
**then** it applies the approved reflow or Combat safety pause exactly once without changing or duplicating session creation, shared state, runtime state, mission result, or reward.

### MASTER-AC-010 — Deterministic Combat entry geometry

**Given** Combat begins and entities are created at the player muzzle or an enemy entry boundary,  
**when** their initial geometry is calculated,  
**then** the approved viewport-relative positions and full-bounds rules are applied without an implementation-defined offset, automatic separation, or hidden entry effect.

### MASTER-AC-011 — Keyboard-only UI completion

**Given** any MVP Screen or Overlay is used without a pointer,  
**when** the player navigates and activates its available UI actions,  
**then** every enabled action is reachable and operable in the approved focus order, focus remains visible and contained where required, and transitions place focus in the defined destination.

### MASTER-AC-012 — Bounded complete preload

**Given** critical application initialization succeeds,  
**when** all approved runtime asset requests settle or the preload reaches `5 s`, whichever occurs first,  
**then** Boot creates exactly one session and opens Operations using each prepared asset or its approved stable fallback.

### MASTER-AC-013 — Late asset completion is inert

**Given** an asset missed the `5 s` preload deadline,  
**when** its request completes later,  
**then** it does not replace the fallback, shift layout, reopen a Screen, repeat Boot, or create another session during that page load.

### MASTER-AC-014 — Runtime request boundary

**Given** one production page load traverses Operations, Hangar, Overlays, and Combat,  
**when** runtime requests are inspected,  
**then** application loading logic requests each approved manifest asset no more than once and requests no source JPEG, remote image, font CDN, complete icon/font package, or speculative asset.

### MASTER-AC-015 — Whole-application performance gate

**Given** the production build runs on the approved reference device through the defined Boot, Base, and representative Combat scenarios,  
**when** recorded performance evidence is reviewed,  
**then** transfer, startup, interaction, main-thread, frame-rate, and cleanup measurements satisfy every approved budget before the milestone is complete.

### MASTER-AC-016 — Local delivery boundary

**Given** a production build is created,  
**when** its locally servable output and runtime network activity are inspected,  
**then** it runs through the documented localhost static server as a client-only application with Debug Mode disabled, no prohibited source or development assets, and no backend, telemetry, remote-content, CDN, external-hosting, or public-URL dependency.

## 9. Master-audit closure

The master audit closed all identified product and cross-system categories:

- Boot, asset timing, and failure handling;
- complete Base-to-Combat lifecycle and shared state;
- Combat presentation and damage feedback;
- Settings and browser lifecycle integration;
- accessibility and keyboard traversal;
- whole-application performance and localhost delivery;
- canonical terminology;
- full requirements-to-acceptance traceability.

Audit accounting:

```text
Master acceptance criteria:        16
Base acceptance criteria:          53
Combat acceptance criteria:        82
Design System acceptance criteria: 20
Delivery acceptance criteria:      5
Narrative acceptance criteria:     5
Runtime preload assets verified:   12
Runtime asset total verified:      1,578,953 bytes
Within-document duplicate/missing AC numbers: 0
Open S0–S2 product gaps:            0
```

## 10. Readiness

The complete MVP product scope and technical package are **READY FOR IMPLEMENTATION**. No unresolved S0–S2 product or technical behaviour remains in the approved MVP scope.

The final audit passed on `2026-08-20`. DeepSeek feature implementation is authorized only through explicitly assigned slices and remains governed by `AGENTS.md`, the project skills, source-qualified Acceptance Criteria, negative requirements, and mandatory verification gates.

Final product-scope consistency review passed on `2026-08-20`.

### 10.1 Audio negative requirements

Audio is explicitly `OUT OF SCOPE` for the MVP. The implementation must not add:

- music;
- weapon, collision, destruction, mission, or UI sounds;
- audio assets;
- volume or mute controls;
- Audio Settings;
- AudioContext initialization;
- an audio-unlock interaction.

All required MVP feedback must remain understandable without audio.

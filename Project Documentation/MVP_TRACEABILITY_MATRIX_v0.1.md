# MVP Requirements Traceability Matrix v0.1

**Product:** Shmup  
**Scope:** Complete MVP requirement-to-acceptance coverage  
**Status:** READY  

## 1. Purpose

This matrix proves coverage at the normative section level. Detailed Given/When/Then wording remains in the authoritative source documents.

Acceptance Criterion identity is the source document plus its local ID. `Base AC-001` and `Combat AC-001` are different criteria. Agents and reports must always include the source qualifier for unprefixed `AC-*` identifiers.

A row is complete only when:

1. its normative requirement source is identified;
2. positive behaviour has acceptance coverage;
3. negative scope is explicit in the source or a master acceptance criterion;
4. no implementation freedom is created by the summary in this matrix.

## 2. Master and cross-system coverage

| Requirement domain | Authoritative source | Acceptance coverage | Negative or boundary coverage | Status |
|---|---|---|---|---|
| Boot view and successful initialization | Master §§5.1–5.2 | MASTER-AC-001 | No Title Screen, Main Menu, or Start Game | Covered |
| Initialization idempotency | Master §5.5 | MASTER-AC-002 | No duplicate session, Pilot, Screen, Credit, reward, or runtime | Covered |
| Non-critical and fatal startup failure | Master §§5.3–5.4 | MASTER-AC-003–004 | Asset failure is non-fatal; partial state prohibited | Covered |
| Bounded runtime preload | Master §5.6 | MASTER-AC-012–014 | No retry, late swap, CDN, source JPEG, or repeated request | Covered |
| Complete repeatable loop | Master §§3, 6 | MASTER-AC-005 | Exactly one Active Mission and result application | Covered |
| Audio exclusion | Master §10.1 | MASTER-AC-006 | Entire audio subsystem explicitly absent | Covered |
| Combat damage feedback integration | Master §7.5 | MASTER-AC-007 | Feedback cannot delay state resolution | Covered |
| Shared Settings integration | Master §7.6 | MASTER-AC-008 | One state value; no persistence or extra categories | Covered |
| Browser lifecycle | Master §7.7 | MASTER-AC-009 | Events cannot duplicate or mutate product state | Covered |
| Combat entry geometry | Master §7.8 | MASTER-AC-010 | No hidden offsets or entry effects | Covered |
| Accessibility boundary | Master §7.9 | MASTER-AC-011 | Non-visual Combat and formal certification not claimed | Covered |
| Whole-app performance | Master §7.10; Combat §14 | MASTER-AC-015; Combat AC-047–048 | S14 requires labelled proxy evidence; physical validation remains mandatory before external playtest or minimum-spec claim | Covered; physical external gate pending |
| Local delivery | Master §7.11; Delivery §§1–8 | MASTER-AC-016; DELIVERY-AC-001–005 | No backend, telemetry, CDN, external hosting, public URL, publication, or Debug production UI | Covered |
| Durable narrative constraints | Narrative Rules §§2–7 | NARRATIVE-AC-001–005 | No forced MVP narrative features, hidden national bonuses, or Russian representation | Covered |

## 3. Base and pre-Combat coverage

| Requirement domain | Source sections | Acceptance coverage | Status |
|---|---|---|---|
| Initial Base state and Pilot | Base §§9.1–9.3 | Base AC-001, AC-037, AC-040 | Covered |
| Base Navigation and blocking | Base §§3.1–3.5, 9.6 | Base AC-002–005, AC-036 | Covered |
| Global Settings | Base §3.6 | Base AC-006, AC-039, AC-044–045 | Covered |
| Responsive Base layout | Base §3.8 | Base AC-041–042, AC-047–048 | Covered |
| Operations composition and mission point | Base §§4.1–4.6 | Base AC-007–009 | Covered |
| Mission Details and mission start | Base §§5.1–5.6, 9.4 | Base AC-010–014, AC-031, AC-035 | Covered |
| Hangar composition and aircraft | Base §§6.1–6.6 | Base AC-015–019 | Covered |
| Weapon Selection | Base §§7.1–7.6 | Base AC-020–024, AC-050 | Covered |
| Repair | Base §§8.1–8.6 | Base AC-025–030 | Covered |
| Mission-result integration | Base §9.5 | Base AC-032–034 | Covered |
| Session consistency and refresh | Base §§9.3, 9.7 | Base AC-037–040 | Covered |
| Base browser lifecycle | Base §9.8 | Base AC-046–048 | Covered |
| Base keyboard and focus | Base §9.9 | Base AC-049–052 | Covered |
| Prepared runtime assets | Base §9.10 | Base AC-043, AC-053 | Covered |
| Base negative scope | Base §§3.7, 4.7, 5.7, 6.7, 7.7, 8.7 | Explicit prohibited-content lists plus applicable AC above | Covered |

## 4. Combat coverage

| Requirement domain | Source sections | Acceptance coverage | Status |
|---|---|---|---|
| Combat Screen, background, HUD, aircraft, render order | Combat §4 | Combat AC-001–003, AC-049–057, AC-078, AC-081–082 | Covered |
| Control modes and initial control state | Combat §5 | Combat AC-004–007, AC-064–065, AC-070–071 | Covered |
| Movement model and bounds | Combat §6 | Combat AC-004–008, AC-045, AC-070 | Covered |
| Enemy type, movement, spawning, entry, escape | Combat §§7.1–7.5 | Combat AC-009, AC-014–018, AC-028–030, AC-049, AC-054, AC-072–075 | Covered |
| Contact damage, cooldown, and collision response | Combat §§7.1, 7.6–7.7 | Combat AC-010–013, AC-051, AC-059–060 | Covered |
| Weapons, fire rate, and projectiles | Combat §§8.1–8.4 | Combat AC-019–023, AC-025–027, AC-050, AC-055, AC-076–077 | Covered |
| Enemy destruction and damage feedback | Combat §§8.5–8.5.1 | Combat AC-024, AC-058–062 | Covered |
| Mission schedule, Success, Defeat, and result | Combat §9 | Combat AC-010, AC-028–036, AC-062, AC-068 | Covered |
| Pause, Settings, Aborted, and utility controls | Combat §10 | Combat AC-037–038, AC-052, AC-063–067, AC-079–080 | Covered |
| Debug Mode | Combat §11 | Combat AC-039–043, AC-061, AC-066, AC-080 | Covered |
| Browser lifecycle and refresh | Combat §12 | Combat AC-044–046, AC-066–069, AC-082 | Covered |
| Performance and cleanup | Combat §14 | Combat AC-047–048 | Covered for local-only S14 by proxy and cleanup evidence; physical external gate pending |
| Combat negative scope | Combat §§4, 7–8, 12.1, 12.6, 13 | Explicit prohibited-behaviour lists plus applicable AC above | Covered |

## 5. Design System coverage

| Requirement domain | Source sections | Acceptance coverage | Status |
|---|---|---|---|
| Tokens and prohibited arbitrary values | Design System §6 | DS-AC-001 | Covered |
| Component inventory and reuse | Design System §§7–8 | DS-AC-002, DS-AC-006 | Covered |
| Interaction states | Design System §9 | DS-AC-003–004 | Covered |
| Overlay behaviour | Design System §§8.5, 8.16–8.25 | DS-AC-005–006, DS-AC-014 | Covered |
| Responsive minimum viewport | Design System §6.7 | DS-AC-007 | Covered |
| Fonts, icons, and fallbacks | Design System §§4–5, 13.1–13.2 | DS-AC-008–010, DS-AC-018–019 | Covered |
| Reduced motion | Design System §6.6 | DS-AC-011 | Covered |
| Controlled extension | Design System §§2.2, 11–12 | DS-AC-012 | Covered |
| Semantic keyboard accessibility | Design System §10 | DS-AC-013–017 | Covered |
| Mandatory UI governance | Design System §14 | DS-AC-017, DS-AC-020 | Covered |

## 6. Coverage accounting

```text
Master acceptance criteria:        MASTER-AC-001–016
Base acceptance criteria:          AC-001–053
Combat acceptance criteria:        AC-001–082
Design System acceptance criteria: DS-AC-001–020
Delivery acceptance criteria:      DELIVERY-AC-001–005
Narrative acceptance criteria:     NARRATIVE-AC-001–005
```

Every acceptance criterion belongs to one requirement domain above. No orphan criterion or uncovered normative section remains at the time of this audit.

## 7. Change rule

Any requirement addition, removal, or behavioural change must update in the same change:

1. its authoritative specification;
2. applicable acceptance criteria;
3. this traceability matrix;
4. the Master Design Document if cross-system behaviour or scope changes;
5. the canonical glossary if terminology changes.

A change is incomplete if traceability is not updated.

## 8. Shmup v0.2 Tactical Combat Foundation coverage

The authoritative source is `SHMUP_V0.2_TACTICAL_COMBAT_FOUNDATION_SPECIFICATION.md`. Work Item ownership is defined in `SHMUP_V0.2_IMPLEMENTATION_SLICES.md`. The MVP rows above remain historical coverage and are superseded only where the v0.2 specification says so explicitly.

| v0.2 requirement domain | Source sections | Acceptance coverage | Work Item owner | Status |
|---|---|---|---|---|
| Initial progression, unlock, and replay | §§5, 7, 13, 14 | V02-AC-001–002 | V02-WI-03 | Covered |
| Authored timelines, Arrival Groups, Spawn Placements, and no reactive spawn cheating | §§6–8.2.1 | V02-AC-003–004 | V02-WI-03 data foundation; V02-WI-04 Mission 01 runtime consumption; V02-WI-05 Mission 02 runtime consumption | Covered; staged runtime ownership explicit |
| Combat Countdown and Critical Hull | §§8, 13, 15; Design System §8.26 | V02-AC-005, V02-AC-022 | V02-WI-04 | Covered |
| Ranged activation, cadence stream, projectile geometry, and attack | §§9.2, 10; Technical Foundation §8 | V02-AC-006, V02-AC-011 | V02-WI-04 implementation; V02-WI-05 Mission 02 integration/regression | Covered |
| Hunter approach, commitment, and outcomes | §§9.3, 11.2, 12 | V02-AC-007–008 | V02-WI-04 implementation; V02-WI-05 Mission 02 integration/regression | Covered |
| Elite entry, phases, and bounded attacks | §§8.3, 9.4, 10 | V02-AC-009–010 | V02-WI-06 | Covered |
| Projectile and regular-contact lifecycle | §§10–11 | V02-AC-011–012 | V02-WI-04 implementation; V02-WI-05 Mission 02 integration/regression | Covered |
| Success economy, result commitment, exit, and result composition | §§12.1–12.2, 13.3, 15.4; Design System §8.26 | V02-AC-013, V02-AC-023 | V02-WI-04 | Covered |
| Evacuation commitment and result | §§12.3, 13.4, 13.7, 15 | V02-AC-014–015 | V02-WI-05 | Covered; terminal set, exact countdown/exit, and save recovery explicit |
| Defeat, paid Repair, Game Over, and terminal-save recovery | §§12.4, 13.5–13.7 | V02-AC-016, V02-AC-020 | V02-WI-05 alternate-outcome consumption of the accepted persistence boundary | Covered |
| New Game and Settings separation | §§13.6, 14.1 | V02-AC-017 | V02-WI-02 | Covered |
| Active-mission recovery and hidden-tab pause | §§14.3–14.4 | V02-AC-018–019 | V02-WI-02 | Covered |
| Atomic persistence and corrupted-save recovery | §§13.2, 14.1–14.2 | V02-AC-020–021 | V02-WI-02 | Covered |
| Minimal Combat UI and terminal result UX | §15; Design System §8.26 | V02-AC-022–023 | V02-WI-04 Success; V02-WI-05 alternate outcomes and compatibility-seam removal | Covered; staged boundary explicit |
| Enemy visual vocabulary and runtime asset contract | §16 | V02-AC-024–025 | V02-WI-01 asset layer; V02-WI-07 final three-mission traversal | Covered; staged evidence ownership explicit |
| Debug authority | §17 | V02-AC-026 | V02-WI-07 | Covered |
| Cleanup and repeated missions | §§13, 18, 20 | V02-AC-027 | V02-WI-07 | Covered |
| Representative performance workloads | §§16, 20.1 | V02-AC-028 | V02-WI-07 | Covered |

The negative requirements in §18 apply to every Work Item. Every handoff must cite its owned AC, relevant negative requirements, preceding accepted revision, and exact verification gates. No v0.2 AC is orphaned.

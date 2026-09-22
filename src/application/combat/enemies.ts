import type { EnemyType } from '@domain/index';
import type { Mulberry32 } from '@domain/random';
import { ELITE_DRONE, enemyRenderedBounds } from '../content';

/**
 * Authoritative v0.2 regular-enemy state (Epic §9, V02-DEC-019, V02-WI-04).
 * Basic, Ranged, and Hunter are distinct typed simulation states — no generic
 * entity framework. Every enemy carries its own complete rendered bounds
 * (width × height, px) and that AABB is the single rectangle used for spawn
 * placement, first-visibility/activation, collision, and escape — never a
 * superseded v0.1 square or an alpha-pixel mask.
 *
 * Entry contract (V02-DEC-018): every enemy starts fully outside its selected
 * boundary with the nearest edge of its complete bounds touching that boundary
 * and no additional hidden offset. Top entries spawn above the viewport and
 * travel straight down; Side entries travel horizontally inward at the role
 * movement speed until their complete bounds are fully inside the viewport.
 *
 * V02-WI-06 E01 adds the explicit Elite state (`EliteEnemyState`): one authored
 * Elite with its own fixed-anchor activation transition and its authoritative
 * `Armoured 12 s → Vulnerable 6 s` phase foundation (Epic §9.4, V02-AC-009).
 * The Elite never uses the regular-enemy factory, the full-bounds activation
 * rule, or escape; unsupported enemy types are rejected explicitly instead of
 * falling through to a regular role.
 *
 * V02-WI-06 E02 adds the canonical Elite entry and horizontal movement owned by
 * `stepElite` (Epic §9.4, V02-DEC-033): the Elite is created fully above the
 * Top boundary, descends at `12% VH/s`, and clamps exactly to its
 * `50% VW, 20% VH` anchor while activating idempotently on the same step.
 * Its active horizontal direction comes only from the dedicated deterministic
 * `elite-movement` stream, and the complete current-phase bounds always stay
 * inside the viewport. Elite attacks (cannon/Core) are the active-phase attack
 * step owned by `combat-simulation.ts`; this module owns movement, the phase
 * boundary, and the attack-timer initialization that boundary requires.
 */

export type EnemyEntryRegion = 'top' | 'upper-left' | 'upper-right';

/** Elite `Armoured` phase duration: `12 s` = exactly 720 fixed steps (§9.4). */
export const ELITE_ARMOURED_PHASE_STEPS = 720;
/** Elite `Vulnerable` phase duration: `6 s` = exactly 360 fixed steps (§9.4). */
export const ELITE_VULNERABLE_PHASE_STEPS = 360;
/** Full Elite phase cycle (`Armoured 12 s → Vulnerable 6 s`, §9.4). */
export const ELITE_PHASE_CYCLE_STEPS =
  ELITE_ARMOURED_PHASE_STEPS + ELITE_VULNERABLE_PHASE_STEPS;
/** Fixed Elite anchor centre horizontal fraction (`50% VW`, Epic §9.4). */
export const ELITE_ANCHOR_VIEWPORT_FRACTION_X = 0.5;
/** Fixed Elite anchor centre vertical fraction (`20% VH`, Epic §9.4). */
export const ELITE_ANCHOR_VIEWPORT_FRACTION_Y = 0.2;
/** Elite straight-down Top-entry speed `12% VH/s` (Epic §9.4, V02-DEC-033). */
export const ELITE_ENTRY_SPEED_VIEWPORT_HEIGHT_PER_SECOND = 0.12;
/** Elite active horizontal speed `12% VW/s` (Epic §9.4). */
export const ELITE_HORIZONTAL_SPEED_VIEWPORT_WIDTH_PER_SECOND = 0.12;
/**
 * Scheduled horizontal decision interval: `interval = 90 + nextInt(121)`
 * (Epic §9.4, V02-DEC-033), i.e. `90–210` fixed steps = `1.5–3.5 s`.
 */
export const ELITE_MOVEMENT_MIN_INTERVAL_STEPS = 90;
export const ELITE_MOVEMENT_INTERVAL_DRAW_RANGE = 121;
/** Fresh cannon timer every newly entered `Armoured` phase: `1.5 s` (§9.4). */
export const ELITE_CANNON_INTERVAL_STEPS = 90;
/** Fresh Core timer every newly entered `Vulnerable` phase: `2.5 s` (§9.4). */
export const ELITE_CORE_INTERVAL_STEPS = 150;

/** Fields shared by every regular-enemy state. */
interface EnemyCommonState {
  /** Stable monotonic identity per mission (presentation visual-map key). */
  readonly id: number;
  readonly type: EnemyType;
  /** Initialized from the content definition; reduced only by valid hits. */
  readonly hullIntegrity: number;
  /** Complete rendered-bounds centre; authoritative geometry in px. */
  readonly centerX: number;
  readonly centerY: number;
  /** Complete configured rendered bounds (V02-DEC-019) in px. */
  readonly width: number;
  readonly height: number;
  /** The entry boundary this enemy was spawned against. */
  readonly entry: EnemyEntryRegion;
  /**
   * Permanent latch (v0.1 Combat §7.5, AC-018): true once any portion of the
   * complete bounds was inside the visible viewport. Escape eligibility.
   */
  readonly hasEnteredVisibleArea: boolean;
  /**
   * Permanent latch: true once the complete bounds are fully inside the
   * visible viewport. Ranged activation and Hunter Approach begin on this step.
   */
  readonly activated: boolean;
  /**
   * Stable deterministic enemy identity (Epic §9.2, V02-AC-006): the zero-based
   * authored mission-member ordinal for an authored enemy, and a
   * non-colliding Debug identity (outside the authored member-ordinal range) for
   * a development Debug-spawned enemy (V02-WI-07 D01-C01). It is the
   * deterministic `ranged-fire` / `elite-movement` per-enemy stream key for the
   * roles that own a stream. Never removal-sensitive or derived from runtime
   * state, and never shared between two live enemies.
   */
  readonly ordinal: number;
}

export interface BasicEnemyState extends EnemyCommonState {
  readonly kind: 'basic';
}

export interface RangedEnemyState extends EnemyCommonState {
  readonly kind: 'ranged';
  /**
   * Running fixed steps until the next shot. Set to `180` on the activation
   * step (first shot after exactly 180 running fixed steps); each later
   * interval resets to `60 + rangedFireStream.nextInt(121)` after an actual
   * shot. A Ranged destroyed before its next shot consumes no further draw.
   */
  readonly firingStepsRemaining: number;
}

export interface HunterEnemyState extends EnemyCommonState {
  readonly kind: 'hunter';
  readonly phase: 'entering' | 'approach' | 'committed';
  /** Locked unit direction at commitment (never changed afterwards). */
  readonly committedVx: number;
  readonly committedVy: number;
  /** Running fixed steps elapsed since Approach began (Epic §9.3 `2.0 s`). */
  readonly approachStepsElapsed: number;
}

export type CombatEnemy =
  BasicEnemyState | RangedEnemyState | HunterEnemyState | EliteEnemyState;

/**
 * Authoritative Elite phase (Epic §9.4, V02-AC-009). `entering` covers creation
 * and the later movement owner's entry to the anchor and consumes no phase or
 * attack time; the explicit `activateElite` transition enters `armoured`, after
 * which the fixed `armoured → vulnerable` cycle repeats until destruction.
 */
export type ElitePhase = 'entering' | 'armoured' | 'vulnerable';

/**
 * The one authored Elite's authoritative state (Epic §9.4, V02-WI-06 E01).
 * `width`/`height` are the complete rendered bounds of the CURRENT phase state
 * (Epic §16.1/§16.4), so the authoritative AABB always equals what the matching
 * sprite renders; `phase`, `phaseStepsElapsed`, and `phaseStepsRemaining` are
 * the authoritative phase facts exposed to later Debug/presentation consumers.
 * The Elite never escapes and is never created through the regular factory.
 */
export interface EliteEnemyState extends EnemyCommonState {
  readonly kind: 'elite';
  readonly phase: ElitePhase;
  /** Elapsed fixed steps inside the current active phase (0 on its first step). */
  readonly phaseStepsElapsed: number;
  /** Remaining fixed steps in the current active phase, this step included. */
  readonly phaseStepsRemaining: number;
  /**
   * Active horizontal direction (`-1` left, `1` right) from the dedicated
   * `elite-movement` stream. `null` while entering and until the activation
   * decision has been applied; a boundary, phase-geometry, or resize clamp may
   * force it inward without consuming a draw or resetting the decision timer.
   */
  readonly horizontalDirection: -1 | 1 | null;
  /** Remaining executed fixed steps of the current scheduled movement decision. */
  readonly movementDecisionStepsRemaining: number;
  /**
   * Remaining executed fixed steps until the owning phase's next attack (owned
   * by the active-phase attack step). `0` while entering and, for a Vulnerable
   * Core at the launch cap, while the due launch is held.
   */
  readonly attackStepsRemaining: number;
}

/** One drawn Elite horizontal movement decision (Epic §9.4, V02-DEC-033). */
export interface EliteMovementDecision {
  /** `-1` left (`nextInt(2) === 0`), `1` right (`nextInt(2) === 1`). */
  readonly direction: -1 | 1;
  /** `90 + nextInt(121)` executed fixed steps, inclusive `90–210`. */
  readonly intervalSteps: number;
}

/**
 * Draws exactly one movement decision in the canonical order (Epic §9.4,
 * V02-DEC-033): direction first (`nextInt(2)`), then the decision interval
 * (`90 + nextInt(121)`). Activation and every scheduled decision consume this
 * same pair in this same order, so the replay sequence is exact.
 */
export function drawEliteMovementDecision(
  stream: Mulberry32,
): EliteMovementDecision {
  const direction = stream.nextInt(2) === 0 ? -1 : 1;
  const intervalSteps =
    ELITE_MOVEMENT_MIN_INTERVAL_STEPS +
    stream.nextInt(ELITE_MOVEMENT_INTERVAL_DRAW_RANGE);
  return { direction, intervalSteps };
}

export interface EnemyStepInput {
  /** Downward / approach speed in px/s (role content × current viewport height). */
  readonly movementSpeedPx: number;
  /** Committed Attack Run speed in px/s (Hunter `26%`; others unused). */
  readonly committedSpeedPx: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly stepSeconds: number;
  readonly aircraftCenterX: number;
  readonly aircraftCenterY: number;
  /**
   * The Elite's dedicated deterministic `elite-movement` stream, present only
   * for an Elite (supplied by the simulation from that Elite's stable identity:
   * its authored mission-member ordinal, or its non-colliding Debug identity for
   * a development Debug spawn, V02-WI-07 D01-C01). No other role consumes it, and
   * no draw happens when it is absent.
   */
  readonly eliteMovementStream?: Mulberry32 | undefined;
}

export interface EnemyStepResult {
  /** The advanced enemy, or `null` when it fully escaped this step. */
  readonly enemy: CombatEnemy | null;
  /** True exactly once, on the step the complete bounds became fully inside. */
  readonly newlyActivated: boolean;
}

/**
 * Common creation helper for the authored-staging spawn (V02-DEC-018): the
 * nearest edge of the complete bounds touches the selected boundary and the
 * non-entry axis is placed from the normalized authored fraction.
 */
export function spawnEnemyFromPlacement(input: {
  readonly id: number;
  readonly type: EnemyType;
  readonly hullIntegrity: number;
  readonly width: number;
  readonly height: number;
  readonly placement:
    | { readonly kind: 'top'; readonly engagementBandFraction: number }
    | {
        readonly kind: 'side';
        readonly side: 'upper-left' | 'upper-right';
        readonly yViewportFraction: number;
      };
  /** Aircraft engagement-band horizontal range used only by Top projections
   *  (V02-AC-004: the authored normalized fraction is projected inside it). */
  readonly boundsMinX?: number;
  readonly boundsMaxX?: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly ordinal: number;
}): CombatEnemy {
  const halfWidth = input.width / 2;
  const halfHeight = input.height / 2;
  if (input.placement.kind === 'top') {
    // Project the already-authored normalized fraction inside the current
    // engagement band (V02-AC-004); the centre is clamped so the complete
    // bounds stay inside the band horizontally.
    const boundsMinX = input.boundsMinX ?? input.width / 2;
    const boundsMaxX =
      input.boundsMaxX ?? input.viewportWidth - input.width / 2;
    const raw =
      boundsMinX +
      input.placement.engagementBandFraction * (boundsMaxX - boundsMinX);
    const centerX = clamp(raw, boundsMinX + halfWidth, boundsMaxX - halfWidth);
    return createEnemyState({
      id: input.id,
      type: input.type,
      hullIntegrity: input.hullIntegrity,
      centerX,
      centerY: -halfHeight,
      width: input.width,
      height: input.height,
      entry: 'top',
      ordinal: input.ordinal,
    });
  }
  const centerY = input.placement.yViewportFraction * input.viewportHeight;
  return createEnemyState({
    id: input.id,
    type: input.type,
    hullIntegrity: input.hullIntegrity,
    centerX:
      input.placement.side === 'upper-left'
        ? -halfWidth
        : input.viewportWidth + halfWidth,
    centerY,
    width: input.width,
    height: input.height,
    entry: input.placement.side,
    ordinal: input.ordinal,
  });
}

function createEnemyState(input: {
  readonly id: number;
  readonly type: EnemyType;
  readonly hullIntegrity: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly width: number;
  readonly height: number;
  readonly entry: EnemyEntryRegion;
  readonly ordinal: number;
}): CombatEnemy {
  const common = {
    id: input.id,
    type: input.type,
    hullIntegrity: input.hullIntegrity,
    centerX: input.centerX,
    centerY: input.centerY,
    width: input.width,
    height: input.height,
    entry: input.entry,
    hasEnteredVisibleArea: false,
    activated: false,
    ordinal: input.ordinal,
  };
  if (input.type === 'basic-drone') {
    return { ...common, kind: 'basic' };
  }
  if (input.type === 'ranged-drone') {
    return { ...common, kind: 'ranged', firingStepsRemaining: 0 };
  }
  if (input.type === 'hunter-drone') {
    return {
      ...common,
      kind: 'hunter',
      phase: 'entering',
      committedVx: 0,
      committedVy: 0,
      approachStepsElapsed: 0,
    };
  }
  // V02-WI-06 E01: explicit rejection instead of a regular-role fallthrough.
  // The one authored Elite is never built by the regular-enemy factory (which
  // would otherwise interpret it as a Hunter); its authored staging consumer
  // creates it through `createEliteAtAnchor`.
  if (input.type === 'elite-drone') {
    throw new Error(
      'Combat enemy factory rejected elite-drone: the Elite is created only through `createEliteAtAnchor` and never through the regular-enemy spawn path.',
    );
  }
  throw new Error(
    `Combat enemy factory rejected the unsupported enemy type "${String(input.type)}".`,
  );
}

/**
 * One deterministic fixed-step movement (Epic §9.1–9.3):
 * - Basic/Ranged: side entries travel horizontally inward at the role movement
 *   speed until fully inside, then travel straight down at that speed.
 * - Hunter: horizontal Side Entry at the approach speed until fully inside;
 *   then `Approach` steers directly toward the Aircraft's current centre at
 *   `18% VH/s` (no predictive lead); the first of vertical distance `≤ 35% VH`
 *   or `2.0 s` since Approach began locks the direction at `26% VH/s`.
 * A side/top entry can never escape during its initial entry. An enemy that
 * has entered and now fully exits any boundary is returned as `null` (Escaped).
 * The Elite is routed to `stepElite` (V02-WI-06 E01/E02): it is never activated
 * by full-bounds entry, it owns its own Top-entry descent and activation, its
 * horizontal movement, and its phase boundary, and it never escapes (Epic §9.4).
 */
export function stepEnemy(
  enemy: CombatEnemy,
  input: EnemyStepInput,
): EnemyStepResult {
  if (enemy.kind === 'elite') {
    return stepElite(enemy, input);
  }
  const positioned =
    enemy.kind === 'hunter'
      ? stepHunter(enemy, input)
      : stepRegular(enemy, input);
  const fullyInside = isEnemyFullyInsideViewport(
    positioned,
    input.viewportWidth,
    input.viewportHeight,
  );
  const newlyActivated = !positioned.activated && fullyInside;
  const next = newlyActivated ? activateEnemy(positioned) : positioned;
  let escaped = false;
  if (
    next.hasEnteredVisibleArea &&
    isEnemyFullyOutsideViewport(next, input.viewportWidth, input.viewportHeight)
  ) {
    escaped = true;
  }
  return { enemy: escaped ? null : next, newlyActivated };
}

/** Basic/Ranged movement: side entry inward until fully inside, then straight
 *  down at the role movement speed. */
function stepRegular(
  enemy: BasicEnemyState | RangedEnemyState,
  input: EnemyStepInput,
): BasicEnemyState | RangedEnemyState {
  if (
    enemy.entry !== 'top' &&
    !isEnemyFullyInsideViewport(
      enemy,
      input.viewportWidth,
      input.viewportHeight,
    )
  ) {
    const direction = enemy.entry === 'upper-left' ? 1 : -1;
    return {
      ...enemy,
      centerX:
        enemy.centerX + direction * input.movementSpeedPx * input.stepSeconds,
      hasEnteredVisibleArea:
        enemy.hasEnteredVisibleArea ||
        isEnemyAnyPortionVisible(
          enemy,
          input.viewportWidth,
          input.viewportHeight,
        ),
    };
  }
  return {
    ...enemy,
    centerY: enemy.centerY + input.movementSpeedPx * input.stepSeconds,
    hasEnteredVisibleArea:
      enemy.hasEnteredVisibleArea ||
      isEnemyAnyPortionVisible(
        enemy,
        input.viewportWidth,
        input.viewportHeight,
      ),
  };
}

/** Hunter state machine (Epic §9.3, V02-AC-007): entering → approach →
 *  committed. */
function stepHunter(
  enemy: HunterEnemyState,
  input: EnemyStepInput,
): HunterEnemyState {
  const hasEntered = (state: HunterEnemyState): boolean =>
    state.hasEnteredVisibleArea ||
    isEnemyAnyPortionVisible(state, input.viewportWidth, input.viewportHeight);
  if (enemy.phase === 'entering') {
    if (
      isEnemyFullyInsideViewport(
        enemy,
        input.viewportWidth,
        input.viewportHeight,
      )
    ) {
      // Full-bounds entry completes: begin Approach, targeting, and the 2.0 s
      // commitment timer only on this authoritative step (V02-DEC-020).
      return {
        ...enemy,
        hasEnteredVisibleArea: hasEntered(enemy),
        phase: 'approach',
        approachStepsElapsed: 0,
      };
    }
    const direction = enemy.entry === 'upper-left' ? 1 : -1;
    const movedX =
      enemy.centerX + direction * input.movementSpeedPx * input.stepSeconds;
    // V02-WI-04 C01: Approach begins on the exact step the MOVED complete
    // bounds first become fully inside — the previous code checked only the
    // pre-move position and stalled one step after crossing the boundary.
    const moved: HunterEnemyState = {
      ...enemy,
      centerX: movedX,
      hasEnteredVisibleArea: hasEntered(enemy),
    };
    if (
      isEnemyFullyInsideViewport(
        moved,
        input.viewportWidth,
        input.viewportHeight,
      )
    ) {
      return {
        ...moved,
        phase: 'approach',
        approachStepsElapsed: 0,
      };
    }
    return moved;
  }
  if (enemy.phase === 'approach') {
    const dx = input.aircraftCenterX - enemy.centerX;
    const dy = input.aircraftCenterY - enemy.centerY;
    const distance = Math.hypot(dx, dy);
    const unitX = distance > 0 ? dx / distance : 0;
    const unitY = distance > 0 ? dy / distance : 1;
    const approachStepsElapsed = enemy.approachStepsElapsed + 1;
    const verticalDistance = Math.abs(enemy.centerY - input.aircraftCenterY);
    const commits =
      verticalDistance <= 0.35 * input.viewportHeight ||
      approachStepsElapsed >= Math.round(2.0 / input.stepSeconds);
    if (commits) {
      // V02-WI-04 C01: the locked 26% VH/s committed speed applies on the
      // FIRST commitment step (the previous code moved this step at the 18%
      // approach speed and only switched speed on the following step).
      const nextX =
        enemy.centerX + unitX * input.committedSpeedPx * input.stepSeconds;
      const nextY =
        enemy.centerY + unitY * input.committedSpeedPx * input.stepSeconds;
      // Direction is locked at the first commit condition; later Aircraft
      // movement does not bend the attack run.
      return {
        ...enemy,
        hasEnteredVisibleArea: hasEntered(enemy),
        phase: 'committed',
        committedVx: unitX,
        committedVy: unitY,
        approachStepsElapsed,
        centerX: nextX,
        centerY: nextY,
      };
    }
    const nextX =
      enemy.centerX + unitX * input.movementSpeedPx * input.stepSeconds;
    const nextY =
      enemy.centerY + unitY * input.movementSpeedPx * input.stepSeconds;
    return {
      ...enemy,
      hasEnteredVisibleArea: hasEntered(enemy),
      approachStepsElapsed,
      centerX: nextX,
      centerY: nextY,
    };
  }
  // Committed Attack Run: fixed direction at the committed speed.
  return {
    ...enemy,
    hasEnteredVisibleArea: hasEntered(enemy),
    centerX:
      enemy.centerX +
      enemy.committedVx * input.committedSpeedPx * input.stepSeconds,
    centerY:
      enemy.centerY +
      enemy.committedVy * input.committedSpeedPx * input.stepSeconds,
  };
}

/** Applies the permanent full-bounds activation latch for the three regular
 *  roles (the Ranged first-shot timer starts on this exact step; Hunter
 *  Approach is entered by its owner). The Elite has its own explicit
 *  `activateElite` transition and is deliberately excluded from the parameter
 *  type, so it can never reach this regular-only owner. */
function activateEnemy(
  enemy: BasicEnemyState | RangedEnemyState | HunterEnemyState,
): CombatEnemy {
  if (enemy.kind === 'ranged') {
    return { ...enemy, activated: true, firingStepsRemaining: 180 };
  }
  return { ...enemy, activated: true };
}

// ---------------------------------------------------------------------------
// Elite (Epic §9.4, V02-WI-06 E01)
// ---------------------------------------------------------------------------

/**
 * Complete rendered bounds (px) of one Elite phase state at gameplay scale,
 * resolved from the single content geometry owner (Epic §16.1/§16.4,
 * `ELITE_DRONE`). The authoritative Elite AABB therefore always equals the
 * complete rendered bounds of the sprite for that state — no second Elite
 * hitbox rule exists. The creation owner and the accepted viewport-resize
 * reprojection both consume this one mapping.
 */
export function eliteBoundsForPhase(
  phase: 'armoured' | 'vulnerable',
  shortSidePx: number,
): { readonly width: number; readonly height: number } {
  const geometry =
    phase === 'armoured'
      ? ELITE_DRONE.armouredVisualGeometry
      : ELITE_DRONE.vulnerableVisualGeometry;
  const bounds = enemyRenderedBounds(geometry, shortSidePx);
  return { width: bounds.widthPx, height: bounds.heightPx };
}

export interface EliteCreationInput {
  readonly id: number;
  readonly ordinal: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}

/**
 * Shared Elite construction owner: every Elite starts `entering` with no phase
 * time, no phase/attack timer, no horizontal decision, and the complete
 * rendered bounds of its Armoured state. The Elite never passes through the
 * regular-enemy factory, the full-bounds activation rule, or escape.
 */
function createEliteState(input: {
  readonly id: number;
  readonly ordinal: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly hasEnteredVisibleArea: boolean;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}): EliteEnemyState {
  const bounds = eliteBoundsForPhase(
    'armoured',
    Math.min(input.viewportWidth, input.viewportHeight),
  );
  return {
    id: input.id,
    kind: 'elite',
    type: ELITE_DRONE.type,
    hullIntegrity: ELITE_DRONE.maximumHullIntegrity,
    centerX: input.centerX,
    centerY: input.centerY,
    width: bounds.width,
    height: bounds.height,
    entry: 'top',
    hasEnteredVisibleArea: input.hasEnteredVisibleArea,
    activated: false,
    ordinal: input.ordinal,
    phase: 'entering',
    phaseStepsElapsed: 0,
    phaseStepsRemaining: 0,
    horizontalDirection: null,
    movementDecisionStepsRemaining: 0,
    attackStepsRemaining: 0,
  };
}

/**
 * Creates the one authored Elite for canonical Top entry (Epic §9.4,
 * V02-DEC-033): it starts fully above the viewport with the nearest edge of its
 * complete Armoured bounds touching the Top boundary, centred on the authored
 * `50% VW` anchor X. `stepElite` then descends it at `12% VH/s` and activates
 * it on the exact anchor-reaching fixed step. The Elite consumes no phase or
 * attack time until that activation.
 */
export function createEliteForEntry(
  input: EliteCreationInput,
): EliteEnemyState {
  const shortSidePx = Math.min(input.viewportWidth, input.viewportHeight);
  return createEliteState({
    id: input.id,
    ordinal: input.ordinal,
    centerX: input.viewportWidth * ELITE_ANCHOR_VIEWPORT_FRACTION_X,
    centerY: -eliteBoundsForPhase('armoured', shortSidePx).height / 2,
    hasEnteredVisibleArea: false,
    viewportWidth: input.viewportWidth,
    viewportHeight: input.viewportHeight,
  });
}

/**
 * Creates the one authored Elite already at its fixed `50% VW, 20% VH` anchor
 * centre (Epic §9.4) while still `entering`. `stepElite` clamps and activates it
 * on its first executed fixed step. This is the explicit "already at the
 * anchor" construction consumed by focused collision/phase tests and by the
 * Debug phase path; canonical player-facing Top entry uses `createEliteForEntry`.
 */
export function createEliteAtAnchor(
  input: EliteCreationInput,
): EliteEnemyState {
  return createEliteState({
    id: input.id,
    ordinal: input.ordinal,
    centerX: input.viewportWidth * ELITE_ANCHOR_VIEWPORT_FRACTION_X,
    centerY: input.viewportHeight * ELITE_ANCHOR_VIEWPORT_FRACTION_Y,
    hasEnteredVisibleArea: true,
    viewportWidth: input.viewportWidth,
    viewportHeight: input.viewportHeight,
  });
}

/**
 * Explicit idempotent Elite activation transition (Epic §9.4, V02-AC-009,
 * V02-DEC-033). `stepElite` invokes it on the exact fixed step the Elite centre
 * first reaches the `50% VW, 20% VH` anchor; the Elite enters `Armoured` and
 * its phase timer and fresh `90`-step cannon timer start once in that same
 * authoritative simulation step. The caller may supply the movement decision
 * drawn in that same step (direction first, then interval); without one the
 * Elite owns no horizontal decision and therefore does not move horizontally.
 * Repeated calls are strict no-ops returning the same state, and an Elite that
 * has not reached the anchor keeps consuming no phase or attack time.
 */
export function activateElite(
  elite: EliteEnemyState,
  decision?: EliteMovementDecision,
): EliteEnemyState {
  if (elite.activated) {
    return elite;
  }
  return {
    ...elite,
    activated: true,
    phase: 'armoured',
    phaseStepsElapsed: 0,
    phaseStepsRemaining: ELITE_ARMOURED_PHASE_STEPS,
    attackStepsRemaining: ELITE_CANNON_INTERVAL_STEPS,
    horizontalDirection: decision?.direction ?? null,
    movementDecisionStepsRemaining: decision?.intervalSteps ?? 0,
  };
}

/**
 * True when the Elite's exposed Core accepts normal player-projectile damage
 * (Epic §9.4, V02-AC-009): only the `Vulnerable` phase. An `Armoured` hit is a
 * blocked hit — zero damage, exactly that projectile consumed, and the local
 * deflection feedback owned by `collision.ts`.
 */
export function eliteAcceptsProjectileDamage(elite: EliteEnemyState): boolean {
  return elite.phase === 'vulnerable';
}

/**
 * Canonical player-projectile eligibility for the Elite (Epic §9.4,
 * V02-DEC-033): an `entering` Elite is NOT a target at all. Player projectiles
 * pass through it without damage, without being consumed, and without any
 * feedback, so `resolveProjectileCollisions` continues its stable ascending-id
 * search and the same projectile may still resolve against the next eligible
 * overlapping enemy. After activation the Elite is a normal single-hit target:
 * `Armoured` blocks and consumes the projectile, `Vulnerable` takes damage.
 */
export function isEliteProjectileTargetEligible(
  elite: EliteEnemyState,
): boolean {
  return elite.phase !== 'entering';
}

/**
 * True once the Elite is contact-active (Epic §11.3, V02-DEC-033): Elite body
 * contact is inactive during entry and becomes active only after activation.
 */
export function isEliteContactActive(elite: EliteEnemyState): boolean {
  return elite.activated;
}

/**
 * Canonical Elite step owner (Epic §9.4, V02-DEC-033). Order within the step:
 * entry/horizontal movement, then the phase boundary. The active-phase attack
 * timer is applied by `combat-simulation.ts` after this movement/boundary step,
 * so a phase boundary always suppresses an old-phase shot due on the same step.
 *
 * - While `entering`, the Elite descends straight down at `12% VH/s` from its
 *   above-viewport creation position, consumes no phase or attack time, and
 *   never escapes. On the first fixed step whose movement would reach or pass
 *   the anchor, its centre clamps exactly to `50% VW, 20% VH` and it activates,
 *   drawing its initial movement decision in that same step.
 * - While active, it moves horizontally at `12% VW/s` in its drawn direction,
 *   draws a new direction and interval on each scheduled decision step, and
 *   keeps its complete current-phase bounds inside the viewport.
 * - The phase boundary advances `Armoured 720 → Vulnerable 360` without drift,
 *   reinitializes the entered phase's full attack timer, and clamps the new
 *   phase geometry inside the viewport while preserving the decision timer and
 *   the RNG state.
 */
function stepElite(
  elite: EliteEnemyState,
  input: EnemyStepInput,
): EnemyStepResult {
  if (!elite.activated) {
    return stepEnteringElite(elite, input);
  }
  const moved = stepActiveEliteMovement(elite, input);
  return { enemy: stepElitePhaseBoundary(moved, input), newlyActivated: false };
}

/**
 * Canonical "the Elite has reached its fixed anchor" activation owner (Epic
 * §9.4, V02-AC-009): the centre snaps exactly to `50% VW, 20% VH`, the visible
 * latch is set, and the explicit idempotent `activateElite` transition starts
 * the Armoured phase, its fresh `90`-step cannon timer, and (when the caller
 * supplies one) the movement decision drawn in that same fixed step.
 *
 * `stepEnteringElite` calls it on the exact anchor-reaching step. The
 * development Debug phase command (Epic §17) reuses the same owner so a
 * not-yet-active current Elite enters its canonical phase position through the
 * authoritative geometry/activation code instead of an invented placement or a
 * second phase machine.
 */
export function activateEliteAtAnchor(
  elite: EliteEnemyState,
  viewportWidth: number,
  viewportHeight: number,
  decision?: EliteMovementDecision | undefined,
): EliteEnemyState {
  if (elite.activated) {
    // The canonical activation is idempotent: an already active Elite is
    // returned unchanged, never re-snapped or re-timed.
    return elite;
  }
  return activateElite(
    {
      ...elite,
      centerX: viewportWidth * ELITE_ANCHOR_VIEWPORT_FRACTION_X,
      centerY: viewportHeight * ELITE_ANCHOR_VIEWPORT_FRACTION_Y,
      hasEnteredVisibleArea: true,
    },
    decision,
  );
}

/** Entry descent, exact anchor clamp, and same-step idempotent activation. */
function stepEnteringElite(
  elite: EliteEnemyState,
  input: EnemyStepInput,
): EnemyStepResult {
  const anchorY = input.viewportHeight * ELITE_ANCHOR_VIEWPORT_FRACTION_Y;
  const movedY =
    elite.centerY +
    ELITE_ENTRY_SPEED_VIEWPORT_HEIGHT_PER_SECOND *
      input.viewportHeight *
      input.stepSeconds;
  const hasEnteredVisibleArea =
    elite.hasEnteredVisibleArea ||
    isEnemyAnyPortionVisible(elite, input.viewportWidth, input.viewportHeight);
  if (movedY < anchorY) {
    return {
      enemy: { ...elite, centerY: movedY, hasEnteredVisibleArea },
      newlyActivated: false,
    };
  }
  // Activation initializes the phase, attack, and movement-decision states on
  // this same authoritative step; each retains its full value until the next
  // executed fixed step.
  const decision =
    input.eliteMovementStream === undefined
      ? undefined
      : drawEliteMovementDecision(input.eliteMovementStream);
  return {
    enemy: activateEliteAtAnchor(
      elite,
      input.viewportWidth,
      input.viewportHeight,
      decision,
    ),
    newlyActivated: true,
  };
}

/** Active horizontal movement with the scheduled `elite-movement` decisions. */
function stepActiveEliteMovement(
  elite: EliteEnemyState,
  input: EnemyStepInput,
): EliteEnemyState {
  let direction = elite.horizontalDirection;
  let movementDecisionStepsRemaining = elite.movementDecisionStepsRemaining;
  if (movementDecisionStepsRemaining > 1) {
    movementDecisionStepsRemaining -= 1;
  } else if (input.eliteMovementStream !== undefined) {
    // Scheduled decision step (and the defensive activation-without-draw case):
    // direction first, then the next interval.
    const decision = drawEliteMovementDecision(input.eliteMovementStream);
    direction = decision.direction;
    movementDecisionStepsRemaining = decision.intervalSteps;
  }
  const movedX =
    direction === null
      ? elite.centerX
      : elite.centerX +
        direction *
          ELITE_HORIZONTAL_SPEED_VIEWPORT_WIDTH_PER_SECOND *
          input.viewportWidth *
          input.stepSeconds;
  return clampEliteHorizontally(
    {
      ...elite,
      horizontalDirection: direction,
      movementDecisionStepsRemaining,
      centerX: movedX,
    },
    input.viewportWidth,
  );
}

/**
 * Phase boundary (Epic §9.4): `Armoured` exactly `720` and `Vulnerable` exactly
 * `360` executed fixed steps, then the cycle repeats; every boundary transition
 * happens on exactly one step and the new phase starts from its exact full
 * duration, so the cycle cannot drift. The newly entered phase initializes its
 * own fresh attack timer (`90` cannon / `150` Core), which is not decremented on
 * the transition step.
 */
function stepElitePhaseBoundary(
  elite: EliteEnemyState,
  input: EnemyStepInput,
): EliteEnemyState {
  if (elite.phaseStepsRemaining > 1) {
    return {
      ...elite,
      phaseStepsElapsed: elite.phaseStepsElapsed + 1,
      phaseStepsRemaining: elite.phaseStepsRemaining - 1,
    };
  }
  const nextPhase: 'armoured' | 'vulnerable' =
    elite.phase === 'armoured' ? 'vulnerable' : 'armoured';
  return enterElitePhase(
    elite,
    nextPhase,
    input.viewportWidth,
    input.viewportHeight,
  );
}

/**
 * The single authoritative Elite phase-transition owner (Epic §9.4,
 * V02-AC-009/§17). Entering an active phase reinitializes that phase's exact
 * full duration (`Armoured 720` / `Vulnerable 360`), its fresh attack timer
 * (`90` cannon / `150` Core), and its complete rendered bounds, and clamps the
 * new geometry inside the viewport while preserving the drawn horizontal
 * decision, its remaining interval, and the RNG state.
 *
 * `stepElitePhaseBoundary` calls it on every natural boundary, and the
 * development Debug `Elite: Armoured` / `Elite: Vulnerable` commands reuse the
 * identical transition — there is no second phase machine, no parallel timer,
 * and no invented presentation state. An Elite that has not been activated
 * cannot enter an active phase through this owner (its canonical activation is
 * `activateEliteAtAnchor`), and re-entering the phase it already owns is a
 * strict no-op returning the same state.
 */
export function enterElitePhase(
  elite: EliteEnemyState,
  phase: 'armoured' | 'vulnerable',
  viewportWidth: number,
  viewportHeight: number,
): EliteEnemyState {
  if (!elite.activated || elite.phase === phase) {
    return elite;
  }
  const bounds = eliteBoundsForPhase(
    phase,
    Math.min(viewportWidth, viewportHeight),
  );
  return clampEliteHorizontally(
    {
      ...elite,
      phase,
      phaseStepsElapsed: 0,
      phaseStepsRemaining:
        phase === 'armoured'
          ? ELITE_ARMOURED_PHASE_STEPS
          : ELITE_VULNERABLE_PHASE_STEPS,
      attackStepsRemaining:
        phase === 'armoured'
          ? ELITE_CANNON_INTERVAL_STEPS
          : ELITE_CORE_INTERVAL_STEPS,
      width: bounds.width,
      height: bounds.height,
    },
    viewportWidth,
  );
}

/**
 * Keeps the complete current-phase Elite bounds inside the viewport (Epic
 * §9.4): the centre clamps to `[halfWidth, VW − halfWidth]`, and an Elite that
 * already owns a drawn horizontal decision is forced inward at that boundary
 * without consuming a draw and without resetting its scheduled decision timer.
 * The RNG state, phase, and all timers are untouched.
 */
function clampEliteHorizontally(
  elite: EliteEnemyState,
  viewportWidth: number,
): EliteEnemyState {
  const halfWidth = elite.width / 2;
  const minX = halfWidth;
  const maxX = viewportWidth - halfWidth;
  if (maxX < minX) {
    // Unreachable at supported viewports (the Elite bounds are far narrower
    // than the viewport): keep the centre without inventing a direction.
    return { ...elite, centerX: viewportWidth / 2 };
  }
  if (elite.horizontalDirection === null) {
    return { ...elite, centerX: clamp(elite.centerX, minX, maxX) };
  }
  if (elite.centerX >= maxX) {
    return { ...elite, centerX: maxX, horizontalDirection: -1 };
  }
  if (elite.centerX <= minX) {
    return { ...elite, centerX: minX, horizontalDirection: 1 };
  }
  return elite;
}

/**
 * Accepted viewport-resize reprojection for one Elite (Epic §9.4,
 * V02-DEC-033): the complete rendered bounds of the CURRENT phase are resolved
 * from the single Elite content geometry owner, the centre reprojects
 * proportionally, and bounds left outside the new viewport clamp inside and
 * force the drawn direction inward. The movement decision timer, the RNG
 * stream, the phase timers, and every launched projectile are untouched.
 */
export function reprojectEliteForViewport(
  elite: EliteEnemyState,
  input: {
    readonly centerX: number;
    readonly centerY: number;
    readonly viewportWidth: number;
    readonly shortSidePx: number;
  },
): EliteEnemyState {
  const bounds = eliteBoundsForPhase(
    elite.phase === 'vulnerable' ? 'vulnerable' : 'armoured',
    input.shortSidePx,
  );
  return clampEliteHorizontally(
    {
      ...elite,
      width: bounds.width,
      height: bounds.height,
      centerX: input.centerX,
      centerY: input.centerY,
    },
    input.viewportWidth,
  );
}

/** True when any portion of the complete bounds is strictly inside the viewport. */
export function isEnemyAnyPortionVisible(
  enemy: CombatEnemy,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  return (
    enemy.centerX - enemy.width / 2 < viewportWidth &&
    enemy.centerX + enemy.width / 2 > 0 &&
    enemy.centerY - enemy.height / 2 < viewportHeight &&
    enemy.centerY + enemy.height / 2 > 0
  );
}

/** True when the complete bounds are fully inside the visible viewport
 *  (activation and Hunter Approach begin only at this point, V02-DEC-020). */
export function isEnemyFullyInsideViewport(
  enemy: CombatEnemy,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  const halfWidth = enemy.width / 2;
  const halfHeight = enemy.height / 2;
  return (
    enemy.centerX - halfWidth >= 0 &&
    enemy.centerX + halfWidth <= viewportWidth &&
    enemy.centerY - halfHeight >= 0 &&
    enemy.centerY + halfHeight <= viewportHeight
  );
}

/** True when the complete bounds are outside every viewport boundary. */
export function isEnemyFullyOutsideViewport(
  enemy: CombatEnemy,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  const halfWidth = enemy.width / 2;
  const halfHeight = enemy.height / 2;
  return (
    enemy.centerX + halfWidth <= 0 ||
    enemy.centerX - halfWidth >= viewportWidth ||
    enemy.centerY + halfHeight <= 0 ||
    enemy.centerY - halfHeight >= viewportHeight
  );
}

function clamp(value: number, min: number, max: number): number {
  if (min > max) {
    return (min + max) / 2;
  }
  return Math.min(max, Math.max(min, value));
}

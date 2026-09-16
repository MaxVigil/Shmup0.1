import type { EnemyType } from '@domain/index';
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
 * falling through to a regular role. Elite entry and horizontal movement are
 * NOT owned here — a later movement consumer invokes `activateElite` on the
 * exact anchor-reaching fixed step.
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
   * Stable zero-based mission-member ordinal in authored encounter order
   * (Epic §9.2, V02-AC-006): the deterministic `ranged-fire` stream ordinal.
   * Never removal-sensitive or derived from runtime state.
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
 * The Elite is routed to `stepElite` (V02-WI-06 E01): it is never activated by
 * full-bounds entry, its centre is not moved by this foundation, and it never
 * escapes (Epic §9.4).
 */
export function stepEnemy(
  enemy: CombatEnemy,
  input: EnemyStepInput,
): EnemyStepResult {
  if (enemy.kind === 'elite') {
    return { enemy: stepElite(enemy, input), newlyActivated: false };
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
 * Creates the one authored Elite at its fixed `50% VW, 20% VH` anchor centre
 * (Epic §9.4). The returned state is `entering`: until the explicit
 * `activateElite` transition it consumes no phase or attack time. This factory
 * is the only Elite creation owner — the Elite never passes through the
 * regular-enemy factory, the full-bounds activation rule, or escape — and it
 * owns no entry speed, entry movement, horizontal movement, or RNG. The entry
 * consumer creates the Elite above the viewport and invokes `activateElite` on
 * the exact anchor-reaching fixed step.
 */
export function createEliteAtAnchor(
  input: EliteCreationInput,
): EliteEnemyState {
  const shortSidePx = Math.min(input.viewportWidth, input.viewportHeight);
  const bounds = eliteBoundsForPhase('armoured', shortSidePx);
  return {
    id: input.id,
    kind: 'elite',
    type: ELITE_DRONE.type,
    hullIntegrity: ELITE_DRONE.maximumHullIntegrity,
    centerX: input.viewportWidth * ELITE_ANCHOR_VIEWPORT_FRACTION_X,
    centerY: input.viewportHeight * ELITE_ANCHOR_VIEWPORT_FRACTION_Y,
    width: bounds.width,
    height: bounds.height,
    entry: 'top',
    // The Elite is created already at its visible anchor in this factory and
    // never escapes; the later entry-movement owner creates it above the
    // viewport and owns that latch.
    hasEnteredVisibleArea: true,
    activated: false,
    ordinal: input.ordinal,
    phase: 'entering',
    phaseStepsElapsed: 0,
    phaseStepsRemaining: 0,
  };
}

/**
 * Explicit idempotent Elite activation transition (Epic §9.4, V02-AC-009). The
 * movement owner invokes it on the exact fixed step the Elite centre first
 * reaches the `50% VW, 20% VH` anchor; the Elite enters `Armoured` and its
 * phase timer starts once in that same authoritative simulation step. Repeated
 * calls are strict no-ops returning the same state, so the cycle can never be
 * restarted, and an Elite that has not reached the anchor keeps consuming no
 * phase or attack time.
 */
export function activateElite(elite: EliteEnemyState): EliteEnemyState {
  if (elite.activated) {
    return elite;
  }
  return {
    ...elite,
    activated: true,
    phase: 'armoured',
    phaseStepsElapsed: 0,
    phaseStepsRemaining: ELITE_ARMOURED_PHASE_STEPS,
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
 * V02-WI-06 E01 C01 temporary player-projectile eligibility guard. Canonical
 * §9.4 defines a blocked player hit only during `Armoured` and normal damage
 * only during `Vulnerable`; it defines no projectile interaction during entry,
 * and the Product Owner owns that rule before E02 makes the Elite reachable.
 * Until then an `entering` Elite is NOT an eligible player-projectile target at
 * all: it takes no damage, consumes no projectile, and emits no hit or
 * deflection feedback. `resolveProjectileCollisions` continues its stable
 * ascending-id search, so the same projectile may still resolve against the
 * next eligible overlapping enemy. This guard is explicitly temporary and is
 * not the final E02 player-facing entry rule.
 */
export function isEliteProjectileTargetEligible(
  elite: EliteEnemyState,
): boolean {
  return elite.phase !== 'entering';
}

/**
 * Advances the Elite phase timer by exactly one executed fixed step (Epic
 * §9.4, V02-AC-009): `Armoured` lasts exactly `720` fixed steps, `Vulnerable`
 * exactly `360`, then the cycle repeats. Every boundary transition happens on
 * exactly one step and the new phase starts from its exact full duration, so
 * the cycle cannot drift. An Elite that has not been explicitly activated
 * consumes no phase time. E01 owns no Elite movement: the centre never changes.
 */
function stepElite(
  elite: EliteEnemyState,
  input: EnemyStepInput,
): EliteEnemyState {
  if (!elite.activated) {
    return elite;
  }
  if (elite.phaseStepsRemaining > 1) {
    return {
      ...elite,
      phaseStepsElapsed: elite.phaseStepsElapsed + 1,
      phaseStepsRemaining: elite.phaseStepsRemaining - 1,
    };
  }
  const nextPhase: 'armoured' | 'vulnerable' =
    elite.phase === 'armoured' ? 'vulnerable' : 'armoured';
  const bounds = eliteBoundsForPhase(
    nextPhase,
    Math.min(input.viewportWidth, input.viewportHeight),
  );
  return {
    ...elite,
    phase: nextPhase,
    phaseStepsElapsed: 0,
    phaseStepsRemaining:
      nextPhase === 'armoured'
        ? ELITE_ARMOURED_PHASE_STEPS
        : ELITE_VULNERABLE_PHASE_STEPS,
    width: bounds.width,
    height: bounds.height,
  };
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

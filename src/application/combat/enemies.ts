import type { EnemyType } from '@domain/index';

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
 */

export type EnemyEntryRegion = 'top' | 'upper-left' | 'upper-right';

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

export type CombatEnemy = BasicEnemyState | RangedEnemyState | HunterEnemyState;

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
  return {
    ...common,
    kind: 'hunter',
    phase: 'entering',
    committedVx: 0,
    committedVy: 0,
    approachStepsElapsed: 0,
  };
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
 */
export function stepEnemy(
  enemy: CombatEnemy,
  input: EnemyStepInput,
): EnemyStepResult {
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

/** Applies the permanent full-bounds activation latch (the Ranged first-shot
 *  timer starts on this exact step; Hunter Approach is entered by its owner). */
function activateEnemy(enemy: CombatEnemy): CombatEnemy {
  if (enemy.kind === 'ranged') {
    return { ...enemy, activated: true, firingStepsRemaining: 180 };
  }
  return { ...enemy, activated: true };
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

/**
 * The typed input-command boundary for the deterministic Combat simulation
 * (Repository Architecture §5.2, S08). Phaser forwards raw browser events as
 * semantic commands; the simulation never sees raw keys or pointer plumbing.
 * Movement keys are semantic axes so Domain code is not bound to a physical
 * keyboard layout.
 */

/** The two mutually exclusive movement-control modes (Combat §5.1). */
export type CombatControlMode = 'mouse' | 'keyboard';

/** Semantic movement axes used by Keyboard Movement (Combat §5.3). */
export type CombatMovementKey = 'up' | 'down' | 'left' | 'right';

export type CombatInputCommand =
  | {
      readonly type: 'combat/pointer-move';
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly type: 'combat/keyboard';
      readonly key: CombatMovementKey;
      readonly pressed: boolean;
    }
  | { readonly type: 'combat/toggle-mode' }
  | { readonly type: 'combat/set-mode'; readonly mode: CombatControlMode }
  | {
      readonly type: 'combat/viewport-resize';
      readonly width: number;
      readonly height: number;
      readonly aircraftWidth: number;
      readonly aircraftHeight: number;
    };

/**
 * Pointer-move gating (Combat §5.4, AC-071): only pointer positions inside the
 * Combat viewport create or update the mouse target. The presentation forwards
 * only inside moves; the simulation applies the same check as defence in depth.
 */
export function isPointerInsideViewport(
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  return x >= 0 && y >= 0 && x <= width && y <= height;
}

import type { CombatMovementKey } from './input-command';
import { isPointerInsideViewport } from './input-command';

/**
 * Pure application routing table (Technical Foundation §7, S08-WI01). The
 * approved keyboard bindings (Combat §5.3) and the enablement / repeat /
 * focused-UI policy are encoded here as testable pure functions; Phaser only
 * adapts raw keyboard/pointer facts and forwards the routed semantic intent.
 * The `inputEnabled` flag is the S13 hook: Pause, Settings/Debug Overlays, and
 * browser-safety states will set it false without changing this table.
 */

export type CombatKeyBinding =
  'move-up' | 'move-down' | 'move-left' | 'move-right' | 'toggle-mode';

/** The complete approved keyboard binding table (Combat §5.3). No other
 *  binding may be routed; unapproved keys are always rejected. */
export const KEY_BINDING_TABLE: Readonly<Record<string, CombatKeyBinding>> = {
  KeyW: 'move-up',
  ArrowUp: 'move-up',
  KeyS: 'move-down',
  ArrowDown: 'move-down',
  KeyA: 'move-left',
  ArrowLeft: 'move-left',
  KeyD: 'move-right',
  ArrowRight: 'move-right',
  KeyF: 'toggle-mode',
};

/** Semantic axis reached by each approved movement binding. */
const BINDING_AXIS: Readonly<
  Record<Exclude<CombatKeyBinding, 'toggle-mode'>, CombatMovementKey>
> = {
  'move-up': 'up',
  'move-down': 'down',
  'move-left': 'left',
  'move-right': 'right',
};

/** Input-enablement context supplied by presentation (S13 will populate the
 *  Pause / Overlay / browser-safety states). */
export interface CombatInputContext {
  /** False while Combat input routing is blocked (S13: blocking Overlay,
   *  Pause, browser-safety states). */
  readonly inputEnabled: boolean;
  /** True when a native UI control owns focus; global routing must not
   *  interfere with its native keyboard behaviour (Tab, Enter, Space…). */
  readonly nativeInputFocused: boolean;
}

export type RoutedKeyIntent =
  | {
      readonly kind: 'movement';
      readonly key: CombatMovementKey;
      readonly pressed: boolean;
    }
  | { readonly kind: 'toggle-mode' }
  | { readonly kind: 'none' };

/** Routes one raw keyboard fact to a semantic Combat intent. Keydown and
 *  keyup both route movement; auto-repeat never re-routes; `F` routes only on
 *  a fresh keydown (single toggle per press); blocked or focused-native-UI
 *  contexts reject everything; unapproved bindings are always rejected. */
export function routeKeyInput(
  code: string,
  pressed: boolean,
  repeat: boolean,
  context: CombatInputContext,
): RoutedKeyIntent {
  if (!context.inputEnabled || context.nativeInputFocused) {
    return { kind: 'none' };
  }
  const binding = KEY_BINDING_TABLE[code];
  if (binding === undefined) {
    return { kind: 'none' };
  }
  if (repeat) {
    return { kind: 'none' };
  }
  if (binding === 'toggle-mode') {
    return pressed ? { kind: 'toggle-mode' } : { kind: 'none' };
  }
  return { kind: 'movement', key: BINDING_AXIS[binding], pressed };
}

/** Routes a raw pointer fact: only enabled, inside-viewport positions become
 *  Combat mouse-target commands (Combat §5.4, AC-071). */
export function shouldForwardPointerMove(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
  context: CombatInputContext,
): boolean {
  return (
    context.inputEnabled &&
    isPointerInsideViewport(x, y, viewportWidth, viewportHeight)
  );
}

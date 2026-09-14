/**
 * CombatHudBridge (Technical Foundation §6.1, Combat §4.3; v0.2 §15.2–15.3,
 * DS §8.26): the only approved per-frame imperative DOM boundary for Combat HUD
 * placement. It owns ONE viewport-anchored HUD layer containing
 *
 * - the Hull Integrity bar (Design System tokens, `0.5rem` height, track
 *   `surface-interactive`, fill `accent`, no visible numeric value), which is
 *   the ONLY element repositioned per frame so it keeps tracking the Aircraft,
 *   and
 * - the system column with the `Combat Countdown` and the one-shot
 *   `CRITICAL HULL` message, whose geometry is fixed by the stylesheet: the
 *   Countdown is horizontally centred at the exact `space-4` top offset and
 *   never wraps, and `CRITICAL HULL` sits directly below it with the exact
 *   `space-2` gap.
 *
 * All values are updated imperatively from the authoritative simulation snapshot
 * — never via React state or render.
 */
export interface CombatHudValues {
  readonly aircraftCenterX: number;
  readonly aircraftBottomY: number;
  readonly aircraftWidth: number;
  readonly hullRatio: number;
  /** True strictly below 25 Hull (v0.2 §15.3); the fill becomes `danger`. */
  readonly hullDanger: boolean;
  readonly viewportShortSide: number;
  /** `MM:SS` ceiling-formula display value (v0.2 §15.2). */
  readonly countdownText: string;
  /** True while the once-per-Mission-Instance CRITICAL HULL message is active. */
  readonly criticalHullVisible: boolean;
}

export interface CombatHudBridge {
  readonly element: HTMLElement;
  update(values: CombatHudValues): void;
  dispose(): void;
}

export function createCombatHudBridge(): CombatHudBridge {
  // V02-WI-05 E04 C01 repair: ONE viewport-anchored HUD layer whose Hull bar is a
  // child owning the per-frame geometry. The Countdown/CRITICAL HULL column can
  // therefore never inherit the aircraft-following offset or width, cannot be
  // clipped or wrapped by the `65%` bar width, and needs no per-frame update
  // (v0.2 §15.2–15.3, DS §8.26).
  const element = document.createElement('div');
  element.className = 'ds-combat-hud';

  const bar = document.createElement('div');
  bar.className = 'ds-combat-hud__bar';
  const track = document.createElement('div');
  track.className = 'ds-combat-hud__track';
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  const fill = document.createElement('div');
  fill.className = 'ds-combat-hud__fill';
  track.appendChild(fill);
  bar.appendChild(track);
  element.appendChild(bar);

  const system = document.createElement('div');
  system.className = 'ds-combat-hud__system';
  const countdown = document.createElement('div');
  countdown.className = 'ds-combat-countdown';
  countdown.setAttribute('aria-live', 'off');
  system.appendChild(countdown);
  const criticalHull = document.createElement('div');
  criticalHull.className = 'ds-combat-critical-hull';
  criticalHull.textContent = 'CRITICAL HULL';
  criticalHull.hidden = true;
  system.appendChild(criticalHull);
  element.appendChild(system);

  return {
    element,
    update(values) {
      const width = values.aircraftWidth * 0.65;
      const gap = values.viewportShortSide * 0.01;
      const clamped = Math.max(0, Math.min(1, values.hullRatio));
      // Only the Hull bar follows the Aircraft (Combat §4.3).
      bar.style.left = `${values.aircraftCenterX - width / 2}px`;
      bar.style.top = `${values.aircraftBottomY + gap}px`;
      bar.style.width = `${width}px`;
      fill.style.width = `${clamped * 100}%`;
      fill.style.backgroundColor = values.hullDanger
        ? 'var(--color-danger)'
        : 'var(--color-accent)';
      track.setAttribute('aria-valuenow', String(Math.round(clamped * 100)));
      // System column: text and visibility only — never geometry.
      countdown.textContent = values.countdownText;
      criticalHull.hidden = !values.criticalHullVisible;
    },
    dispose() {
      element.remove();
    },
  };
}

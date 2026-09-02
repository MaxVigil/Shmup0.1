/**
 * CombatHudBridge (Technical Foundation §6.1, Combat §4.3; v0.2 §15.2–15.3,
 * DS §8.26): the only approved per-frame imperative DOM boundary for Combat HUD
 * placement. It owns the Hull Integrity bar element (Design System tokens,
 * `0.5rem` height, track `surface-interactive`, fill `accent`, no visible
 * numeric value), the top-centred `Combat Countdown`, and the one-shot
 * `CRITICAL HULL` message. All values are updated imperatively from the
 * authoritative simulation snapshot — never via React state or render.
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
  const element = document.createElement('div');
  element.className = 'ds-combat-hud';
  const track = document.createElement('div');
  track.className = 'ds-combat-hud__track';
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  const fill = document.createElement('div');
  fill.className = 'ds-combat-hud__fill';
  track.appendChild(fill);
  element.appendChild(track);

  const countdown = document.createElement('div');
  countdown.className = 'ds-combat-countdown';
  countdown.setAttribute('aria-live', 'off');
  element.appendChild(countdown);

  const criticalHull = document.createElement('div');
  criticalHull.className = 'ds-combat-critical-hull';
  criticalHull.textContent = 'CRITICAL HULL';
  criticalHull.hidden = true;
  element.appendChild(criticalHull);

  return {
    element,
    update(values) {
      const width = values.aircraftWidth * 0.65;
      const gap = values.viewportShortSide * 0.01;
      const clamped = Math.max(0, Math.min(1, values.hullRatio));
      element.style.left = `${values.aircraftCenterX - width / 2}px`;
      element.style.top = `${values.aircraftBottomY + gap}px`;
      element.style.width = `${width}px`;
      fill.style.width = `${clamped * 100}%`;
      fill.style.backgroundColor = values.hullDanger
        ? 'var(--color-danger)'
        : 'var(--color-accent)';
      track.setAttribute('aria-valuenow', String(Math.round(clamped * 100)));
      countdown.textContent = values.countdownText;
      criticalHull.hidden = !values.criticalHullVisible;
    },
    dispose() {
      element.remove();
    },
  };
}

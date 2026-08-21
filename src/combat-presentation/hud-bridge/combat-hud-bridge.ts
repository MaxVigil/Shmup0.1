/**
 * CombatHudBridge (Technical Foundation §6.1, Combat §4.3): the only approved
 * per-frame imperative DOM boundary for Combat HUD placement. It owns the Hull
 * Integrity bar element (Design System tokens, `0.5rem` height, track
 * `surface-interactive` / fill `accent`, no visible numeric value) and updates
 * it from plain presentation values without any React state update or render.
 */
export interface CombatHudValues {
  readonly aircraftCenterX: number;
  readonly aircraftBottomY: number;
  readonly aircraftWidth: number;
  readonly hullRatio: number;
  readonly viewportShortSide: number;
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

  return {
    element,
    update(values) {
      const width = values.aircraftWidth * 0.8;
      const gap = values.viewportShortSide * 0.01;
      const clamped = Math.max(0, Math.min(1, values.hullRatio));
      element.style.left = `${values.aircraftCenterX - width / 2}px`;
      element.style.top = `${values.aircraftBottomY + gap}px`;
      element.style.width = `${width}px`;
      fill.style.width = `${clamped * 100}%`;
      track.setAttribute('aria-valuenow', String(Math.round(clamped * 100)));
    },
    dispose() {
      element.remove();
    },
  };
}

import type { CombatSession, CombatSessionInput } from '@application/combat';
import {
  createCombatSimulationRuntime,
  synchronizeSharedModeAfterToggle,
  type CombatInputCommand,
} from '@application/combat';
import { createCombatHudBridge } from './hud-bridge/combat-hud-bridge';
import { createCombatGame } from './phaser/combat-game';
import { CombatScene } from './phaser/combat-scene';
import { resolveCombatGeometry } from './presentation-config/combat-config';

/**
 * Lazy Combat presentation entry (Repository Architecture §9, S08): invoked
 * only through the application boundary's dynamic import. It owns the
 * deterministic simulation runtime (application state, fixed-step driver,
 * disposal contract), the Phaser Game/Scene, and the CombatHudBridge, wires
 * the approved shell from the immutable Mission Snapshot + prepared assets,
 * and forwards Phaser input as semantic commands. `F` toggles the active mode
 * and synchronises the single shared-session `Mouse Movement Enabled` value
 * exactly once per accepted toggle (AC-064).
 */
export function createCombatSession(input: CombatSessionInput): CombatSession {
  const container = input.container;
  const bridge = createCombatHudBridge();
  container.appendChild(bridge.element);

  const aircraftAsset = input.preparedAssets.find(
    (asset) => asset.id === 'german-fighter',
  );
  const geometry = resolveCombatGeometry({
    width: container.clientWidth || window.innerWidth,
    height: container.clientHeight || window.innerHeight,
  });
  const runtime = createCombatSimulationRuntime({
    initialMode: input.snapshot.mouseMovementEnabled ? 'mouse' : 'keyboard',
    viewportWidth: geometry.viewportWidth,
    viewportHeight: geometry.viewportHeight,
    aircraftWidth: geometry.aircraftHeightPx * geometry.aircraftAspectRatio,
    aircraftHeight: geometry.aircraftHeightPx,
    weapon: input.weapon,
    projectile: input.projectile,
    missionSeed: input.snapshot.combatMissionSeed,
    enemy: input.enemy,
    schedule: input.schedule,
  });

  const submitCommand = (command: CombatInputCommand): void => {
    const before = runtime.getState().mode;
    runtime.submit(command);
    const after = runtime.getState().mode;
    if (command.type === 'combat/toggle-mode') {
      // AC-064: exactly one shared-session value change per accepted F toggle.
      synchronizeSharedModeAfterToggle(before, after, input.dispatch);
    }
  };

  const game = createCombatGame(container, {
    geometry,
    bridge,
    aircraftUrl: aircraftAsset?.status === 'ready' ? aircraftAsset.url : null,
    initialHullRatio: input.snapshot.hullIntegrity / 100,
    submitCommand,
    advanceFrame: (frameDeltaSeconds) => runtime.advance(frameDeltaSeconds),
    getSimulationState: () => runtime.getState(),
  });

  // Viewport resize contract (Combat §12.3, AC-057, AC-082, MASTER-AC-014):
  // the gameplay area follows the full-viewport container. The observer is
  // registered exactly once by the session and disconnected on dispose, so a
  // resize after disposal is inert and leaves no handler behind. Repeated
  // events for the same effective viewport dimensions do not repeat the
  // geometry recalculation (Combat §12.3).
  let resizeObserver: ResizeObserver | null = null;
  let windowResizeListener: (() => void) | null = null;
  let lastWidth = 0;
  let lastHeight = 0;
  const applySize = (): void => {
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    if (width <= 0 || height <= 0) {
      return;
    }
    if (width === lastWidth && height === lastHeight) {
      return;
    }
    lastWidth = width;
    lastHeight = height;
    game.scale.resize(width, height);
  };
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(applySize);
    resizeObserver.observe(container);
  } else {
    windowResizeListener = applySize;
    window.addEventListener('resize', windowResizeListener);
  }

  return {
    dispose() {
      if (resizeObserver !== null) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      if (windowResizeListener !== null) {
        window.removeEventListener('resize', windowResizeListener);
        windowResizeListener = null;
      }
      runtime.dispose();
      game.destroy(true);
      bridge.dispose();
    },
  };
}

export { CombatScene };

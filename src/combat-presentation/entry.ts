import type { CombatSession, CombatSessionInput } from '@application/combat';
import {
  buildCombatObservability,
  createCombatSimulationRuntime,
  isDebugCommandEligible,
  synchronizeSharedModeAfterToggle,
  type CombatDebugCommand,
  type CombatInputCommand,
  type CombatObservability,
  type CombatSimulationState,
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
 *
 * S12: the first time the simulation emits its authoritative terminal trigger,
 * the entry relays the pre-built typed Mission Result to the application-owned
 * idempotent commitment path exactly once — it never calculates, mutates, or
 * rewards. S13: the entry derives the paused/running lifecycle from the one
 * authoritative store by subscription (so the runtime freezes in the same task
 * that committed the pause command), owns the browser-safety listeners
 * (blur/visibility/resize safety pause), exposes the read-only observability
 * snapshot, and relays Debug commands to the deterministic simulation.
 */
export function createCombatSession(input: CombatSessionInput): CombatSession {
  const container = input.container;
  let disposed = false;
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
    playerHullIntegrity: input.snapshot.hullIntegrity,
    playerMaximumHullIntegrity: input.playerMaximumHullIntegrity,
  });

  const submitCommand = (command: CombatInputCommand): void => {
    const before = runtime.getState().mode;
    runtime.submit(command);
    const after = runtime.getState().mode;
    if (command.type === 'combat/toggle-mode') {
      // AC-064: exactly one shared-session value change per accepted F toggle.
      synchronizeSharedModeAfterToggle(before, after, input.store.dispatch);
    }
  };

  // S12: relay the authoritative terminal trigger exactly once. Phaser/React
  // never calculate a result, mutate Credits/Hull, or touch persistence — the
  // WI-02 application command owns the persisted campaign transaction and then
  // updates the Session Store (Epic §13, V02-AC-020). S13: forced Debug results
  // reuse the same relay, so the runtime disposes once through normal mission
  // resolution.
  let terminalDispatched = false;
  const relayTerminalIfPresent = (state: CombatSimulationState): void => {
    if (terminalDispatched || state.terminalResult === null) {
      return;
    }
    terminalDispatched = true;
    input.commitTerminalResult(
      state.terminalResult,
      state.playerHullIntegrity,
      input.snapshot.missionAttemptId,
      input.snapshot.missionInstanceOrdinal,
    );
  };
  const advanceFrame = (frameDeltaSeconds: number): CombatSimulationState => {
    const state = runtime.advance(frameDeltaSeconds);
    relayTerminalIfPresent(state);
    return state;
  };

  // S13: the single authoritative lifecycle source is the Session Store. The
  // entry subscribes and freezes the runtime in the same task the lifecycle
  // command was committed, so no paused/blocking state can keep advancing even
  // for a frame.
  let paused = false;
  const applyLifecycle = (): void => {
    const session = input.store.getState();
    const nextPaused =
      session !== null &&
      session.activeMission !== 'none' &&
      !session.combatLifecycle.running;
    paused = nextPaused;
    runtime.setPaused(nextPaused);
  };
  const unsubscribeLifecycle = input.store.subscribe(applyLifecycle);
  applyLifecycle();

  // S13-WI01: blur/visibility safety is owned by the CombatScreen for the full
  // Active Combat boundary (including while the lazy owner is loading), so it
  // is not duplicated here. This entry keeps only the single ResizeObserver
  // resize owner (identity-bound) and the scene Escape-to-Pause relay.

  const game = createCombatGame(container, {
    geometry,
    bridge,
    aircraftUrl:
      aircraftAsset?.status === 'ready'
        ? (aircraftAsset.imageDataUri ?? aircraftAsset.url)
        : null,
    submitCommand,
    advanceFrame,
    getSimulationState: () => runtime.getState(),
    getPaused: () => paused,
    requestPause: () => {
      if (!disposed) {
        // S13-WI01: identity-bound — Escape can only pause the mission it came
        // from; a stale scene can never pause another Mission Instance.
        input.store.dispatch({
          type: 'combat-lifecycle/open-pause',
          missionInstanceOrdinal: input.snapshot.missionInstanceOrdinal,
        });
      }
    },
  });

  // Viewport resize contract (Combat §12.3, AC-057, AC-082, MASTER-AC-014,
  // S13): the existing single ResizeObserver/resize owner still performs the
  // S07–S10 proportional reprojection/clamp exactly once per accepted
  // effective-dimension change and additionally latches the browser-safety
  // pause; identical dimensions are strict no-ops. The initial size is the
  // entry geometry, so the first observation never counts as a change.
  let resizeObserver: ResizeObserver | null = null;
  let windowResizeListener: (() => void) | null = null;
  let lastWidth = geometry.viewportWidth;
  let lastHeight = geometry.viewportHeight;
  const applySize = (): void => {
    if (disposed) {
      return;
    }
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
    // S13-WI01: the resize safety event is identity-bound to the mission this
    // owner belongs to.
    input.store.dispatch({
      type: 'combat-lifecycle/browser-safety-event',
      missionInstanceOrdinal: input.snapshot.missionInstanceOrdinal,
    });
  };
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(applySize);
    resizeObserver.observe(container);
  } else {
    windowResizeListener = applySize;
    window.addEventListener('resize', windowResizeListener);
  }

  return {
    requestReturnToBase() {
      if (disposed) {
        return;
      }
      // S12 abortMission seam through the WI-02 persisted command: the
      // originating Mission Instance ordinal plus the current authoritative
      // Combat Hull; no reward, recovery, or Result Overlay, and Operations
      // opens directly. The command persists the marker clear first.
      input.abortMission(
        runtime.getState().playerHullIntegrity,
        input.snapshot.missionAttemptId,
        input.snapshot.missionInstanceOrdinal,
      );
    },
    setControlMode(mode) {
      if (disposed) {
        return;
      }
      runtime.submit({ type: 'combat/set-mode', mode });
    },
    submitDebugCommand(command: CombatDebugCommand) {
      if (disposed) {
        return;
      }
      // S13-WI01: Debug eligibility at the runtime command boundary. Accepted
      // only for the matching Active Mission while the authoritative lifecycle
      // Overlay is exactly Debug (the runtime is paused) and build-time
      // DEV_MODE is enabled; every other case is a strict no-op.
      const session = input.store.getState();
      if (session === null) {
        return;
      }
      const eligible = isDebugCommandEligible(
        {
          activeMissionOrdinal:
            session.activeMission === 'none'
              ? null
              : session.activeMission.missionInstanceOrdinal,
          overlay: session.combatLifecycle.overlay,
          debugMode: input.debugMode,
        },
        input.snapshot.missionInstanceOrdinal,
      );
      if (!eligible) {
        return;
      }
      runtime.submitDebug(command);
      // Forced Debug results enter the same S12 typed terminal-result relay;
      // repeated or racing commands after the first terminal are strict no-ops.
      relayTerminalIfPresent(runtime.getState());
    },
    getObservability(): CombatObservability {
      return buildCombatObservability(runtime.getState());
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      unsubscribeLifecycle();
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

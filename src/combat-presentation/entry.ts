import type { CombatSession, CombatSessionInput } from '@application/combat';
import type { MissionResult } from '@application/mission';
import {
  buildCombatObservability,
  createCombatSimulationRuntime,
  EVIDENCE_COUNTERS_ENABLED,
  EVIDENCE_MODE,
  EVIDENCE_SCENARIOS_ENABLED,
  isDebugCommandEligible,
  synchronizeSharedModeAfterToggle,
  type CombatDebugCommand,
  type CombatEvidenceRecord,
  type CombatEvidenceWindow,
  type CombatInputCommand,
  type CombatObservability,
  type CombatSimulationState,
  type TerminalCommitOutcome,
} from '@application/combat';
import { createCombatHudBridge } from './hud-bridge/combat-hud-bridge';
import { createCombatGame } from './phaser/combat-game';
import { CombatScene } from './phaser/combat-scene';
import { resolveCombatGeometry } from './presentation-config/combat-config';
import {
  createFrozenTerminalPayload,
  createTerminalRetryController,
  terminalCommitDisposition,
} from './terminal-commit';

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
    mission: input.mission,
    enemies: input.enemies,
    playerHullIntegrity: input.snapshot.hullIntegrity,
    playerMaximumHullIntegrity: input.playerMaximumHullIntegrity,
  });

  // V02-WI-04 C03 development observability: in development builds only, expose
  // the authoritative read-only observability snapshot to the browser evidence
  // harness (same read model as the Debug Overlay, refreshed on demand, never
  // mutating simulation state). Compile-time absent from production
  // (`import.meta.env.DEV` is a constant `false` in production builds).
  if (import.meta.env.DEV) {
    (
      window as Window & {
        __shmupDevObservability__?: () => CombatObservability;
      }
    ).__shmupDevObservability__ = () =>
      buildCombatObservability(runtime.getState());
  }
  // V02-WI-04 C03/C04 evidence builds: expose ONLY the approved read-only
  // performance record (counters gate) plus the evidence-only benchmark
  // scenarios and the workload-identity observer (scenarios gate). In the
  // ordinary production build both gates are `false`, so this branch (and the
  // `__shmupEvidence__` / `__legacyBenchmarkIdentity__` symbols) is eliminated
  // from the artifact. The uninstrumented timing build has scenarios ON and
  // counters OFF, so its surface has `runBenchmarkScenario` and the identity
  // observer but no `read()` (no timing instrumentation).
  if (EVIDENCE_SCENARIOS_ENABLED || EVIDENCE_COUNTERS_ENABLED) {
    window.__shmupEvidence__ = {
      ...(EVIDENCE_COUNTERS_ENABLED
        ? {
            read: (): CombatEvidenceRecord | null =>
              runtime.getState().evidence?.record() ?? null,
          }
        : {}),
      runBenchmarkScenario: (scenario: 'legacy-five-basic' | 'm01-e5') => {
        if (
          disposed ||
          (scenario !== 'legacy-five-basic' && scenario !== 'm01-e5')
        ) {
          return;
        }
        // Evidence-only authoritative spawn through the deterministic runtime;
        // the evidence builds have no Debug UI, so this is the only runner
        // surface for the benchmark scenarios.
        runtime.submitEvidenceBenchmark?.(scenario);
      },
    } as CombatEvidenceWindow;
  }
  // V02-WI-04 C04 workload-identity observer (scenarios gate): present in the
  // UNINSTRUMENTED timing builds as well as Pass A so both legacy proxy sides
  // can prove exactly five Basic + zero other enemies concurrently. Reads the
  // CURRENT active mix — never cumulative maxima or timing.
  if (EVIDENCE_SCENARIOS_ENABLED) {
    window.__legacyBenchmarkIdentity__ = {
      spawnFiveBasic: () =>
        runtime.submitEvidenceBenchmark?.('legacy-five-basic'),
      readActiveByType: () => {
        const state = runtime.getState();
        const counts: Record<
          'basic-drone' | 'ranged-drone' | 'hunter-drone' | 'elite-drone',
          number
        > = {
          'basic-drone': 0,
          'ranged-drone': 0,
          'hunter-drone': 0,
          'elite-drone': 0,
        };
        for (const enemy of state.enemies) {
          counts[enemy.type] += 1;
        }
        return counts;
      },
    };
  }

  const submitCommand = (command: CombatInputCommand): void => {
    const before = runtime.getState().mode;
    runtime.submit(command);
    const after = runtime.getState().mode;
    if (command.type === 'combat/toggle-mode') {
      // AC-064: exactly one shared-session value change per accepted F toggle.
      synchronizeSharedModeAfterToggle(before, after, input.store.dispatch);
    }
  };

  // S12 + V02-WI-04: relay the authoritative terminal trigger exactly once.
  // Phaser/React never calculate a result, mutate Credits/Hull, or touch
  // persistence — the WI-02 application command owns the persisted campaign
  // transaction and exposes the typed pre-committed MissionResult. A Success
  // result is committed atomically at the terminal step, but its session
  // dispatch is deferred until the immutable deterministic centre-and-up exit
  // sequence completes (Epic §13.3, V02-AC-023); the v0.1 Defeat seam
  // dispatches immediately. S13: forced Debug results reuse the same relay.
  // V02-WI-04 C02: the commit reports one typed TerminalCommitOutcome; only a
  // committed Success may authorize the deterministic exit, while failed /
  // rejected opens Save Error and inert opens Save Conflict.
  let terminalDispatched = false;
  let pendingSuccessResult: MissionResult | null = null;
  let successResultDispatched = false;
  const retryController = createTerminalRetryController();
  const frozenPayload = createFrozenTerminalPayload();
  const dispatchSaveState = (
    type: 'combat-terminal/save-error' | 'combat-terminal/save-conflict',
  ): void => {
    input.store.dispatch({
      type,
      missionInstanceOrdinal: input.snapshot.missionInstanceOrdinal,
    });
  };
  const handleCommitOutcome = (outcome: TerminalCommitOutcome): void => {
    const disposition = terminalCommitDisposition(outcome);
    if (disposition.kind === 'authorize-success') {
      pendingSuccessResult = disposition.result;
      // V02-WI-04 C01: the deterministic exit advances only after the
      // campaign transaction has committed Success (Epic §13.3 order:
      // freeze → commit → exit).
      runtime.authorizeSuccessExit();
    }
    // A committed outcome closes Save Error (recover is inert otherwise):
    // the Success exit runs (deferred dispatch) or the Defeat seam already
    // dispatched the result, which resets the lifecycle.
    if (
      disposition.kind === 'authorize-success' ||
      disposition.kind === 'recover'
    ) {
      input.store.dispatch({
        type: 'combat-terminal/recover',
        missionInstanceOrdinal: input.snapshot.missionInstanceOrdinal,
      });
      return;
    }
    if (disposition.kind === 'save-conflict') {
      dispatchSaveState('combat-terminal/save-conflict');
      return;
    }
    // save-error (failed | rejected).
    dispatchSaveState('combat-terminal/save-error');
  };
  const commitFrozenTerminal = (
    onComplete: (outcome: TerminalCommitOutcome) => void,
  ): void => {
    const state = runtime.getState();
    if (state.terminalResult === null) {
      return;
    }
    // The frozen payload reuses the exact terminal, attempt/instance identity,
    // and the economy relay frozen at the first relay (never re-read).
    input.commitTerminalResult(
      state.terminalResult,
      state.playerHullIntegrity,
      input.snapshot.missionAttemptId,
      input.snapshot.missionInstanceOrdinal,
      frozenPayload.currentEconomy() ?? {
        combatRewards: state.pendingCombatRewards,
        escapePenalties: state.pendingEscapePenalties,
        destroyedCounts: state.destroyedCountByType,
        escapedCounts: state.escapedCountByType,
      },
      onComplete,
    );
  };
  const relayTerminalIfPresent = (state: CombatSimulationState): void => {
    if (terminalDispatched || state.terminalResult === null) {
      return;
    }
    terminalDispatched = true;
    frozenPayload.freezeEconomy({
      combatRewards: state.pendingCombatRewards,
      escapePenalties: state.pendingEscapePenalties,
      destroyedCounts: state.destroyedCountByType,
      escapedCounts: state.escapedCountByType,
    });
    commitFrozenTerminal(handleCommitOutcome);
  };
  const dispatchSuccessWhenExitComplete = (
    state: CombatSimulationState,
  ): void => {
    if (
      successResultDispatched ||
      pendingSuccessResult === null ||
      state.successExitPhase !== 'complete'
    ) {
      return;
    }
    successResultDispatched = true;
    // The persist-then-session ordering is preserved: the command resolved
    // only after the atomic campaign transaction succeeded. The session
    // reducer validates the originating Mission Instance ordinal.
    input.store.dispatch({
      type: 'mission/result',
      result: pendingSuccessResult,
    });
    pendingSuccessResult = null;
  };
  const advanceFrame = (frameDeltaSeconds: number): CombatSimulationState => {
    const state = runtime.advance(frameDeltaSeconds);
    relayTerminalIfPresent(state);
    dispatchSuccessWhenExitComplete(state);
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
    preparedAssets: input.preparedAssets,
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
      const after = runtime.getState();
      relayTerminalIfPresent(after);
      // V02-WI-04 C01: forced Success runs the same committed 0.5 s centre
      // phase and 60% VH/s upward exit as natural Success. The Debug Overlay
      // holds the runtime paused, so it is closed through the authoritative
      // lifecycle (unpausing when Debug opened from running Combat) before the
      // committed exit advances; the exit itself still waits for the campaign
      // transaction to commit through the `authorizeSuccessExit` seam.
      if (after.terminalResult?.kind === 'success') {
        input.store.dispatch({
          type: 'combat-lifecycle/close-debug',
          missionInstanceOrdinal: input.snapshot.missionInstanceOrdinal,
        });
      }
    },
    getObservability(): CombatObservability {
      return buildCombatObservability(runtime.getState());
    },
    retryTerminalSave() {
      if (disposed || !retryController.beginRetry()) {
        return;
      }
      const state = runtime.getState();
      if (state.terminalResult === null) {
        retryController.finishRetry();
        return;
      }
      // Single-flight: only one retry in flight at a time; the callback clears
      // the flag on every typed outcome (including a repeated failure or
      // rejection), so the user may retry again while Combat stays frozen.
      commitFrozenTerminal((outcome) => {
        retryController.finishRetry();
        handleCommitOutcome(outcome);
      });
    },
    reloadForSaveConflict() {
      // V02-WI-04 C02: Reload is the only Save Conflict continuation. It
      // performs browser navigation without any local reward, result, campaign
      // mutation, or exit animation, and never reuses the failed terminal as
      // authority.
      if (disposed) {
        return;
      }
      window.location.reload();
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      unsubscribeLifecycle();
      if (EVIDENCE_MODE) {
        delete window.__shmupEvidence__;
      }
      if (EVIDENCE_SCENARIOS_ENABLED) {
        delete window.__legacyBenchmarkIdentity__;
      }
      if (import.meta.env.DEV) {
        delete (
          window as Window & {
            __shmupDevObservability__?: () => CombatObservability;
          }
        ).__shmupDevObservability__;
      }
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

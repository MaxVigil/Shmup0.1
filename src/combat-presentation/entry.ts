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
  mayPresentHeldDefeat,
  planCommittedTerminal,
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
  // Transactional construction rollback (V02-DEC-031 C01): every resource this
  // owner acquires is tracked here so a failure at ANY point after acquisition
  // but before a complete CombatSession is returned synchronously releases
  // every already-acquired resource exactly once. Without this, a mid-
  // construction Phaser/game throw would strand an unreachable HUD bridge,
  // simulation runtime, development/evidence window surface, and Session Store
  // subscription inside the frozen Mission Start Recovery Error shell.
  let bridge!: ReturnType<typeof createCombatHudBridge>;
  let bridgeAcquired = false;
  let runtime!: ReturnType<typeof createCombatSimulationRuntime>;
  let runtimeAcquired = false;
  let game!: ReturnType<typeof createCombatGame>;
  let gameAcquired = false;
  let unsubscribeLifecycle!: () => void;
  let subscribed = false;
  let resizeObserver: ResizeObserver | null = null;
  let windowResizeListener: (() => void) | null = null;
  // Owner-identity tokens for the optional Combat window surfaces (C02): a
  // stale/failed owner may remove a surface ONLY while the current window
  // property is still the exact value this owner installed, so a newer valid
  // owner's replacement surface is never deleted by an older cleanup.
  let devObservabilitySurface: (() => CombatObservability) | null = null;
  let evidenceWindowSurface: CombatEvidenceWindow | null = null;
  let legacyIdentitySurface: unknown | null = null;
  const clearOwnedWindowSurfaces = (): void => {
    if (import.meta.env.DEV && devObservabilitySurface !== null) {
      try {
        const devWindow = window as Window & {
          __shmupDevObservability__?: () => CombatObservability;
        };
        if (devWindow.__shmupDevObservability__ === devObservabilitySurface) {
          delete devWindow.__shmupDevObservability__;
        }
      } catch {
        // cleanup must never mask the original failure
      }
      devObservabilitySurface = null;
    }
    if (EVIDENCE_MODE && evidenceWindowSurface !== null) {
      try {
        if (window.__shmupEvidence__ === evidenceWindowSurface) {
          delete window.__shmupEvidence__;
        }
      } catch {
        // cleanup must never mask the original failure
      }
      evidenceWindowSurface = null;
    }
    if (EVIDENCE_SCENARIOS_ENABLED && legacyIdentitySurface !== null) {
      try {
        if (window.__legacyBenchmarkIdentity__ === legacyIdentitySurface) {
          delete window.__legacyBenchmarkIdentity__;
        }
      } catch {
        // cleanup must never mask the original failure
      }
      legacyIdentitySurface = null;
    }
  };
  const rollback = (): void => {
    disposed = true;
    try {
      if (subscribed) {
        unsubscribeLifecycle();
      }
    } catch {
      // rollback must never mask the construction failure
    }
    subscribed = false;
    try {
      if (runtimeAcquired) {
        runtime.dispose();
      }
    } catch {
      // rollback must never mask the construction failure
    }
    runtimeAcquired = false;
    try {
      if (gameAcquired) {
        game.destroy(true);
      }
    } catch {
      // rollback must never mask the construction failure
    }
    gameAcquired = false;
    try {
      if (resizeObserver !== null) {
        resizeObserver.disconnect();
      }
    } catch {
      // rollback must never mask the construction failure
    }
    resizeObserver = null;
    try {
      if (windowResizeListener !== null) {
        window.removeEventListener('resize', windowResizeListener);
      }
    } catch {
      // rollback must never mask the construction failure
    }
    windowResizeListener = null;
    // Remove every development/evidence window surface THIS owner installed,
    // and only while the current property is still that exact owned value.
    clearOwnedWindowSurfaces();
    try {
      if (bridgeAcquired) {
        bridge.dispose();
      }
    } catch {
      // rollback must never mask the construction failure
    }
    bridgeAcquired = false;
    try {
      container.replaceChildren();
    } catch {
      // rollback must never mask the construction failure
    }
  };

  try {
    bridge = createCombatHudBridge();
    bridgeAcquired = true;
    container.appendChild(bridge.element);

    const aircraftAsset = input.preparedAssets.find(
      (asset) => asset.id === 'german-fighter',
    );
    const geometry = resolveCombatGeometry({
      width: container.clientWidth || window.innerWidth,
      height: container.clientHeight || window.innerHeight,
    });
    runtime = createCombatSimulationRuntime({
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
    runtimeAcquired = true;

    // V02-WI-04 C03 development observability: in development builds only, expose
    // the authoritative read-only observability snapshot to the browser evidence
    // harness (same read model as the Debug Overlay, refreshed on demand, never
    // mutating simulation state). Compile-time absent from production
    // (`import.meta.env.DEV` is a constant `false` in production builds).
    if (import.meta.env.DEV) {
      const devWindow = window as Window & {
        __shmupDevObservability__?: () => CombatObservability;
      };
      const devObservability = (): CombatObservability =>
        buildCombatObservability(runtime.getState());
      devWindow.__shmupDevObservability__ = devObservability;
      devObservabilitySurface = devObservability;
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
      const evidenceSurface: CombatEvidenceWindow = {
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
      window.__shmupEvidence__ = evidenceSurface;
      evidenceWindowSurface = evidenceSurface;
    }
    // V02-WI-04 C04 workload-identity observer (scenarios gate): present in the
    // UNINSTRUMENTED timing builds as well as Pass A so both legacy proxy sides
    // can prove exactly five Basic + zero other enemies concurrently. Reads the
    // CURRENT active mix — never cumulative maxima or timing.
    if (EVIDENCE_SCENARIOS_ENABLED) {
      const legacyIdentitySurfaceInstance = {
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
      window.__legacyBenchmarkIdentity__ = legacyIdentitySurfaceInstance;
      legacyIdentitySurface = legacyIdentitySurfaceInstance;
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

    // S12 + V02-WI-04/WI-05 C03: relay the authoritative terminal trigger exactly
    // once. Phaser/React never calculate a result, mutate Credits/Hull, or touch
    // persistence — the WI-02 application command owns the persisted campaign
    // transaction and returns the typed pre-committed MissionResult for every
    // outcome. A Success/Evacuation result is committed atomically at the
    // terminal step, but its session dispatch is deferred until the immutable
    // deterministic centre-and-up exit sequence completes (Epic §13.3/§13.4,
    // V02-AC-023). A committed Defeat/Game Over result is returned to THIS
    // boundary: it dispatches only when no browser-safety latch is set, and is
    // held behind the explicit Resume-only continuation when the write committed
    // while the tab was hidden or focus was lost (Epic §13.5, §13.7).
    // V02-WI-04 C02: the commit reports one typed TerminalCommitOutcome; only a
    // committed Success may authorize the deterministic exit, while failed /
    // rejected opens Save Error and inert opens Save Conflict. S13: forced Debug
    // results reuse the same relay.
    let terminalDispatched = false;
    let pendingExitResult: MissionResult | null = null;
    let heldDefeatResult: MissionResult | null = null;
    let exitResultDispatched = false;
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
      if (disposed) {
        return;
      }
      // The exact boundary decision (V02-WI-05 C04): the plan first rejects any
      // stale/disposed completion — the session must still own the originating
      // mission id, durable campaign attempt id, and instance ordinal — then
      // decides hold-vs-present on the browser-safety latch, or opens Save
      // Error/Save Conflict. No Result/Game Over is ever presented before this
      // boundary runs.
      const plan = planCommittedTerminal(
        outcome,
        input.store.getState(),
        input.snapshot,
      );
      if (plan.kind === 'authorize-exit') {
        pendingExitResult = plan.result;
        // V02-WI-04 C01 / V02-WI-05: the deterministic bounded exit advances
        // only after the campaign transaction has committed the Success or
        // Evacuation result (Epic §13.3–13.4 order: freeze → commit → exit).
        runtime.authorizeSuccessExit();
        // Close Save Error, or hold the committed exit behind the Resume-only
        // terminal-exit Pause when the manual-resume latch is set.
        input.store.dispatch({
          type: 'combat-terminal/recover',
          missionInstanceOrdinal: input.snapshot.missionInstanceOrdinal,
        });
        return;
      }
      if (plan.kind === 'present') {
        // No browser-safety latch: the committed Defeat/Game Over is presented
        // exactly once through the immutable session result.
        input.store.dispatch({
          type: 'mission/result',
          result: plan.result,
        });
        return;
      }
      if (plan.kind === 'hold') {
        // The committed Defeat/Game Over resolved under the manual-resume latch:
        // hold it frozen behind the Resume-only continuation — never rewritten,
        // re-computed, or retried. Explicit Resume presents it exactly once (no
        // exit animation).
        heldDefeatResult = plan.result;
        input.store.dispatch({
          type: 'combat-terminal/recover',
          missionInstanceOrdinal: input.snapshot.missionInstanceOrdinal,
        });
        return;
      }
      if (plan.kind === 'save-conflict') {
        dispatchSaveState('combat-terminal/save-conflict');
        return;
      }
      if (plan.kind === 'save-error') {
        dispatchSaveState('combat-terminal/save-error');
        return;
      }
      // stale: a completion from a disposed or older owner is inert and never
      // mutates or navigates the current session.
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
      // V02-WI-05 C04: mark the atomic terminal write as pending BEFORE it
      // starts, so a blur/hidden-tab safety event that arrives while the write
      // is in flight latches manual Resume even from an already-open ordinary
      // Pause. The committed Defeat/Game Over can therefore never present into a
      // hidden/blurred session (Epic §13.7).
      input.store.dispatch({
        type: 'combat-terminal/pending',
        missionInstanceOrdinal: input.snapshot.missionInstanceOrdinal,
      });
      frozenPayload.freezeEconomy({
        combatRewards: state.pendingCombatRewards,
        escapePenalties: state.pendingEscapePenalties,
        destroyedCounts: state.destroyedCountByType,
        escapedCounts: state.escapedCountByType,
      });
      commitFrozenTerminal(handleCommitOutcome);
    };
    const dispatchExitWhenComplete = (state: CombatSimulationState): void => {
      if (
        exitResultDispatched ||
        pendingExitResult === null ||
        state.successExitPhase !== 'complete'
      ) {
        return;
      }
      exitResultDispatched = true;
      // The persist-then-session ordering is preserved: the command resolved
      // only after the atomic campaign transaction succeeded. The session
      // reducer validates the originating Mission Instance ordinal.
      input.store.dispatch({
        type: 'mission/result',
        result: pendingExitResult,
      });
      pendingExitResult = null;
    };
    const dispatchHeldDefeatAfterResume = (): void => {
      if (heldDefeatResult === null) {
        return;
      }
      // Only an explicit Resume that left the terminal-exit Pause into a running
      // state with no Overlay may present the held result; restoring
      // focus/visibility never does (the lifecycle stays paused). The session
      // must still own the exact originating mission + durable attempt.
      if (!mayPresentHeldDefeat(input.store.getState(), input.snapshot)) {
        return;
      }
      // Exactly-once: cleared before dispatch, and the session reducer ignores
      // any duplicate once the mission resolves.
      const result = heldDefeatResult;
      heldDefeatResult = null;
      input.store.dispatch({ type: 'mission/result', result });
    };
    const advanceFrame = (frameDeltaSeconds: number): CombatSimulationState => {
      const state = runtime.advance(frameDeltaSeconds);
      relayTerminalIfPresent(state);
      dispatchExitWhenComplete(state);
      dispatchHeldDefeatAfterResume();
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
    unsubscribeLifecycle = input.store.subscribe(applyLifecycle);
    subscribed = true;
    applyLifecycle();

    // Narrow DEV-only construction-failure seam (C02): allows the development
    // browser integration spec to load the REAL Combat entry, acquire the HUD
    // bridge/runtime/window surfaces/subscription, and then fail owner
    // construction exactly like a mid-construction Phaser throw. The block is
    // compile-time eliminated from production builds (`import.meta.env.DEV` is
    // a constant `false`), so no mutable test switch survives in the artifact.
    if (
      import.meta.env.DEV &&
      (
        window as Window & {
          __shmupTestForceCombatConstructionFailure__?: boolean;
        }
      ).__shmupTestForceCombatConstructionFailure__ === true
    ) {
      throw new Error(
        'controlled Combat owner construction failure (DEV test seam)',
      );
    }

    // S13-WI01: blur/visibility safety is owned by the CombatScreen for the full
    // Active Combat boundary (including while the lazy owner is loading), so it
    // is not duplicated here. This entry keeps only the single ResizeObserver
    // resize owner (identity-bound) and the scene Escape-to-Pause relay.

    game = createCombatGame(container, {
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
    gameAcquired = true;

    // Viewport resize contract (Combat §12.3, AC-057, AC-082, MASTER-AC-014,
    // S13): the existing single ResizeObserver/resize owner still performs the
    // S07–S10 proportional reprojection/clamp exactly once per accepted
    // effective-dimension change and additionally latches the browser-safety
    // pause; identical dimensions are strict no-ops. The initial size is the
    // entry geometry, so the first observation never counts as a change.
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
        // V02-WI-05 C03: once the authoritative terminal trigger exists or its
        // persistence is pending/held/frozen, the temporary abort seam is
        // blocked — terminal commitment and recovery own the boundary and the
        // abort can never bypass a committed/held Defeat or Game Over.
        if (terminalDispatched || runtime.getState().terminalResult !== null) {
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
        // Owner-safe: remove only the optional window surfaces still owned by
        // THIS session (a newer owner's replacement is never deleted).
        clearOwnedWindowSurfaces();
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
  } catch (error) {
    // A failed construction must release every already-acquired resource
    // exactly once and then surface the original failure so the lazy boundary
    // rejects and the exact-attempt Mission Start Recovery Error shell opens
    // with no canvas/HUD/runtime/subscription/global residue.
    rollback();
    throw error;
  }
}

export { CombatScene };

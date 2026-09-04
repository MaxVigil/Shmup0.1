/// <reference types="vite/client" />
import { Suspense, lazy, useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import {
  loadCombatSession,
  resolveEquippedWeapon,
  resolveGermanFighter,
  resolveMission,
} from '@application/combat';
import type {
  CombatDebugCommand,
  CombatObservability,
  CombatSession,
  TerminalCommitOutcome,
} from '@application/combat';
import {
  abortMission as abortMissionCommand,
  commitMissionResult as commitMissionResultCommand,
  createMissionStartRecoveryController,
} from '@application/mission';
import type { MissionStartRecoveryController } from '@application/mission';
import { mapCommitMissionOutcome } from '@combat-presentation/terminal-commit';
import type {
  CombatTerminalResult,
  SuccessEconomyRelay,
} from '@application/mission';
import { useApplication } from '../application-context';
import { SettingsButton } from '../components';
import { useSessionState } from '../hooks';
import {
  MissionStartRecoveryErrorOverlay,
  PauseOverlay,
  SaveConflictOverlay,
  SaveErrorOverlay,
  SettingsOverlay,
  TerminalExitPauseOverlay,
} from '../overlays';
import { Button, Icon } from '../primitives';

/**
 * S13 Debug surface: the module-level build-time `DEV_MODE` gate is derived
 * directly from `import.meta.env.DEV` so Vite replaces it with a constant.
 * In production the guarded `lazy` dynamic import is dead code, the Debug
 * module and its user-facing labels are excluded from the production output,
 * and no Debug action surface is reachable (Combat §11.1, §12.1).
 */
const DEV_MODE: boolean = import.meta.env.DEV;
const DebugOverlayComponent = DEV_MODE
  ? lazy(() =>
      import('../overlays/debug-overlay').then((module) => ({
        default: module.DebugOverlay,
      })),
    )
  : null;

/**
 * Combat Screen host (S07, S13): the full-viewport black canvas container plus
 * the approved Combat lifecycle shell — the global utility cluster (Pause then
 * Settings at `space-4` from the upper-right), the single blocking Combat
 * Overlay driven by the application-owned lifecycle state (Pause, Settings, or
 * development Debug — never coexisting), and the Combat Settings reuse. The
 * lifecycle state comes from the one Session Store; this component renders it
 * and relays semantic commands (Pause/Settings/Debug open-close, browser
 * safety, control-mode). When an Active Mission Snapshot exists, the lazy
 * Combat boundary is entered through the application seam; unmounting disposes
 * the Phaser Game/Scene, HUD bridge, all Combat-owned listeners, and the
 * runtime. A Combat initialization failure clears the active mission and
 * signals the failure so Base reopens Mission Details (Base AC-014).
 */
export function CombatScreen(): ReactElement | null {
  const { store, preparedAssets, content, campaignStore } = useApplication();
  const session = useSessionState();
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<CombatSession | null>(null);
  const recoveryControllerRef = useRef<MissionStartRecoveryController | null>(
    null,
  );
  const lifecycle = session.combatLifecycle;

  // WI-02 application command ports (bound at the composition root through the
  // context): Combat/UI relay typed intents; the commands persist the campaign
  // transaction first and only then report the typed completion outcome.
  // UI never touches persistence directly (Epic §14.2, V02-AC-020). V02-WI-04
  // C02: the binding maps every command outcome (committed/inert/failed) and
  // catches rejected Promises into the typed `rejected` outcome, so no
  // terminal-persistence path can produce an unhandled rejection.
  const commitTerminalResult = (
    terminal: CombatTerminalResult,
    combatHullIntegrity: number,
    missionAttemptId: number,
    missionInstanceOrdinal: number,
    successEconomy?: SuccessEconomyRelay,
    onComplete: (outcome: TerminalCommitOutcome) => void = () => undefined,
  ): void => {
    void commitMissionResultCommand(
      { store, campaignStore, content },
      terminal,
      combatHullIntegrity,
      missionAttemptId,
      missionInstanceOrdinal,
      successEconomy,
    ).then(
      (outcome) => onComplete(mapCommitMissionOutcome(outcome)),
      (error) => {
        onComplete({ status: 'rejected', error });
      },
    );
  };
  const abortMission = (
    combatHullIntegrity: number,
    missionAttemptId: number,
    missionInstanceOrdinal: number,
  ): void => {
    void abortMissionCommand(
      { store, campaignStore },
      combatHullIntegrity,
      missionAttemptId,
      missionInstanceOrdinal,
    );
  };

  // S13-WI01: the active Mission Instance ordinal for every lifecycle command
  // this screen relays (keyboard, utility cluster, browser-safety listeners).
  const activeMissionOrdinal =
    session.activeMission === 'none'
      ? null
      : session.activeMission.missionInstanceOrdinal;

  useEffect(() => {
    const snapshot = session.activeMission;
    if (snapshot === 'none') {
      return;
    }
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    let disposed = false;
    let owner: CombatSession | null = null;
    const weapon = resolveEquippedWeapon(content, snapshot.equippedWeapon);
    const mission = resolveMission(content, snapshot.missionId);
    const aircraft = resolveGermanFighter(content);
    if (mission === undefined) {
      // Defensive: the validated registry guarantees the started mission.
      return;
    }
    // Defer the lazy load one microtask: React StrictMode in development
    // mounts, cleans up, and remounts the effect synchronously, so the first
    // effect must not create a Phaser Game that is destroyed before its boot
    // completes (that would leave an orphaned canvas and Phaser-internal
    // errors). Only the settled mount crosses the lazy boundary.
    void Promise.resolve().then(() => {
      if (disposed) {
        return;
      }
      return loadCombatSession(
        {
          snapshot,
          preparedAssets,
          container,
          weapon,
          projectile: content.projectile,
          mission,
          enemies: content.enemies,
          playerMaximumHullIntegrity: aircraft.maximumHullIntegrity,
          store,
          // S13-WI01: build-time Debug capability passed into the lazy boundary;
          // the runtime enforces Debug eligibility from this value.
          debugMode: DEV_MODE,
          // WI-02 persisted command ports bound to this Mission Instance.
          commitTerminalResult,
          abortMission,
        },
        // The dynamic import cannot be cancelled. Check ownership after it
        // resolves and immediately before synchronous owner creation so an
        // early Abort creates no late runtime, canvas, or listener.
        () => {
          if (disposed) {
            return false;
          }
          const currentMission = store.getState()?.activeMission;
          return (
            currentMission !== undefined &&
            currentMission !== 'none' &&
            currentMission.missionInstanceOrdinal ===
              snapshot.missionInstanceOrdinal
          );
        },
      )
        .then((loaded) => {
          if (loaded === null) {
            return;
          }
          if (disposed) {
            loaded.dispose();
            return;
          }
          owner = loaded;
          sessionRef.current = loaded;
          // S13-WI01: reconcile the simulation control mode immediately on
          // attachment from the CURRENT shared Settings value, so a change made
          // while the owner was loading cannot leave shared state and
          // simulation mode inconsistent.
          const current = store.getState();
          loaded.setControlMode(
            current?.mouseMovementEnabled === true ? 'mouse' : 'keyboard',
          );
        })
        .catch(() => {
          if (disposed) {
            return;
          }
          // V02-DEC-031 Mission Start Recovery Error (Epic §13.2,
          // V02-AC-020): the start persisted its missionInProgress marker
          // before Combat entry and the lazy Combat owner initialization
          // rejected. The application-owned recovery controller atomically
          // clears ONLY the originating snapshot's exact mission id plus
          // durable attempt id; on a safe clear/absent marker/missing record
          // it reconciles in-memory state (the same-session retry works and a
          // reload can never turn the failed start into a paid Defeat), on a
          // durable authority mismatch it opens the exact Save Conflict /
          // Reload-only state, and when cleanup cannot be proven safe it keeps
          // this frozen non-interactive Combat shell with the blocking Mission
          // Start Recovery Error Overlay whose single `Retry Cleanup` re-runs
          // the same originating cleanup. No partial Phaser/runtime/bridge DOM
          // survives in the shell.
          container.replaceChildren();
          const controller = createMissionStartRecoveryController(
            { store, campaignStore },
            {
              missionId: snapshot.missionId,
              missionAttemptId: snapshot.missionAttemptId,
              missionInstanceOrdinal: snapshot.missionInstanceOrdinal,
            },
          );
          recoveryControllerRef.current = controller;
          void controller.run();
        });
    });
    return () => {
      disposed = true;
      sessionRef.current = null;
      // V02-DEC-031: a disposed Mission Start Recovery controller can no
      // longer run Retry Cleanup; store identity guards keep any late Promise
      // completion from reopening an Overlay or clearing another attempt.
      recoveryControllerRef.current?.dispose();
      recoveryControllerRef.current = null;
      owner?.dispose();
      owner = null;
    };
  }, [session.activeMission, preparedAssets, store, content]);

  // S13 lifecycle keyboard shortcuts: `P` toggles Pause (open when running,
  // resume when the Pause Overlay is open); development `F1` opens/replaces/
  // closes Debug only after the Combat owner is ready (S13-WI01 — before that,
  // Debug would have unavailable observability and no-op actions). Auto-repeat
  // is rejected. Every dispatch is bound to the originating Mission Instance.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat || activeMissionOrdinal === null) {
        return;
      }
      if (event.code === 'KeyP') {
        event.preventDefault();
        if (session.combatLifecycle.overlay === 'pause') {
          store.dispatch({
            type: 'combat-lifecycle/resume',
            missionInstanceOrdinal: activeMissionOrdinal,
          });
        } else {
          store.dispatch({
            type: 'combat-lifecycle/open-pause',
            missionInstanceOrdinal: activeMissionOrdinal,
          });
        }
        return;
      }
      // S13-WI01: Debug can open only after the Combat owner is ready. The
      // ref is set synchronously on attachment, so there is no React-state lag
      // race between the lazy boundary resolving and F1 being routed.
      if (DEV_MODE && sessionRef.current !== null && event.code === 'F1') {
        event.preventDefault();
        if (session.combatLifecycle.overlay === 'debug') {
          store.dispatch({
            type: 'combat-lifecycle/close-debug',
            missionInstanceOrdinal: activeMissionOrdinal,
          });
        } else {
          store.dispatch({
            type: 'combat-lifecycle/open-debug',
            missionInstanceOrdinal: activeMissionOrdinal,
          });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [session.combatLifecycle.overlay, activeMissionOrdinal, store]);

  // S13-WI01: blur/visibility safety for the full Active Combat boundary —
  // registered from mount (including while the lazy owner is loading), removed
  // on cleanup, identity-bound to this Mission Instance. A focus-loss or
  // hidden-tab event during loading produces the same one safety Pause.
  useEffect(() => {
    if (activeMissionOrdinal === null) {
      return;
    }
    const handleBlur = (): void => {
      store.dispatch({
        type: 'combat-lifecycle/browser-safety-event',
        missionInstanceOrdinal: activeMissionOrdinal,
      });
    };
    const handleVisibilityChange = (): void => {
      if (document.hidden) {
        handleBlur();
      }
    };
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeMissionOrdinal, store]);

  // S13 shared Settings sync: the Combat Settings Overlay binds the single
  // `Mouse Movement Enabled` value; every accepted change immediately updates
  // the mutually exclusive simulation mode for use on Resume (AC-038).
  useEffect(() => {
    sessionRef.current?.setControlMode(
      session.mouseMovementEnabled ? 'mouse' : 'keyboard',
    );
  }, [session.mouseMovementEnabled]);

  if (session.activeMission === 'none') {
    return null;
  }

  const pauseIconReady = preparedAssets.some(
    (asset) => asset.id === 'icon-pause' && asset.status === 'ready',
  );
  const dispatchPause = (): void => {
    if (activeMissionOrdinal === null) {
      return;
    }
    store.dispatch({
      type: 'combat-lifecycle/open-pause',
      missionInstanceOrdinal: activeMissionOrdinal,
    });
  };
  const dispatchSettings = (): void => {
    if (activeMissionOrdinal === null) {
      return;
    }
    store.dispatch({
      type: 'combat-lifecycle/open-settings',
      missionInstanceOrdinal: activeMissionOrdinal,
    });
  };
  const dispatchResume = (): void => {
    if (activeMissionOrdinal === null) {
      return;
    }
    store.dispatch({
      type: 'combat-lifecycle/resume',
      missionInstanceOrdinal: activeMissionOrdinal,
    });
  };
  const dispatchCloseSettings = (): void => {
    if (activeMissionOrdinal === null) {
      return;
    }
    store.dispatch({
      type: 'combat-lifecycle/close-settings',
      missionInstanceOrdinal: activeMissionOrdinal,
    });
  };
  const dispatchCloseDebug = (): void => {
    if (activeMissionOrdinal === null) {
      return;
    }
    store.dispatch({
      type: 'combat-lifecycle/close-debug',
      missionInstanceOrdinal: activeMissionOrdinal,
    });
  };
  const getObservability = (): CombatObservability | null =>
    sessionRef.current?.getObservability() ?? null;
  const submitDebugAction = (command: CombatDebugCommand): void => {
    sessionRef.current?.submitDebugCommand(command);
  };
  // S13-WI01: Return to Base remains effective even if selected before the
  // Combat owner finishes loading. With the owner, its current authoritative
  // Hull is used through the S12 seam; without it, the immutable snapshot Hull
  // is the authoritative pre-runtime fallback. The late-resolving owner is
  // disposed by the effect cleanup and can never create a canvas, result,
  // listener, or state mutation after the Aborted resolution.
  const handleReturnToBase = (): void => {
    const owner = sessionRef.current;
    if (owner !== null) {
      owner.requestReturnToBase();
      return;
    }
    const snapshot = session.activeMission;
    if (snapshot !== 'none') {
      // WI-02: the persisted Aborted command through the composition-root
      // binding (fire-and-forget; the command is idempotent and inert for
      // stale/duplicate activations). The exact campaign attempt id binds the
      // durable marker clear (V02-WI-02 C03).
      abortMission(
        snapshot.hullIntegrity,
        snapshot.missionAttemptId,
        snapshot.missionInstanceOrdinal,
      );
    }
  };

  const handleRetryCleanup = (): void => {
    // V02-DEC-031: relay Retry Cleanup to the application-owned single-flight
    // recovery controller; React never gates or runs cleanup itself.
    recoveryControllerRef.current?.retry();
  };

  return (
    <div data-testid="combat-screen" className="ds-combat-screen">
      <div ref={containerRef} className="ds-combat-canvas" />
      <div className="ds-combat-utility" data-testid="combat-utility">
        {pauseIconReady ? (
          <Button
            variant="secondary"
            iconOnly
            aria-label="Pause"
            disabled={lifecycle.overlay !== 'none'}
            onClick={dispatchPause}
          >
            <Icon icon="pause" size="medium" hidden />
          </Button>
        ) : (
          <Button
            variant="secondary"
            disabled={lifecycle.overlay !== 'none'}
            onClick={dispatchPause}
          >
            Pause
          </Button>
        )}
        <SettingsButton
          onPress={dispatchSettings}
          disabled={lifecycle.overlay !== 'none'}
        />
      </div>
      <PauseOverlay
        open={lifecycle.overlay === 'pause'}
        onResume={dispatchResume}
        onReturnToBase={handleReturnToBase}
      />
      <SettingsOverlay
        open={lifecycle.overlay === 'settings'}
        onClose={dispatchCloseSettings}
      />
      {/* V02-WI-04 C02 terminal-persistence recovery overlays. Combat is
          already terminal and frozen; Retry Save re-runs the immutable payload
          and Reload is the only Save Conflict continuation. */}
      {lifecycle.overlay === 'save-error' ? (
        <SaveErrorOverlay
          onRetry={() => sessionRef.current?.retryTerminalSave()}
        />
      ) : null}
      {lifecycle.overlay === 'save-conflict' ? (
        <SaveConflictOverlay
          onReload={() => {
            const owner = sessionRef.current;
            if (owner !== null) {
              owner.reloadForSaveConflict();
              return;
            }
            // V02-DEC-031: a Save Conflict discovered by the Mission Start
            // Recovery controller has no Combat owner created; Reload is
            // browser navigation only.
            window.location.reload();
          }}
        />
      ) : null}
      {/* V02-DEC-031 Mission Start Recovery Error: Combat initialization failed
          after the marker persisted and exact cleanup could not be proven
          safe. This frozen non-interactive Combat shell (no Phaser/simulation
          owner, no canvas) exposes only the single-flight Retry Cleanup
          action; Esc/Scrim and all Combat utility/Debug/terminal actions are
          inert behind the blocking Overlay. */}
      {lifecycle.overlay === 'mission-start-recovery-error' ? (
        <MissionStartRecoveryErrorOverlay onRetryCleanup={handleRetryCleanup} />
      ) : null}
      {/* V02-WI-04 C03 / V02-WI-05 C03: a committed terminal outcome that
          resolved while the tab was hidden/blurred (initial pending write or
          Retry) closes Save Error — and any Pause/Settings/Debug held under
          the latch — into this Resume-only terminal-exit Pause. Explicit
          Resume starts a committed Success/Evacuation exit or presents a held
          Defeat/Game Over exactly once. */}
      {lifecycle.overlay === 'terminal-exit-pause' ? (
        <TerminalExitPauseOverlay onResume={dispatchResume} />
      ) : null}
      {DEV_MODE &&
      DebugOverlayComponent !== null &&
      lifecycle.overlay === 'debug' ? (
        <Suspense fallback={null}>
          <DebugOverlayComponent
            open
            onClose={dispatchCloseDebug}
            getObservability={getObservability}
            submitDebugAction={submitDebugAction}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

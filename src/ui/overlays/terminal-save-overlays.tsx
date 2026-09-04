import type { ReactElement } from 'react';
import { Button, Overlay, Text } from '../primitives';

/**
 * V02-WI-04 C02 terminal-persistence recovery overlays (DS §8.24, Epic §13.3).
 *
 * `SaveErrorOverlay`: the terminal campaign transaction failed or rejected.
 * Combat stays frozen (already terminal) and the only continuation is
 * `Retry Save`, which re-runs the SAME immutable terminal payload through the
 * idempotent application command. No gameplay, result, economy, or exit
 * activity resumes while it is open.
 *
 * `SaveConflictOverlay`: the terminal commit was inert — this browser instance
 * no longer owns the durable campaign transition. `Reload` is the only
 * continuation and performs browser navigation without any local reward,
 * result, campaign mutation, or exit animation.
 *
 * Both are blocking accessible Overlays (focus-trapped, Esc/Scrim cannot close
 * them) and are never Pause, Settings, Evacuation, Defeat, or result variants.
 */
export function SaveErrorOverlay({
  onRetry,
}: {
  readonly onRetry: () => void;
}): ReactElement | null {
  return (
    <Overlay
      open
      labelledBy="save-error-overlay-title"
      onClose={() => undefined}
      className="ds-save-error-overlay"
      header={
        <Text as="h2" id="save-error-overlay-title" style="heading">
          Save Error
        </Text>
      }
      actions={
        <Button variant="primary" fill onClick={onRetry}>
          Retry Save
        </Button>
      }
    >
      <Text as="p" style="body" tone="primary">
        Mission result could not be saved. Combat remains paused.
      </Text>
    </Overlay>
  );
}

export function SaveConflictOverlay({
  onReload,
}: {
  readonly onReload: () => void;
}): ReactElement | null {
  return (
    <Overlay
      open
      labelledBy="save-conflict-overlay-title"
      onClose={() => undefined}
      className="ds-save-conflict-overlay"
      header={
        <Text as="h2" id="save-conflict-overlay-title" style="heading">
          Save Conflict
        </Text>
      }
      actions={
        <Button variant="primary" fill onClick={onReload}>
          Reload
        </Button>
      }
    >
      <Text as="p" style="body" tone="primary">
        Campaign data changed in another session. Reload to continue.
      </Text>
    </Overlay>
  );
}

/**
 * V02-WI-04 C03 / V02-WI-05 C03 terminal-exit Pause (Epic §13.3, §13.7,
 * V02-AC-019/023): entered when a committed terminal outcome resolves while the
 * browser-safety manual-resume latch is set (the tab was hidden or focus lost
 * during the initial pending write or the terminal Retry). The immutable
 * result is already committed; the Success/Evacuation exit must NOT start
 * automatically while hidden, and a committed Defeat/Game Over must not
 * present/navigate automatically. This Pause is identity-bound to that
 * committed outcome: `Resume` is the ONLY action and the only continuation.
 * Return to Base, Settings, Debug, Retry, and result actions are never exposed
 * here, and the Overlay cannot be closed by Esc or the Scrim — an explicit
 * `Resume` click is required (for Defeat it presents the committed Result or
 * Game Over exactly once, without another write, reward/Repair recalculation,
 * or exit animation).
 */
export function TerminalExitPauseOverlay({
  onResume,
}: {
  readonly onResume: () => void;
}): ReactElement | null {
  return (
    <Overlay
      open
      labelledBy="terminal-exit-pause-overlay-title"
      onClose={() => undefined}
      className="ds-terminal-exit-pause-overlay"
      header={
        <Text as="h2" id="terminal-exit-pause-overlay-title" style="heading">
          Paused
        </Text>
      }
      actions={
        <Button variant="primary" fill onClick={onResume}>
          Resume
        </Button>
      }
    >
      <Text as="p" style="body" tone="primary">
        Mission result saved. Combat remains paused — select Resume to finish.
      </Text>
    </Overlay>
  );
}

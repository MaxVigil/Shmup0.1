import type { ReactElement } from 'react';
import { Button, Overlay, Text } from '../primitives';

/**
 * V02-DEC-031 Mission Start Recovery Error Overlay (Epic §13.2, DS §8.26):
 * appears ONLY when the mission-start persistence write succeeded but Combat
 * owner initialization failed AND the exact originating-marker cleanup could
 * not be safely committed (a thrown/rejected update or an unreadable campaign
 * record). The immutable attempt stays in a frozen non-interactive Combat
 * shell and this blocking Overlay is the only surface.
 *
 * `Retry Cleanup` is the ONLY action, is single-flight (relayed to the
 * application-owned recovery controller), and owns initial focus. Focus is
 * trapped, Esc and Scrim are inert, and Pause, Settings, Debug, Evacuation,
 * terminal, and Return-to-Base surfaces are absent or inert behind/alongside
 * it. Successful cleanup returns to that mission's Mission Details with
 * `Unable to start mission.`; a durable attempt-authority mismatch replaces
 * the Overlay with the canonical Save Conflict / Reload-only state.
 */
export function MissionStartRecoveryErrorOverlay({
  onRetryCleanup,
}: {
  readonly onRetryCleanup: () => void;
}): ReactElement | null {
  return (
    <Overlay
      open
      labelledBy="mission-start-recovery-error-overlay-title"
      onClose={() => undefined}
      className="ds-mission-start-recovery-error-overlay"
      header={
        <Text
          as="h2"
          id="mission-start-recovery-error-overlay-title"
          style="heading"
        >
          Mission Start Recovery Error
        </Text>
      }
      actions={
        <Button variant="primary" fill onClick={onRetryCleanup}>
          Retry Cleanup
        </Button>
      }
    >
      <Text as="p" style="body" tone="primary">
        Combat could not start, and the active mission could not be cleared
        safely.
      </Text>
      <Text as="p" style="body" tone="primary">
        Retry cleanup to return to Mission Details.
      </Text>
    </Overlay>
  );
}

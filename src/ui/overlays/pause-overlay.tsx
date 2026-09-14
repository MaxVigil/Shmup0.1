import type { ReactElement } from 'react';
import { Button, Overlay, Text } from '../primitives';

export interface PauseOverlayProps {
  readonly open: boolean;
  readonly onResume: () => void;
  /** V02-WI-05 E03: opens the shared blocking Evacuation Confirmation. */
  readonly onEvacuate: () => void;
  /**
   * V02-WI-05 E03: false once the irreversible commitment exists, so the Pause
   * Overlay can never re-offer Evacuation after confirmation (Epic §15.5).
   */
  readonly evacuationEligible: boolean;
}

/**
 * Canonical Pause Overlay (Combat §10, DS §8.22; v0.2 DS §8.26
 * `v0.2 Evacuation actions and confirmation`): width
 * `clamp(20rem, 30vw, 26rem)`, title `Paused`, initial focus `Resume` (primary,
 * left). `Esc`/`P` are equivalent to `Resume` (the Overlay primitive routes
 * `Esc` to `onClose`; the CombatScreen window handler routes `P`). The Scrim
 * is inert.
 *
 * V02-WI-05 E03 replaces the removed v0.1 `Return to Base` instant-Aborted
 * action with the final v0.2 destructive `Evacuate` action (Epic §15.5,
 * V02-DEC-030): `Resume` remains primary on the left and `Evacuate` is
 * destructive on the right. Both actions open the same blocking confirmation
 * and the lifecycle records that this origin was Pause. After confirmation the
 * action is absent, so Pause exposes only `Resume` again.
 */
export function PauseOverlay({
  open,
  onResume,
  onEvacuate,
  evacuationEligible,
}: PauseOverlayProps): ReactElement | null {
  return (
    <Overlay
      open={open}
      labelledBy="pause-overlay-title"
      // Scrim is inert; `Esc` is equivalent to `Resume`.
      onClose={onResume}
      className="ds-pause-overlay"
      header={
        <Text as="h2" id="pause-overlay-title" style="heading">
          Paused
        </Text>
      }
      actions={
        <>
          <Button variant="primary" onClick={onResume}>
            Resume
          </Button>
          {evacuationEligible ? (
            <Button variant="destructive" onClick={onEvacuate}>
              Evacuate
            </Button>
          ) : null}
        </>
      }
    />
  );
}

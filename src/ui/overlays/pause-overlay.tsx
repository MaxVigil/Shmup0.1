import type { ReactElement } from 'react';
import { Button, Overlay, Text } from '../primitives';

export interface PauseOverlayProps {
  readonly open: boolean;
  readonly onResume: () => void;
  readonly onReturnToBase: () => void;
}

/**
 * Canonical Pause Overlay (Combat §10, DS §8.22): width
 * `clamp(20rem, 30vw, 26rem)`, title `Paused`, initial focus `Resume` (primary,
 * left) and `Return to Base` (destructive, right). `Esc`/`P` are equivalent to
 * `Resume` (the Overlay primitive routes `Esc` to `onClose`; the CombatScreen
 * window handler routes `P`). The Scrim is inert and no confirmation Overlay
 * appears for `Return to Base`, which resolves the mission as Aborted through
 * the S12 application seam.
 */
export function PauseOverlay({
  open,
  onResume,
  onReturnToBase,
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
          <Button variant="destructive" onClick={onReturnToBase}>
            Return to Base
          </Button>
        </>
      }
    />
  );
}

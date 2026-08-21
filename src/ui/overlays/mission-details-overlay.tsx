import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { startMission } from '@application/mission';
import { useApplication } from '../application-context';
import { FieldRow } from '../components';
import { Button, Overlay, Text } from '../primitives';

export interface MissionDetailsOverlayProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Show the Combat-initialization failure message when returning to Base (Base AC-014). */
  readonly initialError?: boolean;
}

/**
 * Canonical Mission Details Overlay (Base §5, DS §8.17): asks whether to start
 * the available Interception mission now. Content and action order are fixed —
 * `Interception`, `Resolve the incoming enemy wave.`, `Reward: 1 Credit`,
 * `Start Mission` (primary, left), `Cancel` (secondary, right). `Esc` is
 * equivalent to `Cancel`; clicking outside does not close it. Initial focus is
 * `Start Mission` (the first focusable control, DS §10.4).
 *
 * Start Mission immediately disables to prevent duplicate request emission
 * (Base §5.5) and sends one accepted start command (`startMission`), which
 * records the immutable Mission Snapshot and transitions the application to
 * Combat. A rejected command keeps the Overlay open, re-enables the action,
 * and displays `Unable to start mission.` (Base AC-014 structure).
 */
export function MissionDetailsOverlay({
  open,
  onClose,
  initialError = false,
}: MissionDetailsOverlayProps): ReactElement | null {
  const { store } = useApplication();
  const [startRequested, setStartRequested] = useState(false);
  const [startError, setStartError] = useState(false);

  useEffect(() => {
    if (open) {
      setStartRequested(false);
      setStartError(initialError);
    }
  }, [open, initialError]);

  const handleStart = (): void => {
    if (startRequested) {
      return;
    }
    setStartRequested(true);
    const result = startMission(store);
    if (result.kind === 'rejected') {
      setStartRequested(false);
      setStartError(true);
    }
  };

  return (
    <Overlay
      open={open}
      labelledBy="mission-details-overlay-title"
      onClose={onClose}
      className="ds-mission-details-overlay"
      header={
        <Text as="h2" id="mission-details-overlay-title" style="heading">
          Interception
        </Text>
      }
      actions={
        <>
          <Button
            variant="primary"
            disabled={startRequested}
            onClick={handleStart}
          >
            Start Mission
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <Text style="body">Resolve the incoming enemy wave.</Text>
      <FieldRow label="Reward" value="1 Credit" />
      {startError ? (
        <Text style="body" tone="danger">
          Unable to start mission.
        </Text>
      ) : null}
    </Overlay>
  );
}

import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { requestMissionStart } from '@application/mission';
import { useApplication } from '../application-context';
import { FieldRow } from '../components';
import { Button, Overlay, Text } from '../primitives';

export interface MissionDetailsOverlayProps {
  readonly open: boolean;
  readonly onClose: () => void;
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
 * (Base §5.5) and sends one accepted start request to the application boundary
 * (`requestMissionStart`). A rejected request keeps the Overlay open, re-enables
 * the action, and displays `Unable to start mission.` (Base AC-014 structure).
 */
export function MissionDetailsOverlay({
  open,
  onClose,
}: MissionDetailsOverlayProps): ReactElement | null {
  const { store } = useApplication();
  const [startRequested, setStartRequested] = useState(false);
  const [startError, setStartError] = useState(false);

  useEffect(() => {
    if (open) {
      setStartRequested(false);
      setStartError(false);
    }
  }, [open]);

  const handleStart = (): void => {
    if (startRequested) {
      return;
    }
    setStartRequested(true);
    const result = requestMissionStart(store);
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

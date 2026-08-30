import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { MissionPointState } from '@application/mission';
import { startMission } from '@application/mission';
import type { MissionDefinition } from '@application/content';
import { useApplication } from '../application-context';
import { FieldRow } from '../components';
import { Button, Overlay, Text } from '../primitives';

export interface MissionDetailsOverlayProps {
  readonly open: boolean;
  /**
   * The selected validated mission definition (V02-WI-03). `undefined` when no
   * mission is selected or the selected id is not in the registry — the
   * Overlay then renders nothing (the Operations Screen only opens it for a
   * mission found in the registry).
   */
  readonly mission: MissionDefinition | undefined;
  /** Finite mission-point state of the selected mission (Epic §6). */
  readonly state: MissionPointState;
  readonly onClose: () => void;
  /** Show the Combat-initialization failure message when returning to Base (Base AC-014). */
  readonly initialError?: boolean;
}

/**
 * Canonical Mission Details Overlay (Base §5, DS §8.17; V02-WI-03 delta:
 * consumes the selected validated mission definition and finite progression
 * state). Content and action order follow the approved composition — mission
 * display name, description, `Reward` Field Row, `Start Mission` (primary,
 * left), `Cancel` (secondary, right). `Esc` is equivalent to `Cancel`;
 * clicking outside does not close it. Initial focus is `Start Mission` (the
 * first focusable control, DS §10.4).
 *
 * Launchability: an `available` or `completed` mission can launch (completed
 * missions stay replayable, Epic §6.2). A `locked` mission renders no Start
 * Mission action, and the application `startMission` boundary additionally
 * rejects any locked mission before the mission-start transaction (Epic §6.1).
 *
 * Start Mission immediately disables to prevent duplicate request emission
 * (Base §5.5) and sends one accepted start command (`startMission`) for the
 * selected mission id, which persists `missionInProgress` before Combat entry
 * (Epic §13.2, V02-AC-020), records the immutable Mission Snapshot, and
 * transitions the application to Combat. A rejected or persist-failed command
 * keeps the Overlay open, re-enables the action, and displays
 * `Unable to start mission.` (Base AC-014 structure).
 */
export function MissionDetailsOverlay({
  open,
  mission,
  state,
  onClose,
  initialError = false,
}: MissionDetailsOverlayProps): ReactElement | null {
  const { store, campaignStore, content } = useApplication();
  const [startRequested, setStartRequested] = useState(false);
  const [startError, setStartError] = useState(false);

  useEffect(() => {
    if (open) {
      setStartRequested(false);
      setStartError(initialError);
    }
  }, [open, initialError]);

  if (mission === undefined) {
    return null;
  }
  const launchable = state !== 'locked';

  const handleStart = async (): Promise<void> => {
    if (startRequested) {
      return;
    }
    setStartRequested(true);
    const result = await startMission(
      { store, campaignStore, content },
      mission.id,
    );
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
          {mission.displayName}
        </Text>
      }
      actions={
        <>
          {launchable ? (
            <Button
              variant="primary"
              disabled={startRequested}
              onClick={() => {
                void handleStart();
              }}
            >
              Start Mission
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <Text style="body">{mission.description}</Text>
      <FieldRow label="Reward" value={`${mission.completionReward} Credits`} />
      {startError ? (
        <Text style="body" tone="danger">
          Unable to start mission.
        </Text>
      ) : null}
    </Overlay>
  );
}

import type { ReactElement } from 'react';
import { useApplication } from '../application-context';
import { useSessionState } from '../hooks';
import { FieldRow } from '../components';
import { Button, Overlay, Text } from '../primitives';

/**
 * Mission Result Overlay (Base §9.5, S12; V02-WI-03 seam): the only
 * post-Success/Defeat continuation point. Shows only the approved title
 * (`Mission Complete` / `Mission Failed`), the Reward row (the earned seam
 * completion reward / `0 Credits`), and a fill-width primary `Continue` action.
 * Initial focus is `Continue`; `Esc`, Scrim interaction, Base Navigation,
 * Settings, `F`, movement, and firing do not close or bypass it. `Continue`
 * performs navigation/cleanup only — it clears the consumed result boundary
 * and never reapplies Hull or reward. No `Retry` action exists. The full v0.2
 * result presentation (Destroyed/Escaped counts, combat rewards, completion
 * reward, escape penalties, unlocked mission) is V02-WI-04/WI-05 scope.
 */
export function MissionResultOverlay(): ReactElement | null {
  const { store } = useApplication();
  const session = useSessionState();
  const result = session.missionResult;
  if (result === null) {
    return null;
  }
  const reward =
    result.kind === 'success'
      ? result.creditsEarned === 1
        ? '1 Credit'
        : `${result.creditsEarned} Credits`
      : '0 Credits';
  const title =
    result.kind === 'success' ? 'Mission Complete' : 'Mission Failed';

  const handleContinue = (): void => {
    const presented = session.missionResult;
    if (presented === null) {
      return;
    }
    // Continue is bound to the presented result's originating Mission Instance
    // so a stale command can never clear a newer mission's result.
    store.dispatch({
      type: 'mission/result-consumed',
      missionInstanceOrdinal: presented.missionInstanceOrdinal,
    });
  };

  return (
    <Overlay
      open
      labelledBy="mission-result-overlay-title"
      // Esc/Scrim must not close the only continuation point (S12).
      onClose={() => undefined}
      className="ds-mission-result-overlay"
      header={
        <Text as="h2" id="mission-result-overlay-title" style="heading">
          {title}
        </Text>
      }
      actions={
        <Button variant="primary" fill onClick={handleContinue}>
          Continue
        </Button>
      }
    >
      <FieldRow label="Reward" value={reward} />
    </Overlay>
  );
}

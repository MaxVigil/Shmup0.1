import type { ReactElement } from 'react';
import type { PresentedMissionResult } from '@application/session';
import { useApplication } from '../application-context';
import { useSessionState } from '../hooks';
import { FieldRow } from '../components';
import { Button, Divider, Overlay, Text } from '../primitives';

/**
 * Mission Result Overlay (Base §9.5, S12; v0.2 §15.4, DS §8.26): the only
 * post-Success/Defeat continuation point. Success shows the exact v0.2
 * composition — `MISSION COMPLETE`, Destroyed and Escaped counts, combat
 * rewards, completion reward, escape penalties, total Credits earned, and the
 * newly unlocked mission only when one was newly unlocked — then `Continue`.
 * The v0.1 Defeat seam keeps the accepted compatibility presentation until
 * V02-WI-05 replaces it; the seam is never presented as final v0.2 behaviour.
 * Initial focus is `Continue`; `Esc`, Scrim interaction, Base Navigation,
 * Settings, `F`, movement, and firing do not close or bypass it. `Continue`
 * performs navigation/cleanup only — it clears the consumed result boundary
 * and never reapplies Hull or reward.
 */
export function MissionResultOverlay(): ReactElement | null {
  const { store } = useApplication();
  const session = useSessionState();
  const result = session.missionResult;
  if (result === null) {
    return null;
  }
  const title =
    result.kind === 'success' ? 'MISSION COMPLETE' : 'Mission Failed';

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

  const rows = renderRows(result);

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
      {rows}
    </Overlay>
  );
}

/** Renders the v0.2 Success breakdown or the v0.1 Defeat seam field rows. */
function renderRows(result: PresentedMissionResult): ReactElement[] {
  if (result.kind === 'defeat') {
    return [<FieldRow key="reward" label="Reward" value="0 Credits" />];
  }
  const rows: ReactElement[] = [
    <FieldRow
      key="destroyed"
      label="Destroyed"
      value={formatRoleCounts(result.destroyedCounts)}
    />,
    <FieldRow
      key="escaped"
      label="Escaped"
      value={formatRoleCounts(result.escapedCounts)}
    />,
    <Divider key="divider-economy" />,
    <FieldRow
      key="combat-rewards"
      label="Combat rewards"
      value={`+${result.combatRewards} Credits`}
    />,
    <FieldRow
      key="completion"
      label="Completion reward"
      value={`+${result.completionReward} Credits`}
    />,
    <FieldRow
      key="penalties"
      label="Escape penalties"
      value={
        result.escapePenalties > 0
          ? `-${result.escapePenalties} Credits`
          : '0 Credits'
      }
    />,
    <FieldRow
      key="credits-earned"
      label="Credits earned"
      value={`${result.creditsEarned} Credits`}
    />,
  ];
  if (result.newlyUnlockedMissionId !== null) {
    rows.push(
      <Divider key="divider-unlock" />,
      <FieldRow
        key="unlock"
        label="Mission unlocked"
        value={missionDisplayName(result.newlyUnlockedMissionId)}
      />,
    );
  }
  return rows;
}

function formatRoleCounts(counts: Readonly<Record<string, number>>): string {
  const parts: string[] = [];
  if ((counts['basic-drone'] ?? 0) > 0) {
    parts.push(`Basic ${counts['basic-drone']}`);
  }
  if ((counts['ranged-drone'] ?? 0) > 0) {
    parts.push(`Ranged ${counts['ranged-drone']}`);
  }
  if ((counts['hunter-drone'] ?? 0) > 0) {
    parts.push(`Hunter ${counts['hunter-drone']}`);
  }
  return parts.length > 0 ? parts.join(' · ') : '0';
}

function missionDisplayName(missionId: string): string {
  const names: Readonly<Record<string, string>> = {
    'interception-01': 'Interception 01',
    'interception-02': 'Interception 02',
    'interception-03': 'Interception 03',
  };
  return names[missionId] ?? missionId;
}

import { useEffect, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import type { MissionId } from '@domain/index';
import { missionPointView, missionState } from '@application/mission';
import { useApplication } from '../application-context';
import { CreditsPanel, MissionPoint } from '../components';
import { useSessionState } from '../hooks';
import { MissionDetailsOverlay } from '../overlays';

/**
 * Operations Screen composition (Base §4, AC-007; Epic §6.1, V02-AC-001): the
 * strategic-map background (prepared runtime asset or solid dark fallback)
 * filling the complete viewport beneath Base Navigation, exactly three
 * `Interception` Mission Points (v0.2 §21 supersession) driven by the
 * application mission-progression read model — locked / available /
 * completed(-replay) — placed in the foreground content area, and the compact
 * Credits Panel in the upper-left safe area. No duplicate visible `Operations`
 * heading is rendered; the `main` region carries the accessible Screen name
 * and no hidden focus target exists.
 *
 * Selecting an available or completed Mission Point opens the blocking Mission
 * Details Overlay for that validated mission (AC-009, V02-WI-03). Locked
 * points are structurally disabled and cannot reach a mission-start
 * transaction. After a Combat initialization failure the failed mission's
 * Overlay reopens with `Unable to start mission.` (Base AC-014).
 */
export function OperationsScreen(): ReactElement {
  const { store, preparedAssets, content } = useApplication();
  const session = useSessionState();
  const [selectedMissionId, setSelectedMissionId] = useState<MissionId | null>(
    null,
  );
  const [missionStartError, setMissionStartError] = useState(false);

  const progression = {
    unlockedMissionIds: session.unlockedMissionIds,
    completedMissionIds: session.completedMissionIds,
  };
  const views = content.missions.map((mission, position) => ({
    view: missionPointView(mission, progression),
    position,
  }));
  const selectedMission =
    selectedMissionId === null
      ? undefined
      : content.missions.find((mission) => mission.id === selectedMissionId);
  const selectedState =
    selectedMission === undefined
      ? undefined
      : missionState(selectedMission, progression);

  useEffect(() => {
    if (
      session.missionStartFailed &&
      session.missionStartFailedMissionId !== null
    ) {
      setSelectedMissionId(session.missionStartFailedMissionId);
      setMissionStartError(true);
      store.dispatch({ type: 'mission/start-failure-consumed' });
    }
  }, [session.missionStartFailed, session.missionStartFailedMissionId, store]);

  const handleOpenMissionDetails = (missionId: MissionId): void => {
    // S12-WI01: while a Mission Result is pending the Mission Points are
    // inert — real activation is scrim-blocked and programmatic activation
    // cannot open the Mission Details / Start Mission flow beneath the only
    // continuation point.
    if (session.missionResult !== null) {
      return;
    }
    setMissionStartError(false);
    setSelectedMissionId(missionId);
  };

  const background = preparedAssets.find(
    (asset) => asset.id === 'operations-background',
  );
  const backgroundStyle: CSSProperties | undefined =
    background?.status === 'ready'
      ? // V02-WI-02 C02 (MASTER-AC-014): the prepared background bytes are
        // reused as an inline data URI so re-entering this Screen never issues
        // a second request for the prepared asset.
        {
          backgroundImage: `url("${background.imageDataUri ?? background.url}")`,
        }
      : undefined;

  return (
    <main
      data-testid="operations-screen"
      className="ds-screen ds-operations-screen"
      aria-label="Operations"
    >
      <div
        className="ds-operations-background"
        style={backgroundStyle}
        aria-hidden="true"
      />
      <div className="ds-operations-screen__content">
        <CreditsPanel credits={session.credits} />
      </div>
      {views.map(({ view, position }) => (
        <MissionPoint
          key={view.missionId}
          label={view.displayName}
          state={view.state}
          position={position}
          onPress={() => handleOpenMissionDetails(view.missionId)}
        />
      ))}
      <MissionDetailsOverlay
        open={selectedMission !== undefined && selectedState !== undefined}
        mission={selectedMission}
        state={selectedState ?? 'locked'}
        onClose={() => setSelectedMissionId(null)}
        initialError={missionStartError}
      />
    </main>
  );
}

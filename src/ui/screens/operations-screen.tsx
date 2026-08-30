import { useEffect, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { useApplication } from '../application-context';
import { CreditsPanel, MissionPoint } from '../components';
import { useSessionState } from '../hooks';
import { MissionDetailsOverlay } from '../overlays';

/**
 * Operations Screen composition (Base §4, AC-007): the strategic-map
 * background (prepared runtime asset or solid dark fallback) filling the
 * complete viewport beneath Base Navigation, one static `Interception` Mission
 * Point at `50% × 50%` of the foreground content area, and the compact Credits
 * Panel in the upper-left safe area. No duplicate visible `Operations` heading
 * is rendered; the `main` region carries the accessible Screen name and no
 * hidden focus target exists. Selecting the Mission Point opens the blocking
 * Mission Details Overlay (AC-009). After a Combat initialization failure the
 * Overlay reopens with `Unable to start mission.` (Base AC-014).
 */
export function OperationsScreen(): ReactElement {
  const { store, preparedAssets } = useApplication();
  const session = useSessionState();
  const [missionDetailsOpen, setMissionDetailsOpen] = useState(false);
  const [missionStartError, setMissionStartError] = useState(false);

  useEffect(() => {
    if (session.missionStartFailed) {
      setMissionDetailsOpen(true);
      setMissionStartError(true);
      store.dispatch({ type: 'mission/start-failure-consumed' });
    }
  }, [session.missionStartFailed, store]);

  const handleOpenMissionDetails = (): void => {
    // S12-WI01: while a Mission Result is pending the Mission Point is inert —
    // real activation is scrim-blocked and programmatic activation cannot open
    // the Mission Details / Start Mission flow beneath the only continuation
    // point. Start Mission itself is additionally rejected at the application
    // boundary and by the reducer while a result is pending.
    if (session.missionResult !== null) {
      return;
    }
    setMissionStartError(false);
    setMissionDetailsOpen(true);
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
      <MissionPoint onPress={handleOpenMissionDetails} />
      <MissionDetailsOverlay
        open={missionDetailsOpen}
        onClose={() => setMissionDetailsOpen(false)}
        initialError={missionStartError}
      />
    </main>
  );
}

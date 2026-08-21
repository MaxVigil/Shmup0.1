import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { useApplication } from '../application-context';
import { CreditsPanel, MissionPoint } from '../components';
import { useScreenHeadingFocus, useSessionState } from '../hooks';
import { MissionDetailsOverlay } from '../overlays';
import { Text } from '../primitives';

/**
 * Operations Screen composition (Base §4, AC-007): the strategic-map
 * background (prepared runtime asset or solid dark fallback), one static
 * `Interception` Mission Point at `50% × 50%` of the content area, and the
 * compact Credits Panel in the upper-left. Selecting the Mission Point opens
 * the blocking Mission Details Overlay (AC-009). After a Combat initialization
 * failure the Overlay reopens with `Unable to start mission.` (Base AC-014).
 */
export function OperationsScreen(): ReactElement {
  const { store, preparedAssets } = useApplication();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useScreenHeadingFocus(headingRef);
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
    setMissionStartError(false);
    setMissionDetailsOpen(true);
  };

  const background = preparedAssets.find(
    (asset) => asset.id === 'operations-background',
  );
  const backgroundStyle: CSSProperties | undefined =
    background?.status === 'ready'
      ? { backgroundImage: `url("${background.url}")` }
      : undefined;

  return (
    <main
      data-testid="operations-screen"
      className="ds-screen ds-operations-screen"
    >
      <div
        className="ds-operations-background"
        style={backgroundStyle}
        aria-hidden="true"
      />
      <div className="ds-operations-screen__content">
        <Text as="h1" ref={headingRef} tabIndex={-1} style="heading">
          Operations
        </Text>
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

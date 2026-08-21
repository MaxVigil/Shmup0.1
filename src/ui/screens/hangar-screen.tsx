import { useRef, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { aircraftDisplayName } from '@application/hangar';
import { useApplication } from '../application-context';
import { AircraftConfigurationPanel } from '../components';
import { useScreenHeadingFocus, useSessionState } from '../hooks';
import { WeaponSelectionOverlay } from '../overlays';
import { Panel, Text } from '../primitives';

/**
 * Hangar Screen composition (Base §6): the Hangar background (prepared runtime
 * asset or solid dark fallback), the Aircraft Configuration Panel immediately
 * right of Base Navigation, and the German Fighter visual centred in the
 * remaining content area. `Change Weapon` opens the blocking Weapon Selection
 * Overlay; Repair runs inside the Configuration Panel.
 */
export function HangarScreen(): ReactElement {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useScreenHeadingFocus(headingRef);
  const { preparedAssets, content } = useApplication();
  const session = useSessionState();
  const [weaponSelectionOpen, setWeaponSelectionOpen] = useState(false);

  const background = preparedAssets.find(
    (asset) => asset.id === 'hangar-background',
  );
  const backgroundStyle: CSSProperties | undefined =
    background?.status === 'ready'
      ? { backgroundImage: `url("${background.url}")` }
      : undefined;
  const aircraftAsset = preparedAssets.find(
    (asset) => asset.id === 'german-fighter',
  );
  const aircraftName = aircraftDisplayName(content, session.aircraftId);

  return (
    <main data-testid="hangar-screen" className="ds-screen ds-hangar-screen">
      <div
        className="ds-hangar-background"
        style={backgroundStyle}
        aria-hidden="true"
      />
      <div className="ds-hangar-screen__content">
        <Text as="h1" ref={headingRef} tabIndex={-1} style="heading">
          Hangar
        </Text>
        <div className="ds-hangar-screen__layout">
          <AircraftConfigurationPanel
            onOpenWeaponSelection={() => setWeaponSelectionOpen(true)}
          />
          <div className="ds-hangar-screen__aircraft">
            {aircraftAsset?.status === 'ready' ? (
              <img
                className="ds-hangar-aircraft"
                src={aircraftAsset.url}
                alt={aircraftName}
              />
            ) : (
              <Panel variant="compact" className="ds-hangar-aircraft-fallback">
                <Text style="body">{aircraftName}</Text>
              </Panel>
            )}
          </div>
        </div>
      </div>
      <WeaponSelectionOverlay
        open={weaponSelectionOpen}
        onClose={() => setWeaponSelectionOpen(false)}
      />
    </main>
  );
}

import { useState } from 'react';
import type { ReactElement } from 'react';
import type { BaseScreenId } from '@application/session';
import { useSessionState } from '../hooks';
import { useApplication } from '../application-context';
import { BaseNavigation, NavigationItem, SettingsButton } from '../components';
import { SettingsOverlay } from '../overlays';
import { HangarScreen, OperationsScreen } from './index';

/**
 * Base application shell (Base §3.2, §3.6): the persistent left Base
 * Navigation, the current Base Screen in the remaining content area, the
 * global Settings Button in the upper-right corner, and the Settings Overlay.
 *
 * Navigation dispatches the shared session action (Base §9.3). Selecting the
 * active item is a no-op in the reducer (AC-003). While the blocking Settings
 * Overlay is open, Base Navigation is blocked (Base §3.5, AC-005): the scrim
 * intercepts pointer input and the Overlay traps keyboard focus; the shell
 * also ignores navigation commands for a deterministic command-level guard.
 */
export function BaseShell(): ReactElement {
  const { store } = useApplication();
  const session = useSessionState();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleNavigate = (target: BaseScreenId): void => {
    if (settingsOpen) {
      return;
    }
    store.dispatch({ type: 'session/navigate', target });
  };

  return (
    <div className="ds-base-shell" data-testid="base-shell">
      <BaseNavigation>
        <NavigationItem
          label="Operations"
          icon="map-trifold"
          active={session.currentScreen === 'operations'}
          onClick={() => handleNavigate('operations')}
        />
        <NavigationItem
          label="Hangar"
          icon="warehouse"
          active={session.currentScreen === 'hangar'}
          onClick={() => handleNavigate('hangar')}
        />
      </BaseNavigation>
      <div className="ds-base-shell__content">
        {session.currentScreen === 'operations' ? (
          <OperationsScreen />
        ) : (
          <HangarScreen />
        )}
      </div>
      <div className="ds-base-shell__settings">
        <SettingsButton onPress={() => setSettingsOpen(true)} />
      </div>
      <SettingsOverlay
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

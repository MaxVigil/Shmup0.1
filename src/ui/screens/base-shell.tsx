import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { BaseScreenId } from '@application/session';
import { useSessionState } from '../hooks';
import { useApplication } from '../application-context';
import { BaseNavigation, NavigationItem, SettingsButton } from '../components';
import { SettingsOverlay } from '../overlays';
import { HangarScreen, OperationsScreen } from './index';

/**
 * Base application shell (Base §3.2, §3.6): the persistent transparent left
 * Base Navigation, the current Base Screen's full-viewport background beneath
 * it, the global Settings Button in the upper-right corner, and the Settings
 * Overlay.
 *
 * Navigation dispatches the shared session action (Base §9.3). Selecting the
 * active item is a no-op in the reducer (AC-003). On Boot, Base navigation,
 * and result-flow destination changes, programmatic focus moves to the active
 * Navigation Item that visibly identifies the current Screen (AC-052,
 * DS-AC-015); there is no Screen heading focus target. While the blocking
 * Settings Overlay is open, Base Navigation is blocked (Base §3.5, AC-005):
 * the scrim intercepts pointer input and the Overlay traps keyboard focus; the
 * shell also ignores navigation commands for a deterministic command-level
 * guard.
 */
export function BaseShell(): ReactElement {
  const { store } = useApplication();
  const session = useSessionState();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const navigationRef = useRef<HTMLElement>(null);

  const handleNavigate = (target: BaseScreenId): void => {
    if (settingsOpen) {
      return;
    }
    store.dispatch({ type: 'session/navigate', target });
  };

  // Screen-transition focus (DS-AC-015, Base AC-052): when Boot or a
  // navigation opens Operations or Hangar, programmatic focus moves to the
  // active Navigation Item that visibly identifies the new Screen.
  useEffect(() => {
    const active = navigationRef.current?.querySelector<HTMLElement>(
      '[aria-current="page"]',
    );
    active?.focus();
  }, [session.currentScreen]);

  return (
    <div className="ds-base-shell" data-testid="base-shell">
      <BaseNavigation ref={navigationRef}>
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

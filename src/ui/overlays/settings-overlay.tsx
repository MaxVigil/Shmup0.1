import type { ReactElement } from 'react';
import { useSessionState } from '../hooks';
import { useApplication } from '../application-context';
import { Button, Checkbox, Overlay, Text } from '../primitives';

export interface SettingsOverlayProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

/**
 * Canonical global Settings Overlay (Base §3.6, DS §8.19): exactly the
 * `Mouse Movement Enabled` Checkbox and `Close`. The Checkbox binds the single
 * shared-session Settings value and updates it immediately — no `Save`,
 * `Apply`, or `Reset`. `Esc` is equivalent to `Close` (canonical Overlay), and
 * clicking the Scrim does not close it. Initial focus is the Checkbox (the
 * first focusable control), per DS §10.4.
 */
export function SettingsOverlay({
  open,
  onClose,
}: SettingsOverlayProps): ReactElement | null {
  const { store } = useApplication();
  const session = useSessionState();
  return (
    <Overlay
      open={open}
      labelledBy="settings-overlay-title"
      onClose={onClose}
      className="ds-settings-overlay"
      header={
        <Text as="h2" id="settings-overlay-title" style="heading">
          Settings
        </Text>
      }
      actions={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <Checkbox
        id="settings-mouse-movement-enabled"
        checked={session.mouseMovementEnabled}
        onCheckedChange={(enabled) =>
          store.dispatch({
            type: 'session/set-mouse-movement-enabled',
            enabled,
          })
        }
        label="Mouse Movement Enabled"
      />
    </Overlay>
  );
}

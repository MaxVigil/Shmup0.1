import type { ReactElement } from 'react';
import { setMouseMovementEnabled } from '@application/persistence';
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
 * `Apply`, or `Reset`. WI-02: every change is persisted separately from the
 * campaign through the application command (write-through), then reflected in
 * the session, so the setting survives reload and confirmed New Game
 * (Epic §14.1, V02-AC-017). `Esc` is equivalent to `Close` (canonical
 * Overlay), and clicking the Scrim does not close it. Initial focus is the
 * Checkbox (the first focusable control), per DS §10.4.
 */
export function SettingsOverlay({
  open,
  onClose,
}: SettingsOverlayProps): ReactElement | null {
  const { store, userSettingsStore } = useApplication();
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
        onCheckedChange={(enabled) => {
          // Persist first, then update the session. Repeated rapid toggles
          // serialize through the store; the last durable write wins.
          void setMouseMovementEnabled({ store, userSettingsStore }, enabled);
        }}
        label="Mouse Movement Enabled"
      />
    </Overlay>
  );
}

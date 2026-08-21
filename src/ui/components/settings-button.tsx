import type { ReactElement } from 'react';
import { useApplication } from '../application-context';
import { Button, Icon } from '../primitives';

export interface SettingsButtonProps {
  readonly onPress: () => void;
  readonly disabled?: boolean;
}

/**
 * Canonical Settings Button (DS §8.8): icon-only secondary Button using the
 * Phosphor gear icon with the accessible name `Settings`. When the gear icon
 * is not ready (S03-WI01), a visible text fallback keeps the accessible name
 * and canonical Button behaviour without requesting the icon again.
 */
export function SettingsButton({
  onPress,
  disabled = false,
}: SettingsButtonProps): ReactElement {
  const { preparedAssets } = useApplication();
  const iconReady = preparedAssets.some(
    (asset) => asset.id === 'icon-gear' && asset.status === 'ready',
  );
  if (!iconReady) {
    return (
      <Button variant="secondary" onClick={onPress} disabled={disabled}>
        Settings
      </Button>
    );
  }
  return (
    <Button
      variant="secondary"
      iconOnly
      aria-label="Settings"
      onClick={onPress}
      disabled={disabled}
    >
      <Icon icon="gear" size="medium" hidden />
    </Button>
  );
}

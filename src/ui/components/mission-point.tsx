import type { ReactElement } from 'react';
import { Button, Icon, Text } from '../primitives';

export interface MissionPointProps {
  readonly onPress: () => void;
}

/**
 * Canonical Mission Point (DS §8.10): one interactive action composed of a
 * `2.5rem × 2.5rem` Marker Button (Phosphor crosshair at large size) and the
 * `Interception` text label. Hover, pressed, and focus-visible are owned by
 * the canonical Button; the point is static and has no locked, completed, or
 * expired variant.
 */
export function MissionPoint({ onPress }: MissionPointProps): ReactElement {
  return (
    <div className="ds-mission-point">
      <Button
        variant="secondary"
        iconOnly
        aria-label="Interception"
        onClick={onPress}
      >
        <Icon icon="crosshair" size="large" hidden />
      </Button>
      <Text style="control">Interception</Text>
    </div>
  );
}

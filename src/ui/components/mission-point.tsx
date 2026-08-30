import type { ReactElement } from 'react';
import type { MissionPointState } from '@application/mission';
import { Button, Icon, Text } from '../primitives';

export interface MissionPointProps {
  readonly label: string;
  /** Finite v0.2 mission-point state (Epic §6.1, V02-AC-001; supersedes the
   *  MVP no-variant contract for locked/available/completed only). */
  readonly state: MissionPointState;
  readonly onPress: () => void;
  /** Authored Operations placement index (0–2) for the three visible mission
   *  points (v0.2 §21 supersession); drives the approved vertical layout. */
  readonly position?: number;
}

/** Visible state suffix; communicates the state in copy, never colour alone
 *  (Epic §6.1, Design System §10.8). */
const STATE_SUFFIX: Record<MissionPointState, string> = {
  available: '',
  completed: ' (Completed)',
  locked: ' (Locked)',
};

/**
 * Canonical Mission Point (DS §8.10) with the approved v0.2 three-state
 * contract (Epic §6.1, §21). One interactive action composed of a
 * `2.5rem × 2.5rem` Marker Button (Phosphor crosshair at large size) and the
 * mission text label with the state in copy.
 *
 * - `available` and `completed` are launchable (completed missions stay
 *   replayable, Epic §6.2); the Button is enabled.
 * - `locked` is structurally non-launchable: the Marker Button is disabled
 *   (not focusable, no activation) and the accessible name and visible label
 *   state `Locked` — no colour-only signal, and no mission-start transaction
 *   can be reached from a locked point.
 */
export function MissionPoint({
  label,
  state,
  onPress,
  position,
}: MissionPointProps): ReactElement {
  const visibleLabel = `${label}${STATE_SUFFIX[state]}`;
  const disabled = state === 'locked';
  return (
    <div
      className="ds-mission-point"
      data-state={state}
      data-position={position}
    >
      <Button
        variant="secondary"
        iconOnly
        disabled={disabled}
        aria-label={visibleLabel}
        onClick={onPress}
      >
        <Icon icon="crosshair" size="large" hidden />
      </Button>
      <Text style="control">{visibleLabel}</Text>
    </div>
  );
}

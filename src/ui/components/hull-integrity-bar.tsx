import type { ReactElement } from 'react';
import { ProgressBar } from '../primitives';

export interface HullIntegrityBarProps {
  readonly current: number;
  readonly max?: number;
  readonly labelledBy?: string;
  /** Combat omits the numeric value (DS §8.12). */
  readonly showValue?: boolean;
}

/**
 * Canonical Hull Integrity Bar (DS §8.12, DS-AC-016): the approved Progress Bar
 * plus an optional `current / max` text element. Display clamping never changes
 * authoritative gameplay state.
 */
export function HullIntegrityBar({
  current,
  max = 100,
  labelledBy,
  showValue = true,
}: HullIntegrityBarProps): ReactElement {
  return (
    <div className="ds-hull-bar">
      <ProgressBar
        value={current}
        max={max}
        {...(labelledBy === undefined ? {} : { labelledBy })}
      />
      {showValue ? (
        <span className="ds-hull-bar__value">
          {current} / {max}
        </span>
      ) : null}
    </div>
  );
}

import type { CSSProperties, ReactElement } from 'react';

export interface ProgressBarProps {
  /** Current value clamped to the visual range (DS §8.12). */
  readonly value: number;
  readonly max?: number;
  readonly labelledBy?: string;
}

/**
 * Canonical Progress Bar primitive (DS §8.12, DS-AC-016): exposes progress
 * semantics without altering authoritative gameplay state. The fill is clamped
 * only for display.
 */
export function ProgressBar({
  value,
  max = 100,
  labelledBy,
}: ProgressBarProps): ReactElement {
  const clamped = Math.min(Math.max(value, 0), max);
  const percentage = max === 0 ? 0 : (clamped / max) * 100;
  const fillStyle = { width: `${percentage}%` } as CSSProperties;
  return (
    <div
      className="ds-progress-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={clamped}
      aria-labelledby={labelledBy}
    >
      <div className="ds-progress-bar__fill" style={fillStyle} />
    </div>
  );
}

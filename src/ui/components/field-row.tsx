import type { ReactElement, ReactNode } from 'react';
import { Text } from '../primitives';

export interface FieldRowProps {
  readonly label: string;
  readonly value: ReactNode;
}

/**
 * Canonical Field Row (DS §8.11): left-aligned label and right-aligned value;
 * long values wrap instead of being truncated.
 */
export function FieldRow({ label, value }: FieldRowProps): ReactElement {
  return (
    <div className="ds-field-row">
      <Text style="caption" tone="secondary">
        {label}
      </Text>
      <Text style="body" tone="primary">
        {value}
      </Text>
    </div>
  );
}

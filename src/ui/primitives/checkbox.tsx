import type { ReactElement } from 'react';
import { Icon } from './icon';

export interface CheckboxProps {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly label: string;
  readonly disabled?: boolean;
  readonly id?: string;
}

/**
 * Canonical Checkbox primitive (DS §8.15, §9.3, DS-AC-013): a native checkbox
 * preserves boolean semantics and keyboard operation; the visual box uses the
 * approved Phosphor check icon.
 */
export function Checkbox({
  checked,
  onCheckedChange,
  label,
  disabled = false,
  id,
}: CheckboxProps): ReactElement {
  return (
    <label className="ds-checkbox" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        className="ds-checkbox__input"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
      <span
        className={
          checked
            ? 'ds-checkbox__box ds-checkbox__box--checked'
            : 'ds-checkbox__box'
        }
        aria-hidden="true"
      >
        {checked ? <Icon icon="check" size="small" /> : null}
      </span>
      <span className="ds-checkbox__label">{label}</span>
    </label>
  );
}

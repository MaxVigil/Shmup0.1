import type { ReactElement, RefObject } from 'react';
import type { WeaponOptionView } from '@application/hangar';
import { FieldRow } from './field-row';

export interface WeaponOptionProps {
  readonly option: WeaponOptionView;
  readonly selected: boolean;
  /** Native radio group name (shared by every option in the Overlay). */
  readonly name: string;
  readonly onSelect: () => void;
  readonly inputRef?: RefObject<HTMLInputElement | null>;
}

/**
 * Canonical Weapon Option (DS §8.14, §9.4): the whole option is one interactive
 * radio-selection action with a selection indicator, weapon name, and weapon
 * statistics as Field Rows. Selection changes only the pending choice — the
 * equipped weapon never changes until `Confirm`. Native radio semantics keep
 * Arrow Up/Down and Space keyboard behaviour (DS §10.6).
 */
export function WeaponOption({
  option,
  selected,
  name,
  onSelect,
  inputRef,
}: WeaponOptionProps): ReactElement {
  return (
    <label
      className={
        selected
          ? 'ds-weapon-option ds-weapon-option--selected'
          : 'ds-weapon-option'
      }
    >
      <input
        ref={inputRef}
        type="radio"
        name={name}
        checked={selected}
        onChange={onSelect}
        className="ds-weapon-option__input"
      />
      <span className="ds-weapon-option__heading">
        <span className="ds-weapon-option__indicator" aria-hidden="true" />
        <span className="ds-weapon-option__name">{option.displayName}</span>
      </span>
      <div className="ds-weapon-option__stats">
        <FieldRow label="Damage" value={option.damage} />
        <FieldRow label="Fire Rate" value={`${option.fireRate} shots/s`} />
        <FieldRow
          label="Destroys Basic Drone"
          value={`${option.basicDroneHits} ${option.basicDroneHits === 1 ? 'hit' : 'hits'}`}
        />
      </div>
    </label>
  );
}

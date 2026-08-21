import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { weaponOptions } from '@application/hangar';
import type { WeaponType } from '@domain/index';
import { useApplication } from '../application-context';
import { WeaponOption } from '../components';
import { useSessionState } from '../hooks';
import { Button, Overlay, Text } from '../primitives';

export interface WeaponSelectionOverlayProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

/**
 * Canonical Weapon Selection Overlay (Base §7, DS §8.18): the two approved
 * Primary Weapons as one native radio group, `Confirm` (primary, left) and
 * `Cancel` (secondary, right). Selection changes only the pending choice;
 * `Confirm` equips the pending weapon and closes, while `Cancel`/`Esc`
 * discards it. Initial focus is the equipped weapon option (DS §10.4).
 */
export function WeaponSelectionOverlay({
  open,
  onClose,
}: WeaponSelectionOverlayProps): ReactElement | null {
  const { store, content } = useApplication();
  const session = useSessionState();
  const options = weaponOptions(content);
  const equippedRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<WeaponType | null>(null);

  useEffect(() => {
    if (open) {
      setPending(session.equippedWeapon);
    }
  }, [open, session.equippedWeapon]);

  const current = pending ?? session.equippedWeapon;

  const handleConfirm = (): void => {
    store.dispatch({ type: 'session/equip-weapon', weapon: current });
    onClose();
  };

  return (
    <Overlay
      open={open}
      labelledBy="weapon-selection-overlay-title"
      onClose={onClose}
      className="ds-weapon-selection-overlay"
      initialFocusRef={equippedRef}
      header={
        <Text as="h2" id="weapon-selection-overlay-title" style="heading">
          Select Primary Weapon
        </Text>
      }
      actions={
        <>
          <Button variant="primary" onClick={handleConfirm}>
            Confirm
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <div
        className="ds-weapon-options"
        role="radiogroup"
        aria-label="Primary Weapon"
      >
        {options.map((option) => (
          <WeaponOption
            key={option.type}
            option={option}
            selected={option.type === current}
            name="primary-weapon"
            onSelect={() => setPending(option.type)}
            {...(option.type === session.equippedWeapon
              ? { inputRef: equippedRef }
              : {})}
          />
        ))}
      </div>
    </Overlay>
  );
}

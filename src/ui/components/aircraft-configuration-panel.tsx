import { useState } from 'react';
import type { ReactElement } from 'react';
import { aircraftDisplayName } from '@application/hangar';
import { useApplication } from '../application-context';
import { useSessionState } from '../hooks';
import { FieldRow } from './field-row';
import { HullIntegrityBar } from './hull-integrity-bar';
import { Button, Panel, Text } from '../primitives';

export interface AircraftConfigurationPanelProps {
  readonly onOpenWeaponSelection: () => void;
}

/**
 * Canonical Aircraft Configuration Panel (DS §8.13, Base §6.3): the fixed
 * content order — aircraft name, Pilot, Hull Integrity (bar + numeric),
 * Primary Weapon with `Change Weapon`, and the Repair section only while
 * damaged. Repair applies the approved atomic Credits/Hull transaction; the
 * action disables immediately for repeated-input protection (Base §8, AC-028–
 * AC-030).
 */
export function AircraftConfigurationPanel({
  onOpenWeaponSelection,
}: AircraftConfigurationPanelProps): ReactElement {
  const { store, content } = useApplication();
  const session = useSessionState();
  const [repairRequested, setRepairRequested] = useState(false);

  const aircraftName = aircraftDisplayName(content, session.aircraftId);
  const equippedWeaponName =
    content.weapons.find((weapon) => weapon.type === session.equippedWeapon)
      ?.displayName ?? session.equippedWeapon;
  const damaged = session.hullIntegrity < 100;
  const repairEnabled = damaged && session.credits >= 1 && !repairRequested;

  const handleRepair = (): void => {
    if (!repairEnabled) {
      return;
    }
    setRepairRequested(true);
    store.dispatch({ type: 'session/repair' });
  };

  return (
    <Panel className="ds-aircraft-configuration-panel">
      <Text style="title">{aircraftName}</Text>

      <div className="ds-aircraft-configuration-panel__section">
        <Text style="caption" tone="secondary">
          Pilot
        </Text>
        <Text style="body">{session.pilot.name}</Text>
      </div>

      <div className="ds-aircraft-configuration-panel__section">
        <Text style="caption" tone="secondary">
          Hull Integrity
        </Text>
        <HullIntegrityBar current={session.hullIntegrity} />
      </div>

      <div className="ds-aircraft-configuration-panel__section">
        <Text style="caption" tone="secondary">
          Primary Weapon
        </Text>
        <Text style="body">{equippedWeaponName}</Text>
        <Button variant="secondary" onClick={onOpenWeaponSelection}>
          Change Weapon
        </Button>
      </div>

      {damaged ? (
        <div className="ds-aircraft-configuration-panel__section">
          <Text style="heading">Repair</Text>
          <FieldRow label="Credits" value={session.credits} />
          <FieldRow label="Cost" value="1 Credit" />
          <Button
            variant="secondary"
            disabled={!repairEnabled}
            onClick={handleRepair}
          >
            Repair
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}

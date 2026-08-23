import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type {
  CombatDebugCommand,
  CombatObservability,
} from '@application/combat';
import { FieldRow } from '../components';
import { Button, Checkbox, Divider, Overlay, Text } from '../primitives';

export interface DebugOverlayProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Read-only observability snapshot; `null` until the Combat session loads. */
  readonly getObservability: () => CombatObservability | null;
  /** Relays one deterministic Debug command to the application simulation. */
  readonly submitDebugAction: (command: CombatDebugCommand) => void;
}

/**
 * Development-only Debug Overlay (Combat §11, DS §8.24): width
 * `clamp(32rem, 50vw, 44rem)` with the fixed section order Title Debug;
 * Observability; God Mode; Hull Controls; Spawn Controls; Result Controls;
 * Close. Observability shows only the approved values (Mission Time, Player
 * Hull, Active Enemies, Destroyed Enemies, Escaped Enemies, Final Group
 * Spawned) via Field Rows and is refreshed only on open and accepted Debug
 * actions while paused — never per frame. Related actions use two-column
 * rows; `Win Mission` is primary and `Lose Mission` destructive; content
 * scrolls while Header and Close remain visible. This component exists only in
 * development builds (the CombatScreen lazy-loads it behind `import.meta.env.DEV`).
 */
export function DebugOverlay({
  open,
  onClose,
  getObservability,
  submitDebugAction,
}: DebugOverlayProps): ReactElement | null {
  const [observability, setObservability] =
    useState<CombatObservability | null>(null);

  const refresh = (): void => {
    const value = getObservability();
    if (value !== null) {
      setObservability(value);
    }
  };

  useEffect(() => {
    if (open) {
      refresh();
    }
    // Refresh only on open; every accepted action calls `refresh` explicitly.
  }, [open]);

  if (!open) {
    return null;
  }

  const godMode = observability?.godModeEnabled ?? false;
  const finalGroupSpawned = observability?.finalGroupSpawned ?? false;
  const act = (command: CombatDebugCommand): void => {
    submitDebugAction(command);
    refresh();
  };

  return (
    <Overlay
      open
      labelledBy="debug-overlay-title"
      onClose={onClose}
      className="ds-debug-overlay"
      header={
        <Text as="h2" id="debug-overlay-title" style="heading">
          Debug
        </Text>
      }
      actions={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="ds-debug-overlay__section">
        <FieldRow
          label="Mission Time"
          value={
            observability === null
              ? '—'
              : `${observability.missionTimeSeconds.toFixed(1)} s`
          }
        />
        <FieldRow
          label="Player Hull"
          value={
            observability === null
              ? '—'
              : String(observability.playerHullIntegrity)
          }
        />
        <FieldRow
          label="Active Enemies"
          value={
            observability === null ? '—' : String(observability.activeEnemies)
          }
        />
        <FieldRow
          label="Destroyed Enemies"
          value={
            observability === null
              ? '—'
              : String(observability.destroyedEnemies)
          }
        />
        <FieldRow
          label="Escaped Enemies"
          value={
            observability === null ? '—' : String(observability.escapedEnemies)
          }
        />
        <FieldRow
          label="Final Group Spawned"
          value={
            observability === null
              ? '—'
              : observability.finalGroupSpawned
                ? 'Yes'
                : 'No'
          }
        />
      </div>
      <Divider />
      <Checkbox
        id="debug-god-mode"
        checked={godMode}
        onCheckedChange={(enabled) =>
          act({ type: 'combat-debug/god-mode', enabled })
        }
        label="God Mode"
      />
      <Divider />
      <div className="ds-debug-overlay__row">
        <Button
          variant="secondary"
          disabled={godMode}
          onClick={() => act({ type: 'combat-debug/set-hull', hull: 25 })}
        >
          Set Hull: 25
        </Button>
        <Button
          variant="secondary"
          disabled={godMode}
          onClick={() => act({ type: 'combat-debug/set-hull', hull: 100 })}
        >
          Set Hull: 100
        </Button>
      </div>
      <Divider />
      <div className="ds-debug-overlay__row">
        <Button
          variant="secondary"
          onClick={() => act({ type: 'combat-debug/spawn-standard-enemy' })}
        >
          Spawn Standard Enemy
        </Button>
        <Button
          variant="secondary"
          disabled={finalGroupSpawned}
          onClick={() => act({ type: 'combat-debug/spawn-final-group' })}
        >
          Spawn Final Group
        </Button>
      </div>
      <Divider />
      <div className="ds-debug-overlay__row">
        <Button
          variant="primary"
          onClick={() => act({ type: 'combat-debug/win-mission' })}
        >
          Win Mission
        </Button>
        <Button
          variant="destructive"
          onClick={() => act({ type: 'combat-debug/lose-mission' })}
        >
          Lose Mission
        </Button>
      </div>
    </Overlay>
  );
}

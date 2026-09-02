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
  const act = (command: CombatDebugCommand): void => {
    submitDebugAction(command);
    refresh();
  };

  const activeText =
    observability === null
      ? '—'
      : formatRoleCounts(observability.activeEnemiesByType);
  const destroyedText =
    observability === null
      ? '—'
      : formatRoleCounts(observability.destroyedEnemiesByType);
  const escapedText =
    observability === null
      ? '—'
      : formatRoleCounts(observability.escapedEnemiesByType);

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
          label="Combat Seed"
          value={
            observability === null ? '—' : String(observability.combatSeed)
          }
        />
        <FieldRow
          label="Mission Clock"
          value={
            observability === null
              ? '—'
              : `${observability.missionTimeSeconds.toFixed(1)} s`
          }
        />
        <FieldRow
          label="Combat Countdown"
          value={
            observability === null ? '—' : `${observability.countdownSeconds} s`
          }
        />
        <FieldRow
          label="Current Encounter"
          value={
            observability === null
              ? '—'
              : (observability.currentEncounterId ?? '—')
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
        <FieldRow label="Active Enemies" value={activeText} />
        <FieldRow label="Destroyed Enemies" value={destroyedText} />
        <FieldRow label="Escaped Enemies" value={escapedText} />
        <FieldRow
          label="Combat Rewards"
          value={
            observability === null
              ? '—'
              : String(observability.pendingCombatRewards)
          }
        />
        <FieldRow
          label="Escape Penalties"
          value={
            observability === null
              ? '—'
              : String(observability.pendingEscapePenalties)
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
          Spawn Basic
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            act({
              type: 'combat-debug/spawn-encounter',
              encounterId: 'interception-01-e1',
            })
          }
        >
          Spawn E1
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            act({
              type: 'combat-debug/spawn-encounter',
              encounterId: 'interception-01-e5',
            })
          }
        >
          Spawn E5
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

/** Formats a per-role count record as `Basic 3 · Ranged 1` (zero roles
 *  omitted; an all-zero record shows `0`). */
function formatRoleCounts(counts: Readonly<Record<string, number>>): string {
  const parts: string[] = [];
  if ((counts['basic-drone'] ?? 0) > 0) {
    parts.push(`Basic ${counts['basic-drone']}`);
  }
  if ((counts['ranged-drone'] ?? 0) > 0) {
    parts.push(`Ranged ${counts['ranged-drone']}`);
  }
  if ((counts['hunter-drone'] ?? 0) > 0) {
    parts.push(`Hunter ${counts['hunter-drone']}`);
  }
  return parts.length > 0 ? parts.join(' · ') : '0';
}

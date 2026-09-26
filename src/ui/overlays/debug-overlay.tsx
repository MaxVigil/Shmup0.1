import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';
import type {
  CombatDebugCommand,
  CombatObservability,
  CombatObservabilityElite,
} from '@application/combat';
import {
  activeMissionIdentity,
  debugCampaignMatchesActiveMission,
  readDebugCampaign,
} from '@application/persistence';
import type {
  DebugCampaignCommand,
  DebugCampaignReadModel,
  DebugCreditsValue,
} from '@application/persistence';
import type { EnemyType } from '@domain/index';
import { useApplication } from '../application-context';
import { FieldRow } from '../components';
import { Button, Checkbox, Divider, Overlay, Text } from '../primitives';

export interface DebugOverlayProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Read-only observability snapshot; `null` until the Combat session loads. */
  readonly getObservability: () => CombatObservability | null;
  /** Relays one deterministic Debug command to the application simulation. */
  readonly submitDebugAction: (command: CombatDebugCommand) => void;
  /**
   * Authored Encounter ids of the CURRENT Active Mission, in authored order
   * (V02-WI-05 M02-R01, generalised by V02-WI-07 D01). One `Spawn E<n>` action is
   * rendered per authored Encounter through the same authoritative
   * `combat-debug/spawn-encounter` command, so the development surface can never
   * target another mission's staging and no subset is hard-coded. An absent
   * authored id renders nothing instead of relaying a foreign identity.
   */
  readonly encounterIds: readonly string[];
  /**
   * V02-WI-07 D02-A-C01 F2: the development-only campaign Debug command owned by
   * the Combat Screen for the lifetime of the logical active mission. Its
   * single-flight latch and pending state therefore survive Debug close/reopen
   * (an Overlay-owned latch would die with this component), and the command
   * itself enforces the canonical Debug eligibility boundary.
   */
  readonly campaignCommand: DebugCampaignCommand;
}

/** The four approved enemy roles, in canonical vocabulary order. */
const ENEMY_ROLE_ACTIONS: readonly {
  readonly enemyType: EnemyType;
  readonly label: string;
}[] = [
  { enemyType: 'basic-drone', label: 'Spawn Basic' },
  { enemyType: 'ranged-drone', label: 'Spawn Ranged' },
  { enemyType: 'hunter-drone', label: 'Spawn Hunter' },
  { enemyType: 'elite-drone', label: 'Spawn Elite' },
];

/**
 * V02-WI-07 D02-A derived campaign view: the freshly read persisted campaign
 * (or `null` while loading/unavailable) plus the `Reload for Recovery`
 * eligibility the same read proves.
 */
interface DebugCampaignView {
  readonly campaign: DebugCampaignReadModel | null;
  readonly reloadForRecoveryEnabled: boolean;
}

const EMPTY_CAMPAIGN_VIEW: DebugCampaignView = {
  campaign: null,
  reloadForRecoveryEnabled: false,
};

/**
 * Development-only Debug Overlay (Combat §11, Epic §17, DS §8.24): width
 * `clamp(32rem, 50vw, 44rem)` with the fixed section order Title Debug;
 * Observability; God Mode; Hull Controls; Spawn Controls; Result Controls;
 * Close. Observability shows only the approved v0.2 values (Combat Seed, Mission
 * Clock, Combat Countdown, Current Encounter, Elite Phase/phase time, Player
 * Hull, Active/Destroyed-by-cause/Escaped role counts, pending rewards and
 * penalties) via Field Rows and is refreshed only on open and accepted Debug
 * actions while paused — never per frame.
 *
 * Every action is a deterministic application command: one per approved enemy
 * type, one per authored Encounter of the current mission, the two
 * authoritative Elite phase transitions (enabled only while a current Elite
 * exists), and the three forced terminal outcomes. Related action Buttons use
 * two columns; `Win Mission` is primary, `Lose Mission`/`Evacuate Mission` are
 * destructive, and content scrolls while Header and Close remain visible. This
 * component and its labels exist only in development builds (the CombatScreen
 * lazy-loads it behind `import.meta.env.DEV`).
 *
 * V02-WI-07 D02-A adds the persisted-campaign rows (`Credits`,
 * `missionInProgress`, `runStatus`), the two bounded Repair-boundary Credit
 * controls, and `Reload for Recovery`. The campaign facts come from
 * `CampaignStorePort.read` through the application command module — never from
 * Combat simulation state or a React mirror — and the Credit controls use the
 * same atomic campaign transaction as every shipped campaign command, persisting
 * first and reconciling the Session Store only for the still-active Mission
 * Instance. `Reload for Recovery` re-verifies a fresh authoritative read and
 * performs browser navigation only; Boot remains the sole recovery transition
 * owner.
 *
 * V02-WI-07 D02-A-C01: the Credit/Recovery command is OWNED BY THE COMBAT SCREEN
 * for the lifetime of the logical active mission and injected here as
 * `campaignCommand`, so its single-flight latch and pending state survive Debug
 * close/reopen; this component only relays activations and renders the pending
 * state it observes through the external-store subscription.
 */
export function DebugOverlay({
  open,
  onClose,
  getObservability,
  submitDebugAction,
  encounterIds,
  campaignCommand,
}: DebugOverlayProps): ReactElement | null {
  const { store, campaignStore } = useApplication();
  const [observability, setObservability] =
    useState<CombatObservability | null>(null);
  const [campaignView, setCampaignView] =
    useState<DebugCampaignView>(EMPTY_CAMPAIGN_VIEW);
  // D02-A-C01 F2: the pending states are read from the mission-lifetime command
  // (an external store), so they are still correct after Debug closes and
  // reopens while a write is in flight — no Overlay-local latch.
  const creditsPending = useSyncExternalStore(
    campaignCommand.subscribe,
    campaignCommand.isCreditsPending,
  );
  const recoveryReloadPending = useSyncExternalStore(
    campaignCommand.subscribe,
    campaignCommand.isRecoveryReloadPending,
  );
  // Monotonic read token: only the newest campaign read may publish, so an
  // out-of-order completion can never show a stale marker or eligibility.
  const readTokenRef = useRef(0);

  const refresh = (): void => {
    const value = getObservability();
    if (value !== null) {
      setObservability(value);
    }
  };

  const refreshCampaign = (): void => {
    const token = readTokenRef.current + 1;
    readTokenRef.current = token;
    void readDebugCampaign({ campaignStore }).then((outcome) => {
      if (readTokenRef.current !== token) {
        return;
      }
      if (outcome.kind !== 'loaded') {
        setCampaignView(EMPTY_CAMPAIGN_VIEW);
        return;
      }
      const identity = activeMissionIdentity(store);
      setCampaignView({
        campaign: outcome.campaign,
        reloadForRecoveryEnabled:
          identity !== null &&
          debugCampaignMatchesActiveMission(outcome.campaign, identity),
      });
    });
  };

  const refreshAll = (): void => {
    refresh();
    refreshCampaign();
  };

  useEffect(() => {
    if (open) {
      refreshAll();
    }
    // Refresh only on open; every accepted action calls `refreshAll` explicitly.
  }, [open]);

  // D02-A-C01 F2: the logical Credit command outlives this component, so a write
  // that settles while Debug is closed must still land in the read model when
  // the Overlay is open again. Observing the external-store pending transition
  // refreshes the authoritative campaign exactly once per settle, without a
  // timer, polling, or an Overlay-local latch.
  const creditsWerePendingRef = useRef(false);
  useEffect(() => {
    const wasPending = creditsWerePendingRef.current;
    creditsWerePendingRef.current = creditsPending;
    if (wasPending && !creditsPending) {
      refreshAll();
    }
  }, [creditsPending]);

  if (!open) {
    return null;
  }

  const godMode = observability?.godModeEnabled ?? false;
  const currentElite = observability?.elite ?? null;
  const eliteActionsEnabled = currentElite !== null;
  const act = (command: CombatDebugCommand): void => {
    submitDebugAction(command);
    refreshAll();
  };
  // V02-WI-07 D02-A: apply one bounded Credit value through the atomic campaign
  // transaction, then re-read both surfaces. No success toast, alternate error
  // UX, or local economy computation exists; the durable record is the
  // authority and a rejected/stale/failed attempt simply changes nothing.
  const setCredits = (value: DebugCreditsValue): void => {
    void campaignCommand.setCredits(value).finally(() => {
      refreshAll();
    });
  };
  // V02-WI-07 D02-A-C01 F3: the command re-reads the persisted campaign at
  // activation and verifies the exact current identity before navigating; a
  // no-op outcome simply refreshes the displayed facts.
  const requestRecoveryReload = (): void => {
    void campaignCommand.requestRecoveryReload().finally(() => {
      refreshAll();
    });
  };
  const campaign = campaignView.campaign;
  const creditsText = campaign === null ? '—' : String(campaign.credits);
  const markerText =
    campaign === null
      ? '—'
      : campaign.missionInProgress === null
        ? 'None'
        : `${campaign.missionInProgress.missionId} · attempt ${String(
            campaign.missionInProgress.attemptId,
          )}`;
  const runStatusText = campaign === null ? '—' : campaign.runStatus;

  const activeText =
    observability === null
      ? '—'
      : formatRoleCounts(observability.activeEnemiesByType);
  const destroyedText =
    observability === null
      ? '—'
      : formatRoleCounts(observability.destroyedEnemiesByType);
  const destroyedByProjectileText =
    observability === null
      ? '—'
      : formatRoleCounts(observability.destroyedByProjectileEnemiesByType);
  const destroyedByContactText =
    observability === null
      ? '—'
      : formatRoleCounts(observability.destroyedByContactEnemiesByType);
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
          label="Elite Phase"
          value={currentElite === null ? '—' : elitePhaseLabel(currentElite)}
        />
        <FieldRow
          label="Elite Phase Time"
          value={formatElitePhaseTime(currentElite)}
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
        <FieldRow
          label="Destroyed by Projectile"
          value={destroyedByProjectileText}
        />
        <FieldRow label="Destroyed by Contact" value={destroyedByContactText} />
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
        {/* V02-WI-07 D02-A persisted-campaign facts (Epic §17): read from
            CampaignStorePort, never from the Combat simulation or a mirror. */}
        <FieldRow label="Credits" value={creditsText} />
        <FieldRow label="missionInProgress" value={markerText} />
        <FieldRow label="runStatus" value={runStatusText} />
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
      {/* V02-WI-07 D02-A: the two exact Repair-boundary Credit values
          (Epic §12.4). They belong to the authoritative player-resource
          controls, so they extend this group; both are disabled while the
          single-flight campaign command is pending. */}
      <div className="ds-debug-overlay__row">
        <Button
          variant="secondary"
          disabled={creditsPending}
          onClick={() => setCredits(7)}
        >
          Set Credits: 7
        </Button>
        <Button
          variant="secondary"
          disabled={creditsPending}
          onClick={() => setCredits(8)}
        >
          Set Credits: 8
        </Button>
      </div>
      <Divider />
      {rowChunks(ENEMY_ROLE_ACTIONS).map((row) => (
        <div
          key={`role-${String(row.items[0]?.enemyType ?? 'empty')}`}
          className="ds-debug-overlay__row"
        >
          {row.items.map((role) => (
            <Button
              key={role.enemyType}
              variant="secondary"
              onClick={() =>
                act({
                  type: 'combat-debug/spawn-enemy',
                  enemyType: role.enemyType,
                })
              }
            >
              {role.label}
            </Button>
          ))}
        </div>
      ))}
      {rowChunks(encounterIds).map((row) => (
        <div
          key={`encounter-${row.items[0] ?? 'empty'}`}
          className="ds-debug-overlay__row"
        >
          {row.items.map((encounterId, column) => (
            <Button
              key={encounterId}
              variant="secondary"
              onClick={() =>
                act({ type: 'combat-debug/spawn-encounter', encounterId })
              }
            >
              {`Spawn E${row.startIndex + column + 1}`}
            </Button>
          ))}
        </div>
      ))}
      <div className="ds-debug-overlay__row">
        <Button
          variant="secondary"
          disabled={!eliteActionsEnabled}
          onClick={() =>
            act({ type: 'combat-debug/set-elite-phase', phase: 'armoured' })
          }
        >
          Elite: Armoured
        </Button>
        <Button
          variant="secondary"
          disabled={!eliteActionsEnabled}
          onClick={() =>
            act({ type: 'combat-debug/set-elite-phase', phase: 'vulnerable' })
          }
        >
          Elite: Vulnerable
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
      <div className="ds-debug-overlay__row">
        <Button
          variant="destructive"
          onClick={() => act({ type: 'combat-debug/evacuate-mission' })}
        >
          Evacuate Mission
        </Button>
      </div>
      {/* V02-WI-07 D02-A recovery affordance: browser reload only, owned by the
          Result/terminal control group because it resolves the persisted active
          mission as Defeat. Boot remains the sole recovery transition owner. It
          is enabled only while the latest campaign read proved an active run
          whose marker exactly matches the current Mission Snapshot. */}
      <div className="ds-debug-overlay__row">
        <Button
          variant="destructive"
          disabled={
            !campaignView.reloadForRecoveryEnabled || recoveryReloadPending
          }
          onClick={requestRecoveryReload}
        >
          Reload for Recovery
        </Button>
      </div>
    </Overlay>
  );
}

/** The canonical `Elite Phase` value for the current Elite. */
function elitePhaseLabel(elite: CombatObservabilityElite): string {
  if (elite.phase === 'entering') {
    return 'Entering';
  }
  return elite.phase === 'armoured' ? 'Armoured' : 'Vulnerable';
}

/**
 * The canonical `Elite Phase Time` value: the authoritative elapsed seconds
 * inside the current ACTIVE phase. It is absent (`—`) when this simulation has
 * no Elite and while the Elite is still `entering` (no active phase owns time
 * yet).
 */
function formatElitePhaseTime(elite: CombatObservabilityElite | null): string {
  if (elite === null || elite.phase === 'entering') {
    return '—';
  }
  return `${elite.phaseElapsedSeconds.toFixed(1)} s`;
}

/** One two-column action row plus the zero-based index of its first item, so
 *  deterministic `Spawn E<n>` labels are derived from authored order. */
interface DebugActionRow<T> {
  readonly items: readonly T[];
  readonly startIndex: number;
}

function rowChunks<T>(items: readonly T[]): readonly DebugActionRow<T>[] {
  const rows: DebugActionRow<T>[] = [];
  for (let index = 0; index < items.length; index += 2) {
    rows.push({ items: items.slice(index, index + 2), startIndex: index });
  }
  return rows;
}

/** Formats a per-role count record as `Basic 3 · Ranged 1 · Elite 1` (zero
 *  roles omitted; an all-zero record shows `0`). */
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
  if ((counts['elite-drone'] ?? 0) > 0) {
    parts.push(`Elite ${counts['elite-drone']}`);
  }
  return parts.length > 0 ? parts.join(' · ') : '0';
}

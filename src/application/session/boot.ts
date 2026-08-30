import type { ContentCatalogue } from '@content/index';
import {
  DEFAULT_USER_SETTINGS,
  applyDefeatRecoveryOrGameOver,
} from '@domain/index';
import type { PersistenceDiagnostic } from '@domain/index';
import type {
  AssetPreloadResult,
  RuntimeAssetPreload,
  SessionSeedSource,
} from '../ports';
import type { CampaignStorePort, UserSettingsStorePort } from '../persistence';
import {
  buildNewGameCampaign,
  readHydrationSettings,
} from '../persistence/commands';
import { hydrateSessionFromCampaign } from './hydrate-session';
import type { SessionStore } from './store';

export type BootOutcome =
  | { readonly kind: 'ready'; readonly assets: AssetPreloadResult }
  | {
      readonly kind: 'save-data-error';
      readonly assets: AssetPreloadResult;
      readonly diagnostics: readonly PersistenceDiagnostic[];
    }
  | { readonly kind: 'fatal'; readonly reason: unknown };

export interface BootDependencies {
  readonly store: SessionStore;
  readonly sessionSeedSource: SessionSeedSource;
  readonly runtimeAssetPreload: RuntimeAssetPreload;
  readonly content: ContentCatalogue;
  readonly campaignStore: CampaignStorePort;
  readonly userSettingsStore: UserSettingsStorePort;
}

/**
 * Single-flight Boot owner (S02-WI02, WI-02 delta): repeated or concurrent
 * `run()` calls reuse the same in-progress or completed result. The session
 * seed draw, preload, campaign hydration/creation, startup active-mission
 * recovery, Settings read, session initialization, and result creation each
 * occur at most once per page load.
 *
 * WI-02: Boot hydrates exactly one authoritative session from the persisted
 * campaign plus the separately persisted Settings; it creates and persists the
 * canonical v0.2 New Game state (12 Starting Credits) when no campaign exists;
 * it resolves a persisted active mission exactly once as Defeat through the
 * zero-reward 8-Credit full-Repair-or-Game-Over rule WITHOUT restoring Combat
 * (Epic §14.3, V02-AC-018); and it opens the Save Data Error state when the
 * stored campaign fails validation or migration without overwriting it
 * (Epic §14.2, V02-AC-021).
 */
export interface BootRunner {
  run(): Promise<BootOutcome>;
}

export function createBootRunner(deps: BootDependencies): BootRunner {
  let inFlight: Promise<BootOutcome> | null = null;
  return {
    run(): Promise<BootOutcome> {
      if (inFlight === null) {
        inFlight = performBoot(deps);
      }
      return inFlight;
    },
  };
}

function performBoot(deps: BootDependencies): Promise<BootOutcome> {
  return (async (): Promise<BootOutcome> => {
    let sessionSeed: number;
    try {
      // Critical initialization first (Technical Foundation §8): the session
      // seed; failure here is fatal.
      sessionSeed = deps.sessionSeedSource.getSessionSeed();
    } catch (reason: unknown) {
      return { kind: 'fatal', reason };
    }
    // Runtime assets are non-critical (MASTER-AC-003): a rejected preload port
    // yields the complete approved manifest with every entry marked `fallback`
    // (never an empty array and never Fatal Startup).
    const assets = await deps.runtimeAssetPreload
      .preload()
      .catch(() => deps.runtimeAssetPreload.fallbackResult());

    let campaign;
    try {
      const read = await deps.campaignStore.read();
      if (read.kind === 'invalid') {
        // Corruption or unsupported version: the stored data is never
        // overwritten; only an explicit confirmed New Game replaces it.
        return {
          kind: 'save-data-error',
          assets,
          diagnostics: read.diagnostics,
        };
      }
      if (read.kind === 'none') {
        // No campaign exists: create and persist the canonical v0.2 New Game
        // state exactly once (Epic §14.1, WI-02 delta).
        const created = buildNewGameCampaign(deps.content, sessionSeed);
        await deps.campaignStore.replace(created);
        campaign = created;
      } else {
        campaign = read.campaign;
      }
      // Startup active-mission recovery (Epic §14.3, V02-AC-018): a persisted
      // missionInProgress marker resolves exactly once as Defeat through the
      // zero-reward 8-Credit full-Repair-or-Game-Over rule. Combat is never
      // restored. The recovery runs as ONE atomic read-modify-write update —
      // read, strict validation, Defeat recovery, marker clearing, and durable
      // write form a single transaction, so a stale or concurrent recovery
      // completion is inert and can never overwrite a newer campaign state.
      if (campaign.missionInProgress !== null) {
        const recoveryOutcome = await deps.campaignStore.update((current) => {
          const recovery = applyDefeatRecoveryOrGameOver(current);
          return recovery.kind === 'rejected'
            ? { kind: 'rejected', reason: recovery.reason }
            : { kind: 'applied', campaign: recovery.campaign };
        });
        if (recoveryOutcome.kind === 'applied') {
          campaign = recoveryOutcome.next;
        } else if (recoveryOutcome.kind === 'no-change') {
          // The marker was already cleared by a stale/concurrent recovery
          // completion: that completion is the durable authority. Refresh the
          // campaign so the session hydrates the already-recovered state.
          const refreshed = await deps.campaignStore.read();
          if (refreshed.kind !== 'loaded') {
            throw new Error(
              'Startup recovery: the campaign could not be refreshed',
            );
          }
          campaign = refreshed.campaign;
        } else {
          throw new Error(
            `Startup mission recovery failed: ${
              recoveryOutcome.kind === 'invalid'
                ? 'campaign record is invalid'
                : 'campaign record is missing'
            }`,
          );
        }
      }
    } catch (reason: unknown) {
      return { kind: 'fatal', reason };
    }

    let settings = DEFAULT_USER_SETTINGS;
    try {
      settings = await readHydrationSettings({
        userSettingsStore: deps.userSettingsStore,
      });
    } catch {
      // A Settings read infrastructure failure is non-critical; the approved
      // default keeps the run usable (campaign persistence is the critical
      // path and has already succeeded).
    }

    try {
      // Session creation completes the approved boot path (Master §5.2,
      // Epic §14.1). A game-over run hydrates with runStatus `game-over` so
      // the Session Router opens the Game Over Screen.
      const session = hydrateSessionFromCampaign({
        campaign,
        settings,
        sessionSeed,
        content: deps.content,
      });
      deps.store.dispatch({ type: 'session/initialized', session });
      return { kind: 'ready', assets };
    } catch (reason: unknown) {
      return { kind: 'fatal', reason };
    }
  })().catch((reason: unknown) => ({ kind: 'fatal', reason }));
}

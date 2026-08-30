import { DEFAULT_USER_SETTINGS, createNewGameCampaign } from '@domain/index';
import type { CampaignStateV1, UserSettingsV1 } from '@domain/index';
import type { ContentCatalogue } from '../content';
import { hydrateSessionFromCampaign } from '../session/hydrate-session';
import type { SessionStore } from '../session';
import type { CampaignStorePort } from './campaign-store';
import type { UserSettingsStorePort } from './user-settings-store';

/**
 * Application persistence commands (WI-02 delta): every command persists first
 * and only then mutates the single in-memory Session Store, so the durable
 * campaign/settings record and the authoritative session never diverge. UI and
 * Phaser dispatch these application commands; they never touch the stores
 * directly.
 */
export interface PersistenceCommandDeps {
  readonly store: SessionStore;
  readonly campaignStore: CampaignStorePort;
  readonly userSettingsStore: UserSettingsStorePort;
  readonly content: ContentCatalogue;
}

/**
 * Builds the canonical v0.2 New Game campaign from the validated content
 * catalogue (Epic §13.6; V02-AC-017). `sessionSeed` drives the approved
 * pilot-selection stream so each New Game draws a Pilot with equal probability.
 */
export function buildNewGameCampaign(
  content: ContentCatalogue,
  sessionSeed: number,
): CampaignStateV1 {
  const aircraft = content.aircraft[0];
  if (aircraft === undefined) {
    throw new Error(
      'New Game creation failed: canonical content is incomplete',
    );
  }
  return createNewGameCampaign({
    aircraftId: aircraft.id,
    maximumHullIntegrity: aircraft.maximumHullIntegrity,
    pilotIds: content.pilots.map((pilot) => pilot.id),
    sessionSeed,
  });
}

/**
 * Reads the persisted user Settings for hydration. A missing record uses the
 * approved default. An invalid Settings record is a non-campaign defect: the
 * approved in-memory default is used and the stored record is NEVER overwritten
 * during Boot, so the invalid record and its diagnostic evidence remain
 * preserved for a later Debug/observability read (V02-WI-02 correction).
 */
export async function readHydrationSettings(
  deps: Pick<PersistenceCommandDeps, 'userSettingsStore'>,
): Promise<UserSettingsV1> {
  const read = await deps.userSettingsStore.read();
  if (read.kind === 'loaded') {
    return read.settings;
  }
  return DEFAULT_USER_SETTINGS;
}

/**
 * Shared Settings change (Epic §14.1, V02-AC-017): persists `Mouse Movement
 * Enabled` separately from the campaign, then updates the session. The value
 * is write-through (the caller's target is authoritative), so a New Game
 * campaign replacement never resets it.
 */
export async function setMouseMovementEnabled(
  deps: Pick<PersistenceCommandDeps, 'store' | 'userSettingsStore'>,
  enabled: boolean,
): Promise<void> {
  await deps.userSettingsStore.write({ mouseMovementEnabled: enabled });
  deps.store.dispatch({
    type: 'session/set-mouse-movement-enabled',
    enabled,
  });
}

/**
 * Confirmed New Game command (Epic §13.6, §14.2, V02-AC-017): atomically
 * replaces the campaign record with a fresh v0.2 New Game state, then resets
 * the session by hydrating from the new campaign and the UNCHANGED persisted
 * user Settings. Used by both the Game Over Screen and the Save Data Error
 * Screen through their blocking destructive confirmation. `sessionSeed` is a
 * fresh draw so a new Pilot is selected.
 *
 * Single-flight ownership is scoped to the ACTIVE application/composition-root
 * instance (V02-WI-02 correction C02): the composition root creates exactly
 * one `NewGameCommand` and injects it through the ApplicationContext, so
 * concurrent or repeated activations of one logical confirmed action share one
 * in-flight execution (exactly one campaign replacement and one session
 * reset). Independent application instances own independent latches and never
 * suppress or share each other's campaign replacement. The latch clears on
 * completion, so a later, genuinely separate confirmed New Game after a new
 * Game Over still works.
 */
export interface NewGameCommand {
  run(sessionSeed: number): Promise<void>;
}

export function createNewGameCommand(
  deps: PersistenceCommandDeps,
): NewGameCommand {
  let inFlight: Promise<void> | null = null;
  return {
    run(sessionSeed: number): Promise<void> {
      if (inFlight !== null) {
        return inFlight;
      }
      inFlight = performNewGame(deps, sessionSeed).finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}

async function performNewGame(
  deps: PersistenceCommandDeps,
  sessionSeed: number,
): Promise<void> {
  const campaign = buildNewGameCampaign(deps.content, sessionSeed);
  await deps.campaignStore.replace(campaign);
  const settings = await readHydrationSettings(deps);
  const session = hydrateSessionFromCampaign({
    campaign,
    settings,
    sessionSeed,
    content: deps.content,
  });
  deps.store.dispatch({ type: 'session/new-game', session });
}

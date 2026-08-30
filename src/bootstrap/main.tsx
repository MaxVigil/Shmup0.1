import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBootRunner, createSessionStore } from '@application/session';
import type { SessionStore } from '@application/session';
import type { AssetPreloadResult } from '@application/ports';
import type { SessionSeedSource } from '@application/ports';
import type {
  CampaignStorePort,
  UserSettingsStorePort,
} from '@application/persistence';
import { createNewGameCommand } from '@application/persistence';
import { CONTENT_CATALOGUE } from '@content/index';
import { createBrowserAssetPreload } from '@platform/assets/preload';
import { createBrowserSessionSeedSource } from '@platform/browser/session-seed-source';
import { logBuildIdentifier } from '@platform/diagnostics/build-identifier';
import {
  createDexieCampaignStore,
  createDexieUserSettingsStore,
  createPersistenceDatabase,
} from '@platform/persistence';
import { ApplicationContext } from '@ui/application-context';
import '@ui/styles/index.css';
import { App } from './app';
import type { AppPhase } from './app';

const rootElement = document.querySelector<HTMLElement>('#app');
if (rootElement === null) {
  throw new Error('Application root #app is missing.');
}

const root = createRoot(rootElement);

const store: SessionStore = createSessionStore();
const sessionSeedSource: SessionSeedSource = createBrowserSessionSeedSource();
// Dexie is confined to the platform persistence adapter (Epic §14.1,
// V02-DEC-004). Valid aircraft/Pilot identity sets come from the validated
// content catalogue and drive strict untrusted-input validation on every read;
// the same sets are threaded through the persistence database options so the
// version-1 → version-2 upgrade runs the complete legacy C03 validation with
// the identical identity context (V02-WI-02 correction C06).
const validAircraftIds = new Set(
  CONTENT_CATALOGUE.aircraft.map((aircraft) => aircraft.id),
);
const validPilotIds = new Set(
  CONTENT_CATALOGUE.pilots.map((pilot) => pilot.id),
);
const database = createPersistenceDatabase({
  legacyCampaignSchemaContext: { validAircraftIds, validPilotIds },
});
const campaignStore: CampaignStorePort = createDexieCampaignStore(database, {
  validAircraftIds,
  validPilotIds,
});
const userSettingsStore: UserSettingsStorePort =
  createDexieUserSettingsStore(database);
// The confirmed New Game command is owned by this composition-root instance:
// its single-flight latch is per application instance, never module-global, so
// independent application instances never suppress each other's replacement
// (V02-WI-02 correction C02).
const newGameCommand = createNewGameCommand({
  store,
  campaignStore,
  userSettingsStore,
  content: CONTENT_CATALOGUE,
});

const bootRunner = createBootRunner({
  store,
  sessionSeedSource,
  runtimeAssetPreload: createBrowserAssetPreload(),
  content: CONTENT_CATALOGUE,
  campaignStore,
  userSettingsStore,
});

let currentPhase: AppPhase = 'boot';
let currentAssets: AssetPreloadResult = [];

function renderApp(): void {
  root.render(
    <StrictMode>
      <ApplicationContext.Provider
        value={{
          store,
          preparedAssets: currentAssets,
          content: CONTENT_CATALOGUE,
          campaignStore,
          userSettingsStore,
          sessionSeedSource,
          newGame: newGameCommand,
        }}
      >
        <App
          phase={currentPhase}
          onReload={() => {
            window.location.reload();
          }}
          onSaveDataResolved={() => {
            // Confirmed New Game replaced the unreadable campaign and
            // initialized the session; the ready composition opens Operations.
            currentPhase = 'ready';
            renderApp();
          }}
        />
      </ApplicationContext.Provider>
    </StrictMode>,
  );
}

async function start(): Promise<void> {
  logBuildIdentifier();
  currentPhase = 'boot';
  renderApp();
  const outcome = await bootRunner.run();
  if (outcome.kind === 'fatal') {
    console.error('Fatal startup failure:', outcome.reason);
    currentPhase = 'fatal';
    currentAssets = [];
    renderApp();
    return;
  }
  currentAssets = outcome.assets;
  if (outcome.kind === 'save-data-error') {
    // Path-qualified validation/migration diagnostics are recorded for the
    // Debug/observability boundary without exposing secrets (Epic §14.2);
    // development console diagnostics only, so production output stays clean.
    if (import.meta.env.DEV) {
      console.warn('Save Data Error diagnostics:', outcome.diagnostics);
    }
    currentPhase = 'save-data-error';
    renderApp();
    return;
  }
  currentPhase = 'ready';
  renderApp();
}

void start();

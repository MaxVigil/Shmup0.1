import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBootRunner, createSessionStore } from '@application/session';
import type { SessionStore } from '@application/session';
import type { AssetPreloadResult } from '@application/ports';
import { CONTENT_CATALOGUE } from '@content/index';
import { createBrowserAssetPreload } from '@platform/assets/preload';
import { createBrowserSessionSeedSource } from '@platform/browser/session-seed-source';
import { ApplicationContext } from '@ui/application-context';
import { App } from './app';
import type { AppPhase } from './app';

const rootElement = document.querySelector<HTMLElement>('#app');
if (rootElement === null) {
  throw new Error('Application root #app is missing.');
}

const root = createRoot(rootElement);

function mount(
  phase: AppPhase,
  store: SessionStore,
  preparedAssets: AssetPreloadResult,
): void {
  root.render(
    <StrictMode>
      <ApplicationContext.Provider value={{ store, preparedAssets }}>
        <App
          phase={phase}
          onReload={() => {
            window.location.reload();
          }}
        />
      </ApplicationContext.Provider>
    </StrictMode>,
  );
}

async function start(): Promise<void> {
  const store: SessionStore = createSessionStore();
  const bootRunner = createBootRunner({
    store,
    sessionSeedSource: createBrowserSessionSeedSource(),
    runtimeAssetPreload: createBrowserAssetPreload(),
    content: CONTENT_CATALOGUE,
  });
  mount('boot', store, []);
  const outcome = await bootRunner.run();
  if (outcome.kind === 'fatal') {
    console.error('Fatal startup failure:', outcome.reason);
    mount('fatal', store, []);
    return;
  }
  mount('ready', store, outcome.assets);
}

void start();

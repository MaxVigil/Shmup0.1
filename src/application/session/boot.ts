import type { ContentCatalogue } from '@content/index';
import type {
  AssetPreloadResult,
  RuntimeAssetPreload,
  SessionSeedSource,
} from '../ports';
import { initializeSession } from './initialize-session';
import type { SessionStore } from './store';

export type BootOutcome =
  | { readonly kind: 'ready'; readonly assets: AssetPreloadResult }
  | { readonly kind: 'fatal'; readonly reason: unknown };

export interface BootDependencies {
  readonly store: SessionStore;
  readonly sessionSeedSource: SessionSeedSource;
  readonly runtimeAssetPreload: RuntimeAssetPreload;
  readonly content: ContentCatalogue;
}

/**
 * Single-flight Boot owner (S02-WI02): repeated or concurrent `run()` calls
 * reuse the same in-progress or completed result. The session seed draw,
 * preload, session initialization/Pilot selection, and result creation each
 * occur at most once per page load; idempotency does not rely on the store
 * ignoring a repeated dispatch.
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
    try {
      // Session creation completes the approved boot path (Master §5.2).
      const session = initializeSession(sessionSeed, deps.content);
      deps.store.dispatch({ type: 'session/initialized', session });
      return { kind: 'ready', assets };
    } catch (reason: unknown) {
      return { kind: 'fatal', reason };
    }
  })().catch((reason: unknown) => ({ kind: 'fatal', reason }));
}

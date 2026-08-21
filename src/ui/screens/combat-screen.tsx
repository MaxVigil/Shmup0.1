import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import { loadCombatSession } from '@application/combat';
import type { CombatSession } from '@application/combat';
import { useApplication } from '../application-context';
import { useSessionState } from '../hooks';

/**
 * Combat Screen host (S07): the full-viewport black canvas container. When an
 * active Mission Snapshot exists, the lazy Combat boundary is entered through
 * the application seam (Phaser is dynamically imported); unmounting disposes
 * the Phaser Game/Scene, HUD bridge, and all Combat-owned resources. A Combat
 * initialization failure clears the active mission and signals the failure so
 * Base reopens Mission Details with `Unable to start mission.` (Base AC-014).
 */
export function CombatScreen(): ReactElement | null {
  const { store, preparedAssets } = useApplication();
  const session = useSessionState();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const snapshot = session.activeMission;
    if (snapshot === 'none') {
      return;
    }
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    let disposed = false;
    let owner: CombatSession | null = null;
    // Defer the lazy load one microtask: React StrictMode in development
    // mounts, cleans up, and remounts the effect synchronously, so the first
    // effect must not create a Phaser Game that is destroyed before its boot
    // completes (that would leave an orphaned canvas and Phaser-internal
    // errors). Only the settled mount crosses the lazy boundary.
    void Promise.resolve().then(() => {
      if (disposed) {
        return;
      }
      return loadCombatSession({
        snapshot,
        preparedAssets,
        container,
      })
        .then((loaded) => {
          if (disposed) {
            loaded.dispose();
            return;
          }
          owner = loaded;
        })
        .catch(() => {
          if (!disposed) {
            store.dispatch({ type: 'mission/start-failed' });
          }
        });
    });
    return () => {
      disposed = true;
      owner?.dispose();
      owner = null;
    };
  }, [session.activeMission, preparedAssets, store]);

  if (session.activeMission === 'none') {
    return null;
  }
  return (
    <div data-testid="combat-screen" className="ds-combat-screen">
      <div ref={containerRef} className="ds-combat-canvas" />
    </div>
  );
}

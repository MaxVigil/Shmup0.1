import type { MissionSnapshot } from '../mission/snapshot';
import type { AssetPreloadResult } from '../ports';

export interface CombatSession {
  readonly dispose: () => void;
}

export interface CombatSessionInput {
  readonly snapshot: MissionSnapshot;
  readonly preparedAssets: AssetPreloadResult;
  readonly container: HTMLElement;
}

/**
 * Lazy Combat boundary (Repository Architecture §9, S07): entering Combat
 * dynamically imports the Combat presentation entry — Phaser and the
 * `combat-presentation` module are never statically reachable from Boot/Base
 * and are code-split into a separate chunk by Vite. The application prepares
 * the immutable Mission Snapshot before this import. The returned session
 * owns the Phaser Game/Scene, the HUD bridge, and its disposal contract.
 */
export async function loadCombatSession(
  input: CombatSessionInput,
): Promise<CombatSession> {
  const entry = await import('@combat-presentation/entry');
  return entry.createCombatSession(input);
}

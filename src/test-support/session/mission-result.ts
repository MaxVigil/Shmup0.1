import type { MissionResult } from '@application/mission';

/**
 * Builds a valid v0.2 Success MissionResult for tests (the production command
 * constructs the real payload; the helper only keeps fixtures in sync with
 * the typed contract without duplicating production logic).
 */
export function successMissionResult(
  overrides: Partial<Extract<MissionResult, { readonly kind: 'success' }>> = {},
): Extract<MissionResult, { readonly kind: 'success' }> {
  return {
    kind: 'success',
    missionInstanceOrdinal: 0,
    creditsAfter: 20,
    hullIntegrityAfter: 80,
    creditsEarned: 8,
    combatRewards: 0,
    escapePenalties: 0,
    netCombatReward: 0,
    completionReward: 8,
    newlyUnlockedMissionId: 'interception-02',
    destroyedCounts: {
      'basic-drone': 0,
      'ranged-drone': 0,
      'hunter-drone': 0,
      'elite-drone': 0,
    },
    escapedCounts: {
      'basic-drone': 0,
      'ranged-drone': 0,
      'hunter-drone': 0,
      'elite-drone': 0,
    },
    unlockedMissionIdsAfter: ['interception-01', 'interception-02'],
    completedMissionIdsAfter: ['interception-01'],
    ...overrides,
  };
}

import type { ContentCatalogue } from '../content';
import type { MissionId } from '@domain/index';

/**
 * Narrow temporary v0.1 single-mission compatibility seam (WI-02 delta,
 * SHMUP_V0.2_IMPLEMENTATION_SLICES §3). Until V02-WI-03 (mission registry) and
 * V02-WI-04/WI-05 (v0.2 Combat behaviour and result economy) replace its
 * consumers, the accepted v0.1 UI/result flow adapts to the canonical
 * persisted campaign transaction through this seam:
 *
 * - every mutation routes through the application-owned campaign store
 *   transaction (persist-then-session), never a parallel in-memory authority;
 * - the historical 1-Credit start + session-reset behaviour is NOT preserved:
 *   the campaign starts at the v0.2 12 Starting Credits and survives reload;
 * - no future mission unlock behaviour is invented: the seam starts only the
 *   single approved Interception 01 mission identity;
 * - no v0.2 result economy (pending combat rewards, paid full Repair) leaks
 *   into the seam — V02-WI-04/WI-05 own those rules.
 */
export const SEAM_MISSION_ID: MissionId = 'interception-01';

/**
 * Reward of the temporary single Interception mission, sourced from the
 * current validated content catalogue (v0.1 `reward: 1`). The v0.2 Success
 * economy (pending combat rewards + completion rewards) is V02-WI-04 scope.
 */
export function resolveSeamMissionReward(content: ContentCatalogue): number {
  return content.missions[0]?.reward ?? 1;
}

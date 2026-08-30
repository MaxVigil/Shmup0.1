import type { MissionId } from '@domain/index';

/**
 * Narrow temporary v0.1 single-mission compatibility seam (WI-02 delta,
 * SHMUP_V0.2_IMPLEMENTATION_SLICES §3). Until V02-WI-04/WI-05 replace its
 * consumers, the accepted v0.1 UI/result flow adapts to the canonical
 * persisted campaign transaction through this seam:
 *
 * - every mutation routes through the application-owned campaign store
 *   transaction (persist-then-session), never a parallel in-memory authority;
 * - the historical 1-Credit start + session-reset behaviour is NOT preserved:
 *   the campaign starts at the v0.2 12 Starting Credits and survives reload;
 * - V02-WI-03 already replaced the seam's single-mission identity with the
 *   mission registry: `SEAM_MISSION_ID` remains only as the identity of the
 *   mission the legacy Combat flow starts (`interception-01`) and the
 *   v0.1 enemy-group schedule it consumes until WI-04;
 * - no v0.2 result economy (pending combat rewards, paid full Repair) leaks
 *   into the seam — V02-WI-04/WI-05 own those rules. The v0.2 Success
 *   completion reward and progression unlock ARE applied through the canonical
 *   `applyMissionSuccess` transition (V02-WI-03).
 */
export const SEAM_MISSION_ID: MissionId = 'interception-01';

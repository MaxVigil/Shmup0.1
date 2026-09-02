/**
 * Deterministic stream derivation (Technical Foundation §8, TECH-DEC-011).
 *
 * Stream seeds are derived with 32-bit FNV-1a over the UTF-8 bytes of
 * `shmup-mvp:rng-v1|<session-seed>|<stream-name>|<ordinal>`. The session seed
 * is serialized as an unsigned 32-bit integer in base-10 decimal ASCII without
 * sign, prefix, separators, whitespace, or leading zeroes (Product Owner
 * decision, Technical Foundation §8).
 */
import { fnv1a32 } from './fnv1a';
import { Mulberry32 } from './mulberry32';

export const RNG_INPUT_VERSION = 'rng-v1';
export const PILOT_SELECTION_STREAM = 'pilot-selection';
export const COMBAT_MISSION_STREAM = 'combat-mission';
export const PILOT_SELECTION_ORDINAL = 0;
/** Mission-content data stream (V02-WI-03): resolves approved seeded entry
 *  variants (e.g. Hunter `upper-left`/`upper-right`) for the deterministic
 *  encounter-data contract (Epic §7.2, V02-AC-003–004). Derives from the
 *  already-derived mission seed with its own ordinal so a draw here never
 *  changes the authoritative Combat spawn stream sequence. */
export const MISSION_DATA_STREAM = 'mission-data';
export const MISSION_DATA_ORDINAL = 0;
/**
 * Per-Ranged `ranged-fire` stream (Epic §9.2, V02-AC-006): each Ranged Drone
 * owns an independent stream derived from the already-derived mission seed
 * with its stable zero-based mission-member ordinal, so one Ranged's lifetime,
 * firing, or destruction never shifts another Ranged's cadence. Stream name
 * versioned under the existing `rng-v1` input version; the ordinal is never
 * removal-sensitive or shared with the encounter-data or Combat streams.
 */
export const RANGED_FIRE_STREAM = 'ranged-fire';
export const RANGED_FIRE_ORDINAL_BASE = 0;

export function deriveStreamSeed(
  sessionSeed: number,
  streamName: string,
  ordinal: number,
): number {
  if (
    !Number.isInteger(sessionSeed) ||
    sessionSeed < 0 ||
    sessionSeed > 0xffffffff
  ) {
    throw new RangeError(
      `session seed must be an unsigned 32-bit integer: ${sessionSeed}`,
    );
  }
  if (streamName.length === 0) {
    throw new RangeError('stream name must not be empty');
  }
  if (!Number.isInteger(ordinal) || ordinal < 0) {
    throw new RangeError(
      `stream ordinal must be a non-negative integer: ${ordinal}`,
    );
  }
  const input = `shmup-mvp:${RNG_INPUT_VERSION}|${sessionSeed}|${streamName}|${ordinal}`;
  return fnv1a32(input);
}

export function createStream(
  sessionSeed: number,
  streamName: string,
  ordinal: number,
): Mulberry32 {
  return new Mulberry32(deriveStreamSeed(sessionSeed, streamName, ordinal));
}

export function createPilotSelectionStream(sessionSeed: number): Mulberry32 {
  return createStream(
    sessionSeed,
    PILOT_SELECTION_STREAM,
    PILOT_SELECTION_ORDINAL,
  );
}

export function createCombatMissionStream(
  sessionSeed: number,
  missionInstanceOrdinal: number,
): Mulberry32 {
  return createStream(
    sessionSeed,
    COMBAT_MISSION_STREAM,
    missionInstanceOrdinal,
  );
}

/** Deterministic mission-data stream for approved seeded entry variants
 *  (V02-WI-03): derives a dedicated stream from an already-derived mission seed
 *  so encounter-data draws are reproducible for identical explicit inputs and
 *  never read current Combat state (Epic §7.2, V02-AC-004). */
export function createMissionDataStream(missionSeed: number): Mulberry32 {
  return createStream(missionSeed, MISSION_DATA_STREAM, MISSION_DATA_ORDINAL);
}

/** Independent per-Ranged fire stream (Epic §9.2, V02-AC-006): derives from the
 *  already-derived mission seed with the Ranged's stable zero-based
 *  mission-member ordinal. The stream is created once per mission instance and
 *  consumed only by its owning Ranged in encounter/member order. */
export function createRangedFireStream(
  missionSeed: number,
  memberOrdinal: number,
): Mulberry32 {
  return createStream(missionSeed, RANGED_FIRE_STREAM, memberOrdinal);
}

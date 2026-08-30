import type { MissionId } from '@domain/index';
import type { MissionDefinition } from '../content';

/**
 * Mission progression read models (Epic §6, V02-AC-001–002; V02-WI-03 delta).
 * These are presentation-neutral application read models: they derive the
 * finite three-state mission point status from the single authoritative
 * persisted progression (`unlockedMissionIds`, `completedMissionIds`) and the
 * validated mission registry. React never infers launchability, completion, or
 * unlocks; it consumes these views and dispatches application commands.
 */

export type MissionPointState = 'locked' | 'available' | 'completed';

export interface MissionProgression {
  readonly unlockedMissionIds: readonly MissionId[];
  readonly completedMissionIds: readonly MissionId[];
}

/** One presentation view of an authored mission in Operations. */
export interface MissionPointView {
  readonly missionId: MissionId;
  readonly displayName: string;
  readonly state: MissionPointState;
  /** A mission point is launchable only when it is not locked (Epic §6.1). */
  readonly launchable: boolean;
}

/** Derives the finite state of one mission from the persisted progression. */
export function missionState(
  mission: Pick<MissionDefinition, 'id'>,
  progression: MissionProgression,
): MissionPointState {
  if (progression.completedMissionIds.includes(mission.id)) {
    return 'completed';
  }
  if (progression.unlockedMissionIds.includes(mission.id)) {
    return 'available';
  }
  return 'locked';
}

/** Builds the Operations read model for one authored mission. */
export function missionPointView(
  mission: MissionDefinition,
  progression: MissionProgression,
): MissionPointView {
  const state = missionState(mission, progression);
  return {
    missionId: mission.id,
    displayName: mission.displayName,
    state,
    launchable: state !== 'locked',
  };
}

/**
 * Builds the complete Operations mission-point read model in the authored
 * registry order (Interception 01 → 02 → 03, Epic §8.1–8.3).
 */
export function missionPointViews(
  missions: readonly MissionDefinition[],
  progression: MissionProgression,
): readonly MissionPointView[] {
  return missions.map((mission) => missionPointView(mission, progression));
}

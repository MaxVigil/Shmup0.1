import type { MissionType } from '@domain/model';

/**
 * Fixed enemy-group schedule for a mission (Combat §7.3): regular groups every
 * `intervalSeconds` starting at `startTimeSeconds` for `groupCount` groups of
 * `dronesPerGroup`, then one final group at `timeSeconds`.
 */
export interface EnemyGroupSchedule {
  readonly regular: {
    readonly startTimeSeconds: number;
    readonly intervalSeconds: number;
    readonly groupCount: number;
    readonly dronesPerGroup: number;
  };
  readonly final: {
    readonly timeSeconds: number;
    readonly dronesPerGroup: number;
  };
}

export interface MissionDefinition {
  readonly type: MissionType;
  readonly displayName: string;
  /** Reward in Credits granted on Success (validated at catalogue load). */
  readonly reward: number;
  readonly schedule: EnemyGroupSchedule;
}

export const INTERCEPTION: MissionDefinition = {
  type: 'interception',
  displayName: 'Interception',
  reward: 1,
  schedule: {
    regular: {
      startTimeSeconds: 0,
      intervalSeconds: 10,
      groupCount: 11,
      dronesPerGroup: 3,
    },
    final: {
      timeSeconds: 110,
      dronesPerGroup: 5,
    },
  },
};

export const MISSIONS: readonly MissionDefinition[] = [INTERCEPTION];

/** Total scheduled Basic Drones for a schedule (regular + final groups). */
export function totalDrones(schedule: EnemyGroupSchedule): number {
  return (
    schedule.regular.groupCount * schedule.regular.dronesPerGroup +
    schedule.final.dronesPerGroup
  );
}

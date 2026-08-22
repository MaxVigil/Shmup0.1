import type { EnemyGroupSchedule } from '@application/content';
import type { EnemyType } from '@domain/index';
import { Mulberry32 } from '@domain/random';
import {
  selectEnemyEntryRegion,
  spawnAxisFraction,
  spawnEnemy,
  waypointXFraction,
  waypointYFraction,
  type CombatEnemy,
  type EnemyEntryRegion,
} from './enemies';

/**
 * Mission-owned enemy spawn plan (Combat §7.3, S10). Exactly one Mulberry32
 * sequence seeded by the already-derived Mission Snapshot `combatMissionSeed`
 * is consumed once at Combat initialization. Per drone the documented fixed
 * draw order is: (1) entry region (`nextInt(3)`), (2) spawn-axis fraction
 * (`nextFloat()`), (3) side waypoint-x fraction, (4) side waypoint-y fraction.
 * The plan stores viewport-independent fractions so spawns after an effective
 * resize resolve against the current viewport without re-rolling.
 */

export interface PlannedEnemy {
  readonly entry: EnemyEntryRegion;
  /** Uniform fraction in [0,1) along the approved spawn axis (top x / side y). */
  readonly spawnAxisFraction: number;
  /** Approved `40%-60%` × `20%-40%` waypoint fractions (top entries: null). */
  readonly waypointXFraction: number | null;
  readonly waypointYFraction: number | null;
}

export interface PlannedEnemyGroup {
  readonly timeSeconds: number;
  /** Exact fixed-step spawn index (`round(timeSeconds / stepSeconds)`), so
   *  scheduling compares integers and never drifts at boundaries. */
  readonly stepIndex: number;
  readonly final: boolean;
  readonly drones: readonly PlannedEnemy[];
}

/** Regular groups at `start, start+interval, …` then one final group. */
export function planEnemyGroups(
  schedule: EnemyGroupSchedule,
  rng: Mulberry32,
  stepSeconds: number,
): readonly PlannedEnemyGroup[] {
  const groups: PlannedEnemyGroup[] = [];
  const { regular, final } = schedule;
  for (let index = 0; index < regular.groupCount; index += 1) {
    const timeSeconds =
      regular.startTimeSeconds + index * regular.intervalSeconds;
    groups.push(
      planEnemyGroup(
        timeSeconds,
        false,
        regular.dronesPerGroup,
        stepSeconds,
        rng,
      ),
    );
  }
  groups.push(
    planEnemyGroup(
      final.timeSeconds,
      true,
      final.dronesPerGroup,
      stepSeconds,
      rng,
    ),
  );
  return groups;
}

function planEnemyGroup(
  timeSeconds: number,
  final: boolean,
  count: number,
  stepSeconds: number,
  rng: Mulberry32,
): PlannedEnemyGroup {
  const drones: PlannedEnemy[] = [];
  for (let index = 0; index < count; index += 1) {
    drones.push(planEnemy(rng));
  }
  return {
    timeSeconds,
    stepIndex: Math.round(timeSeconds / stepSeconds),
    final,
    drones,
  };
}

function planEnemy(rng: Mulberry32): PlannedEnemy {
  const entry = selectEnemyEntryRegion(rng);
  const spawnAxis = spawnAxisFraction(rng);
  if (entry === 'top') {
    return {
      entry,
      spawnAxisFraction: spawnAxis,
      waypointXFraction: null,
      waypointYFraction: null,
    };
  }
  return {
    entry,
    spawnAxisFraction: spawnAxis,
    waypointXFraction: waypointXFraction(rng),
    waypointYFraction: waypointYFraction(rng),
  };
}

/**
 * Materializes one planned group against the current viewport: every drone is
 * created at the same mission-time instant with its entry data resolved
 * deterministically (AC-074). Overlap is allowed and never re-rolled.
 */
export function spawnGroupDrones(
  group: PlannedEnemyGroup,
  startId: number,
  type: EnemyType,
  hullIntegrity: number,
  viewportWidth: number,
  viewportHeight: number,
  enemySize: number,
): readonly CombatEnemy[] {
  return group.drones.map((planned, index) =>
    spawnEnemy(
      startId + index,
      type,
      hullIntegrity,
      planned.entry,
      planned.spawnAxisFraction,
      planned.waypointXFraction,
      planned.waypointYFraction,
      viewportWidth,
      viewportHeight,
      enemySize,
    ),
  );
}

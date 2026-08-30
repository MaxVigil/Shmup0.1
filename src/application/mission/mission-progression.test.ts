import { describe, expect, it } from 'vitest';
import { MISSIONS } from '@content/index';
import {
  missionPointView,
  missionPointViews,
  missionState,
} from './mission-progression';
import type { MissionProgression } from './mission-progression';

/** A New Game progression: only Interception 01 unlocked (Epic §6.1). */
const NEW_GAME: MissionProgression = {
  unlockedMissionIds: ['interception-01'],
  completedMissionIds: [],
};

/** After first Success on Interception 01 (Epic §6.2, V02-AC-002). */
const AFTER_MISSION_01: MissionProgression = {
  unlockedMissionIds: ['interception-01', 'interception-02'],
  completedMissionIds: ['interception-01'],
};

describe('mission progression read models (Epic §6, V02-AC-001–002)', () => {
  it('a New Game shows Interception 01 available and 02/03 locked (V02-AC-001)', () => {
    const views = missionPointViews(MISSIONS, NEW_GAME);
    expect(views.map((view) => view.missionId)).toEqual([
      'interception-01',
      'interception-02',
      'interception-03',
    ]);
    expect(views.map((view) => view.state)).toEqual([
      'available',
      'locked',
      'locked',
    ]);
    expect(views.map((view) => view.launchable)).toEqual([true, false, false]);
  });

  it('first Success completes Interception 01 and unlocks only Interception 02 (V02-AC-002)', () => {
    const views = missionPointViews(MISSIONS, AFTER_MISSION_01);
    expect(views.map((view) => view.state)).toEqual([
      'completed',
      'available',
      'locked',
    ]);
    expect(views.map((view) => view.launchable)).toEqual([true, true, false]);
  });

  it('completed missions remain launchable for replay', () => {
    expect(missionState(MISSIONS[0]!, AFTER_MISSION_01)).toBe('completed');
    const view = missionPointView(MISSIONS[0]!, AFTER_MISSION_01);
    expect(view.state).toBe('completed');
    expect(view.launchable).toBe(true);
  });

  it('a fully completed run keeps all missions launchable and unlocks nothing further', () => {
    const allDone: MissionProgression = {
      unlockedMissionIds: [
        'interception-01',
        'interception-02',
        'interception-03',
      ],
      completedMissionIds: [
        'interception-01',
        'interception-02',
        'interception-03',
      ],
    };
    const views = missionPointViews(MISSIONS, allDone);
    expect(views.map((view) => view.state)).toEqual([
      'completed',
      'completed',
      'completed',
    ]);
    expect(views.every((view) => view.launchable)).toBe(true);
  });

  it('Exact-object identity: the views derive purely from the authored registry and persisted progression', () => {
    const a = missionPointViews(MISSIONS, NEW_GAME);
    const b = missionPointViews(MISSIONS, NEW_GAME);
    expect(b).toEqual(a);
  });
});

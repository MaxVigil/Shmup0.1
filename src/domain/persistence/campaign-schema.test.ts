import { describe, expect, it } from 'vitest';
import { aircraftId, pilotId } from '@domain/index';
import { CAMPAIGN_SCHEMA_VERSION, migrateCampaignRecord } from '@domain/index';
import { migrateLegacyC03Campaign } from '@domain/index';
import type { CampaignSchemaContext, CampaignStateV1 } from '@domain/index';

const CONTEXT: CampaignSchemaContext = {
  validAircraftIds: new Set(['german-fighter']),
  validPilotIds: new Set([
    'pilot-kovalenko',
    'pilot-petrenko',
    'pilot-bondar',
    'pilot-shevchenko',
    'pilot-melnyk',
    'pilot-tkachenko',
  ]),
};

function validRecord(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: CAMPAIGN_SCHEMA_VERSION,
    runStatus: 'active',
    credits: 12,
    aircraftId: 'german-fighter',
    hullIntegrity: 100,
    equippedWeapon: 'machine-gun',
    unlockedMissionIds: ['interception-01'],
    completedMissionIds: [],
    missionInProgress: null,
    pilotId: 'pilot-shevchenko',
    ...overrides,
  };
}

function loadedCampaign(record: Record<string, unknown>): CampaignStateV1 {
  const result = migrateCampaignRecord(record, CONTEXT);
  if (result.kind !== 'loaded') {
    throw new Error(
      `Expected a loaded campaign, got: ${JSON.stringify(result)}`,
    );
  }
  return result.campaign;
}

function diagnosticsFor(
  record: Record<string, unknown>,
): readonly { path: string; message: string }[] {
  const result = migrateCampaignRecord(record, CONTEXT);
  if (result.kind !== 'invalid') {
    throw new Error('Expected an invalid campaign record.');
  }
  return result.diagnostics;
}

describe('migrateCampaignRecord (Epic §14.2, V02-AC-021)', () => {
  it('loads a valid version-1 campaign record and preserves every value', () => {
    const campaign = loadedCampaign(validRecord());
    expect(campaign).toEqual({
      schemaVersion: 1,
      runStatus: 'active',
      credits: 12,
      aircraftId: aircraftId('german-fighter'),
      hullIntegrity: 100,
      equippedWeapon: 'machine-gun',
      unlockedMissionIds: ['interception-01'],
      completedMissionIds: [],
      missionInProgress: null,
      pilotId: pilotId('pilot-shevchenko'),
    });
  });

  it('loads a persisted active-mission marker and game-over run status', () => {
    const active = loadedCampaign(
      validRecord({
        runStatus: 'active',
        missionInProgress: { missionId: 'interception-01', attemptId: 0 },
      }),
    );
    expect(active.missionInProgress).toEqual({
      missionId: 'interception-01',
      attemptId: 0,
    });
    const gameOver = loadedCampaign(
      validRecord({ runStatus: 'game-over', missionInProgress: null }),
    );
    expect(gameOver.runStatus).toBe('game-over');
  });

  it('rejects a persisted missionInProgress that is not a marker object', () => {
    for (const bad of [
      'interception-01',
      5,
      { missionId: 'interception-01' },
    ]) {
      const diagnostics = diagnosticsFor(
        validRecord({ missionInProgress: bad }),
      );
      expect(
        diagnostics.some((d) => d.path.startsWith('missionInProgress')),
      ).toBe(true);
    }
  });

  it('rejects a marker with an invalid per-attempt identity', () => {
    for (const attemptId of [-1, 1.5, '0', NaN, Number.MAX_SAFE_INTEGER + 1]) {
      const diagnostics = diagnosticsFor(
        validRecord({
          missionInProgress: { missionId: 'interception-01', attemptId },
        }),
      );
      expect(
        diagnostics.some((d) => d.path === 'missionInProgress.attemptId'),
      ).toBe(true);
    }
  });

  it('rejects a non-object record with a root diagnostic', () => {
    for (const value of [null, 'campaign', [1, 2], 42]) {
      const result = migrateCampaignRecord(value, CONTEXT);
      expect(result.kind).toBe('invalid');
    }
  });

  it('treats an unknown or unsupported schema version as a non-overwriting error', () => {
    for (const version of [0, 2, 99, 'one']) {
      const diagnostics = diagnosticsFor(
        validRecord({ schemaVersion: version }),
      );
      expect(diagnostics[0]?.path).toBe('schemaVersion');
      expect(diagnostics[0]?.message).toContain(
        'unsupported campaign schema version',
      );
    }
    // The migration boundary never returns a fabricated legacy campaign.
    const diagnostics = diagnosticsFor(validRecord({ schemaVersion: 0 }));
    expect(diagnostics).toHaveLength(1);
  });

  it('records path-qualified diagnostics for every invalid field', () => {
    const diagnostics = diagnosticsFor(
      validRecord({
        runStatus: 'paused',
        credits: -1,
        aircraftId: 'not-an-aircraft',
        hullIntegrity: 101,
        equippedWeapon: 'laser',
        pilotId: 'pilot-missing',
      }),
    );
    const paths = diagnostics.map((item) => item.path).sort();
    expect(paths).toEqual([
      'aircraftId',
      'credits',
      'equippedWeapon',
      'hullIntegrity',
      'pilotId',
      'runStatus',
    ]);
  });

  it('records indexed diagnostics for invalid mission id arrays', () => {
    const diagnostics = diagnosticsFor(
      validRecord({
        unlockedMissionIds: [
          'interception-01',
          'not-a-mission',
          'interception-02',
        ],
        completedMissionIds: ['interception-99'],
      }),
    );
    expect(diagnostics).toContainEqual({
      path: 'unlockedMissionIds.1',
      message: 'entry is not an approved mission id',
    });
    expect(diagnostics).toContainEqual({
      path: 'completedMissionIds.0',
      message: 'entry is not an approved mission id',
    });
  });

  it('rejects duplicate mission ids', () => {
    const diagnostics = diagnosticsFor(
      validRecord({
        unlockedMissionIds: ['interception-01', 'interception-01'],
      }),
    );
    expect(diagnostics).toContainEqual({
      path: 'unlockedMissionIds.1',
      message: 'duplicate mission id',
    });
  });

  it('rejects a completed mission that is not unlocked', () => {
    const diagnostics = diagnosticsFor(
      validRecord({ completedMissionIds: ['interception-02'] }),
    );
    expect(diagnostics).toContainEqual({
      path: 'completedMissionIds',
      message: 'a completed mission is not present in unlockedMissionIds',
    });
  });

  it('rejects a mission in progress that is not unlocked', () => {
    const diagnostics = diagnosticsFor(
      validRecord({
        missionInProgress: { missionId: 'interception-02', attemptId: 0 },
      }),
    );
    expect(diagnostics).toContainEqual({
      path: 'missionInProgress',
      message: 'a mission in progress is not present in unlockedMissionIds',
    });
  });

  it('rejects a game-over run that still carries a mission in progress', () => {
    const diagnostics = diagnosticsFor(
      validRecord({
        runStatus: 'game-over',
        missionInProgress: { missionId: 'interception-01', attemptId: 0 },
      }),
    );
    expect(diagnostics).toContainEqual({
      path: 'missionInProgress',
      message: 'runStatus "game-over" cannot contain a mission in progress',
    });
  });
});

function legacyC03Record(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: CAMPAIGN_SCHEMA_VERSION,
    runStatus: 'active',
    credits: 12,
    aircraftId: 'german-fighter',
    hullIntegrity: 100,
    equippedWeapon: 'machine-gun',
    unlockedMissionIds: ['interception-01'],
    completedMissionIds: [],
    missionInProgress: null,
    pilotId: 'pilot-shevchenko',
    nextMissionAttemptId: 4,
    ...overrides,
  };
}

describe('migrateLegacyC03Campaign (V02-WI-02 correction C06)', () => {
  it('migrates a fully valid C03 record to the counter-free campaign with the legacy high-water mark', () => {
    const result = migrateLegacyC03Campaign(
      legacyC03Record({
        missionInProgress: { missionId: 'interception-01', attemptId: 2 },
      }),
      CONTEXT,
    );
    expect(result.kind).toBe('valid');
    if (result.kind !== 'valid') {
      return;
    }
    expect(result.campaign).toEqual({
      schemaVersion: 1,
      runStatus: 'active',
      credits: 12,
      aircraftId: aircraftId('german-fighter'),
      hullIntegrity: 100,
      equippedWeapon: 'machine-gun',
      unlockedMissionIds: ['interception-01'],
      completedMissionIds: [],
      missionInProgress: { missionId: 'interception-01', attemptId: 2 },
      pilotId: pilotId('pilot-shevchenko'),
    });
    expect(result.campaign).not.toHaveProperty('nextMissionAttemptId');
    // C03 semantics: the counter is the next candidate, so the highest issued
    // id is `nextMissionAttemptId - 1`; the marker id 2 is covered.
    expect(result.highWaterMark).toBe(3);
  });

  it('derives the high-water mark from the marker when it is above the counter-minus-one', () => {
    const result = migrateLegacyC03Campaign(
      legacyC03Record({
        nextMissionAttemptId: 3,
        missionInProgress: { missionId: 'interception-01', attemptId: 2 },
      }),
      CONTEXT,
    );
    expect(result.kind).toBe('valid');
    if (result.kind === 'valid') {
      expect(result.highWaterMark).toBe(2);
    }
  });

  it('rejects the C03-forbidden equality marker.attemptId == nextMissionAttemptId', () => {
    const result = migrateLegacyC03Campaign(
      legacyC03Record({
        nextMissionAttemptId: 2,
        missionInProgress: { missionId: 'interception-01', attemptId: 2 },
      }),
      CONTEXT,
    );
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.diagnostics).toContainEqual({
        path: 'missionInProgress',
        message:
          'the mission attempt id is not strictly below the next mission attempt id',
      });
    }
  });

  it('rejects a marker attempt id above the next mission attempt id', () => {
    const result = migrateLegacyC03Campaign(
      legacyC03Record({
        nextMissionAttemptId: 2,
        missionInProgress: { missionId: 'interception-01', attemptId: 3 },
      }),
      CONTEXT,
    );
    expect(result.kind).toBe('invalid');
  });

  it('rejects a legacy C03 record with an invalid unrelated campaign field', () => {
    const result = migrateLegacyC03Campaign(
      legacyC03Record({ credits: -5 }),
      CONTEXT,
    );
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.diagnostics).toContainEqual({
        path: 'credits',
        message: 'credits must be a non-negative integer',
      });
    }
  });

  it('rejects a legacy C03 record with an unsafe counter value', () => {
    const result = migrateLegacyC03Campaign(
      legacyC03Record({ nextMissionAttemptId: Number.MAX_SAFE_INTEGER + 1 }),
      CONTEXT,
    );
    expect(result.kind).toBe('invalid');
  });

  it('rejects a legacy C03 record with a missing counter field', () => {
    const { nextMissionAttemptId: _omitted, ...withoutCounter } =
      legacyC03Record();
    void _omitted;
    const result = migrateLegacyC03Campaign(withoutCounter, CONTEXT);
    expect(result.kind).toBe('invalid');
  });

  it('rejects a game-over legacy C03 record that still carries a marker', () => {
    const result = migrateLegacyC03Campaign(
      legacyC03Record({
        runStatus: 'game-over',
        missionInProgress: { missionId: 'interception-01', attemptId: 0 },
      }),
      CONTEXT,
    );
    expect(result.kind).toBe('invalid');
  });

  it('rejects a legacy C03 record whose marker mission is not unlocked', () => {
    const result = migrateLegacyC03Campaign(
      legacyC03Record({
        missionInProgress: { missionId: 'not-a-mission', attemptId: 0 },
      }),
      CONTEXT,
    );
    expect(result.kind).toBe('invalid');
  });

  it('rejects a legacy C03 record with an unknown aircraft', () => {
    const result = migrateLegacyC03Campaign(
      legacyC03Record({ aircraftId: 'not-an-aircraft' }),
      CONTEXT,
    );
    expect(result.kind).toBe('invalid');
  });

  it('does not seed a high-water mark when the counter is zero and no marker exists', () => {
    const result = migrateLegacyC03Campaign(
      legacyC03Record({ nextMissionAttemptId: 0 }),
      CONTEXT,
    );
    expect(result.kind).toBe('valid');
    if (result.kind === 'valid') {
      expect(result.highWaterMark).toBe(-1);
    }
  });
});

describe('obsolete legacy counter presence (V02-WI-02 correction C06)', () => {
  it('rejects a current-schema record that still carries nextMissionAttemptId', () => {
    const diagnostics = diagnosticsFor(
      validRecord({ nextMissionAttemptId: 4 }),
    );
    expect(diagnostics).toContainEqual({
      path: 'nextMissionAttemptId',
      message:
        'obsolete legacy counter must be removed by the campaign migration',
    });
  });
});

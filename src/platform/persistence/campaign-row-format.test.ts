import { describe, expect, it } from 'vitest';
import type { CampaignSchemaContext } from '@domain/index';
import {
  CURRENT_ROW_FORMAT_VERSION,
  hasRowFormatProperty,
  isCurrentFormatRow,
  unreadableRowDiagnostics,
} from './campaign-row-format';

describe('campaign row-format provenance (V02-WI-02 correction C07)', () => {
  it('accepts a row carrying the exact current-format marker', () => {
    const row = {
      id: 'current' as const,
      rowFormatVersion: CURRENT_ROW_FORMAT_VERSION,
      value: { schemaVersion: 1 },
    };
    expect(isCurrentFormatRow(row)).toBe(true);
  });

  it('rejects a legacy/untouched row without any marker', () => {
    expect(
      isCurrentFormatRow({ id: 'current', value: { schemaVersion: 1 } }),
    ).toBe(false);
  });

  it('rejects a row with a different format version', () => {
    expect(
      isCurrentFormatRow({
        id: 'current',
        rowFormatVersion: CURRENT_ROW_FORMAT_VERSION + 1,
        value: { schemaVersion: 1 },
      }),
    ).toBe(false);
  });

  it('rejects non-object rows and null', () => {
    expect(isCurrentFormatRow(null)).toBe(false);
    expect(isCurrentFormatRow(undefined)).toBe(false);
    expect(isCurrentFormatRow('campaign')).toBe(false);
  });
});

const CONTEXT: CampaignSchemaContext = {
  validAircraftIds: new Set(['german-fighter']),
  validPilotIds: new Set(['pilot-shevchenko']),
};

/** The immediate pre-C04/C03 persisted campaign shape (counter present). */
function legacyC03Value(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    runStatus: 'active',
    credits: 12,
    aircraftId: 'german-fighter',
    hullIntegrity: 100,
    equippedWeapon: 'machine-gun',
    unlockedMissionIds: ['interception-01'],
    completedMissionIds: [],
    missionInProgress: null,
    pilotId: 'pilot-shevchenko',
    nextMissionAttemptId: 5,
    ...overrides,
  };
}

/** The truthful row-envelope rejection (stable wording). */
const ROW_FORMAT_REJECTION = [
  {
    path: 'rowFormatVersion',
    message: 'stored campaign row is not in the current format',
  },
];

function unmarkedRow(value: unknown): Record<string, unknown> {
  return { id: 'current', value };
}

describe('unreadable-row diagnostics (V02-WI-07 D02-B, V02-DEC-034)', () => {
  it('reports the ORIGINAL legacy field cause for a recognizably rejected C03 row (invalid Credits)', () => {
    const diagnostics = unreadableRowDiagnostics(
      unmarkedRow(legacyC03Value({ credits: -5 })),
      CONTEXT,
    );
    expect(diagnostics).toEqual([
      { path: 'credits', message: 'credits must be a non-negative integer' },
    ]);
    // Path/message only: no stored record value is included.
    expect(JSON.stringify(diagnostics)).not.toContain('-5');
    expect(JSON.stringify(diagnostics)).not.toContain('pilot-shevchenko');
  });

  it('reports the marker/counter ordering cause at missionInProgress for a recognizably rejected C03 row', () => {
    const diagnostics = unreadableRowDiagnostics(
      unmarkedRow(
        legacyC03Value({
          missionInProgress: { missionId: 'interception-01', attemptId: 2 },
          nextMissionAttemptId: 2,
        }),
      ),
      CONTEXT,
    );
    expect(diagnostics).toEqual([
      {
        path: 'missionInProgress',
        message:
          'the mission attempt id is not strictly below the next mission attempt id',
      },
    ]);
  });

  it('recognizes legacy provenance even when the obsolete counter value itself is invalid', () => {
    const diagnostics = unreadableRowDiagnostics(
      unmarkedRow(legacyC03Value({ nextMissionAttemptId: -1 })),
      CONTEXT,
    );
    expect(diagnostics).toContainEqual({
      path: 'nextMissionAttemptId',
      message: 'must be a safe non-negative integer',
    });
  });

  it('reports the truthful current-row rejection for an unmarked row without established legacy provenance', () => {
    const { nextMissionAttemptId: _omitted, ...withoutCounter } =
      legacyC03Value();
    void _omitted;
    expect(
      unreadableRowDiagnostics(unmarkedRow(withoutCounter), CONTEXT),
    ).toEqual(ROW_FORMAT_REJECTION);
    // Another schema version carries a counter but is not the C03 shape.
    expect(
      unreadableRowDiagnostics(
        unmarkedRow(legacyC03Value({ schemaVersion: 2 })),
        CONTEXT,
      ),
    ).toEqual(ROW_FORMAT_REJECTION);
  });

  it('never fabricates a migration cause for a recognizable row that would still migrate', () => {
    expect(
      unreadableRowDiagnostics(unmarkedRow(legacyC03Value()), CONTEXT),
    ).toEqual(ROW_FORMAT_REJECTION);
  });

  it('reports the current-row rejection for a row without a record value, a non-object value, or an array value', () => {
    expect(unreadableRowDiagnostics({ id: 'current' }, CONTEXT)).toEqual(
      ROW_FORMAT_REJECTION,
    );
    expect(unreadableRowDiagnostics(unmarkedRow('campaign'), CONTEXT)).toEqual(
      ROW_FORMAT_REJECTION,
    );
    expect(
      unreadableRowDiagnostics(unmarkedRow([legacyC03Value()]), CONTEXT),
    ).toEqual(ROW_FORMAT_REJECTION);
    expect(unreadableRowDiagnostics(null, CONTEXT)).toEqual(
      ROW_FORMAT_REJECTION,
    );
  });
});

/** A row envelope carrying an EXPLICIT non-current `rowFormatVersion`. */
function explicitMarkerRow(
  marker: unknown,
  value: unknown,
): Record<string, unknown> {
  return { id: 'current', rowFormatVersion: marker, value };
}

describe('row-format property presence (shared upgrade/read provenance rule, V02-DEC-035)', () => {
  it('is true for ANY present marker property, including null and a present undefined', () => {
    expect(hasRowFormatProperty({ id: 'current', rowFormatVersion: 2 })).toBe(
      true,
    );
    expect(hasRowFormatProperty({ id: 'current', rowFormatVersion: 1 })).toBe(
      true,
    );
    expect(hasRowFormatProperty({ id: 'current', rowFormatVersion: 3 })).toBe(
      true,
    );
    expect(
      hasRowFormatProperty({ id: 'current', rowFormatVersion: null }),
    ).toBe(true);
    expect(
      hasRowFormatProperty({ id: 'current', rowFormatVersion: undefined }),
    ).toBe(true);
  });

  it('is false only when the property is completely absent (the version-1 shape)', () => {
    expect(
      hasRowFormatProperty({ id: 'current', value: legacyC03Value() }),
    ).toBe(false);
  });

  it('is false for a non-record row', () => {
    expect(hasRowFormatProperty(null)).toBe(false);
    expect(hasRowFormatProperty(undefined)).toBe(false);
    expect(hasRowFormatProperty('current')).toBe(false);
    expect(hasRowFormatProperty([legacyC03Value()])).toBe(false);
  });
});

describe('explicit wrong row-format marker (V02-WI-07 D02-B-C01 F1)', () => {
  // 1, 3, null, and a PRESENT `undefined` are all explicit non-current claims
  // by the envelope. Untrusted value data inside them cannot establish
  // pre-migration provenance, so none may manufacture a legacy cause.
  const wrongMarkers: readonly unknown[] = [1, 3, null, undefined];

  for (const marker of wrongMarkers) {
    it(`reports the row-format rejection for the explicit wrong marker ${String(
      marker,
    )} over a rejected C03-like value (invalid Credits)`, () => {
      expect(
        unreadableRowDiagnostics(
          explicitMarkerRow(marker, legacyC03Value({ credits: -5 })),
          CONTEXT,
        ),
      ).toEqual(ROW_FORMAT_REJECTION);
    });

    it(`reports the row-format rejection for the explicit wrong marker ${String(
      marker,
    )} over a rejected C03-like value (marker/counter ordering)`, () => {
      expect(
        unreadableRowDiagnostics(
          explicitMarkerRow(
            marker,
            legacyC03Value({
              missionInProgress: {
                missionId: 'interception-01',
                attemptId: 2,
              },
              nextMissionAttemptId: 2,
            }),
          ),
          CONTEXT,
        ),
      ).toEqual(ROW_FORMAT_REJECTION);
    });
  }

  it('keeps the pre-migration cause only when the marker property is completely absent', () => {
    // Same value, no marker property at all: the untouched version-1 shape is
    // the only provenance signal that may cite the original migration cause.
    // Every explicit marker shape above returns the envelope rejection instead.
    expect(
      unreadableRowDiagnostics(
        unmarkedRow(legacyC03Value({ credits: -5 })),
        CONTEXT,
      ),
    ).toEqual([
      { path: 'credits', message: 'credits must be a non-negative integer' },
    ]);
  });

  it('reports the row-format rejection for an explicit wrong marker even when the C03-like value would migrate', () => {
    expect(
      unreadableRowDiagnostics(explicitMarkerRow(1, legacyC03Value()), CONTEXT),
    ).toEqual(ROW_FORMAT_REJECTION);
  });
});

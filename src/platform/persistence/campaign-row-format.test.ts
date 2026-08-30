import { describe, expect, it } from 'vitest';
import {
  CURRENT_ROW_FORMAT_VERSION,
  isCurrentFormatRow,
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

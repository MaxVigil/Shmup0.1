import { describe, expect, it } from 'vitest';
import {
  DEFAULT_USER_SETTINGS,
  parseUserSettingsRecord,
} from './user-settings';

describe('parseUserSettingsRecord (Epic §14.1, V02-AC-017)', () => {
  it('loads a valid persisted Settings record', () => {
    expect(parseUserSettingsRecord({ mouseMovementEnabled: false })).toEqual({
      kind: 'loaded',
      settings: { mouseMovementEnabled: false },
    });
    expect(parseUserSettingsRecord({ mouseMovementEnabled: true })).toEqual({
      kind: 'loaded',
      settings: { mouseMovementEnabled: true },
    });
  });

  it('rejects a non-object record with a root diagnostic', () => {
    for (const value of [null, 'settings', [true], 1, undefined]) {
      expect(parseUserSettingsRecord(value).kind).toBe('invalid');
    }
  });

  it('rejects a non-boolean setting with a path-qualified diagnostic', () => {
    const result = parseUserSettingsRecord({ mouseMovementEnabled: 'yes' });
    expect(result).toEqual({
      kind: 'invalid',
      diagnostics: [
        {
          path: 'mouseMovementEnabled',
          message: 'mouseMovementEnabled must be a boolean',
        },
      ],
    });
  });

  it('defines the approved default with Mouse Movement Enabled true', () => {
    expect(DEFAULT_USER_SETTINGS.mouseMovementEnabled).toBe(true);
  });
});

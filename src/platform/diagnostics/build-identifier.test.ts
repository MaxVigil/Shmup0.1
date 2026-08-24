import { describe, expect, it } from 'vitest';

import { formatBuildIdentifier } from './build-identifier';

describe('formatBuildIdentifier (S14-WI01 build traceability)', () => {
  it('formats a clean committed revision without a dirty marker', () => {
    expect(
      formatBuildIdentifier({
        version: '0.1.0',
        revision: '1df1a1a',
        dirty: false,
      }),
    ).toBe('shmup@0.1.0 (1df1a1a)');
  });

  it('marks an uncommitted candidate so it cannot masquerade as a clean revision', () => {
    expect(
      formatBuildIdentifier({
        version: '0.1.0',
        revision: '1df1a1a',
        dirty: true,
      }),
    ).toBe('shmup@0.1.0 (1df1a1a-dirty)');
  });

  it('falls back to unknown when git cannot resolve a revision', () => {
    expect(
      formatBuildIdentifier({
        version: '0.1.0',
        revision: 'unknown',
        dirty: true,
      }),
    ).toBe('shmup@0.1.0 (unknown)');
    expect(
      formatBuildIdentifier({
        version: '0.1.0',
        revision: '',
        dirty: false,
      }),
    ).toBe('shmup@0.1.0 (unknown)');
  });
});

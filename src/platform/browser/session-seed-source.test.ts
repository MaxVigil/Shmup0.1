import { describe, expect, it } from 'vitest';
import { createBrowserSessionSeedSource } from './session-seed-source';

describe('createBrowserSessionSeedSource', () => {
  it('returns an unsigned 32-bit session seed', () => {
    const source = createBrowserSessionSeedSource();
    const seed = source.getSessionSeed();
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xffffffff);
  });
});

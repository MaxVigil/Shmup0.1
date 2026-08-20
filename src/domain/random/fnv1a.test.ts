import { describe, expect, it } from 'vitest';
import { fnv1a32 } from './fnv1a';

describe('fnv1a32', () => {
  it('returns the FNV-1a offset basis for the empty input', () => {
    expect(fnv1a32('')).toBe(2166136261); // 0x811c9dc5
  });

  it('matches the standard FNV-1a reference vector for "foobar"', () => {
    expect(fnv1a32('foobar')).toBe(3214735720); // 0xbf9cf968
  });

  it('hashes the approved versioned RNG inputs to fixed vectors', () => {
    expect(fnv1a32('shmup-mvp:rng-v1|3735928559|pilot-selection|0')).toBe(
      482040656,
    );
    expect(fnv1a32('shmup-mvp:rng-v1|3735928559|combat-mission|0')).toBe(
      374316068,
    );
    expect(fnv1a32('shmup-mvp:rng-v1|3735928559|combat-mission|1')).toBe(
      391093687,
    );
  });

  it('encodes multibyte UTF-8 input deterministically', () => {
    expect(fnv1a32('€')).toBe(697271083); // U+20AC encoded as 3 UTF-8 bytes
    expect(fnv1a32('€')).toBe(fnv1a32('€'));
  });

  it('is deterministic for the same input', () => {
    const input = 'shmup-mvp:rng-v1|1|combat-mission|0';
    expect(fnv1a32(input)).toBe(fnv1a32(input));
  });
});

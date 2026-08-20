import { describe, expect, it } from 'vitest';
import { Mulberry32 } from './mulberry32';

describe('Mulberry32', () => {
  it('produces the approved fixed nextUint32 vectors', () => {
    expect(sequence(0, 3)).toEqual([1144304738, 1416247, 958946056]);
    expect(sequence(1, 3)).toEqual([2693262067, 11749833, 2265367787]);
    expect(sequence(123456789, 3)).toEqual([
      1107202814, 4169434471, 3372958138,
    ]);
    expect(sequence(2166136261, 3)).toEqual([
      2625274932, 2119670693, 3324411561,
    ]);
  });

  it('produces the approved fixed nextFloat vectors in [0, 1)', () => {
    const stream = new Mulberry32(0);
    expect(stream.nextFloat()).toBeCloseTo(0.26642920868471265, 12);
    expect(stream.nextFloat()).toBeCloseTo(0.0003297457005828619, 12);
    expect(stream.nextFloat()).toBeCloseTo(0.2232720274478197, 12);
  });

  it('keeps every nextFloat value in [0, 1)', () => {
    const stream = new Mulberry32(0);
    for (let i = 0; i < 1000; i += 1) {
      const value = stream.nextFloat();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('nextInt(1) is always 0', () => {
    for (const seed of [0, 1, 123456789]) {
      const stream = new Mulberry32(seed);
      expect(stream.nextInt(1)).toBe(0);
    }
  });

  it('nextInt returns values in [0, maxExclusive)', () => {
    const stream = new Mulberry32(123456789);
    for (let i = 0; i < 1000; i += 1) {
      const value = stream.nextInt(6);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(6);
    }
  });

  it('nextInt equals nextUint32 modulo maxExclusive when no rejection occurs', () => {
    for (const seed of [0, 1, 123456789]) {
      const intStream = new Mulberry32(seed);
      const uintStream = new Mulberry32(seed);
      for (let i = 0; i < 10; i += 1) {
        expect(intStream.nextInt(6)).toBe(uintStream.nextUint32() % 6);
      }
    }
  });

  it('supports maxExclusive up to 2^32 - 1', () => {
    const stream = new Mulberry32(0);
    expect(stream.nextInt(0xffffffff)).toBe(1144304738);
    expect(stream.nextInt(0xffffffff)).toBe(1416247);
  });

  it('rejects invalid maxExclusive values', () => {
    for (const invalid of [0, -1, 1.5, 4294967296, Number.NaN]) {
      expect(() => new Mulberry32(0).nextInt(invalid)).toThrow(RangeError);
    }
  });

  it('is deterministic for the same seed', () => {
    expect(sequence(42, 5)).toEqual(sequence(42, 5));
  });
});

function sequence(seed: number, count: number): number[] {
  const stream = new Mulberry32(seed);
  const values: number[] = [];
  for (let i = 0; i < count; i += 1) {
    values.push(stream.nextUint32());
  }
  return values;
}

import { describe, expect, it } from 'vitest';
import {
  CORNER_TOUCH_A,
  CORNER_TOUCH_B,
  EDGE_TOUCH_RIGHT_A,
  EDGE_TOUCH_RIGHT_B,
  OVERLAP_A,
  OVERLAP_B,
  SEPARATED_A,
  SEPARATED_B,
} from '@test-support/domain/geometry';
import { createAabb, isSeparated, overlaps } from './aabb';

describe('Aabb overlap', () => {
  it('reports overlapping boxes as overlapping', () => {
    expect(overlaps(OVERLAP_A, OVERLAP_B)).toBe(true);
  });

  it('reports separated boxes as non-overlapping', () => {
    expect(overlaps(SEPARATED_A, SEPARATED_B)).toBe(false);
  });

  it('treats boxes that share only an edge as non-overlapping (exclusive edges)', () => {
    expect(overlaps(EDGE_TOUCH_RIGHT_A, EDGE_TOUCH_RIGHT_B)).toBe(false);
  });

  it('treats boxes that share only a corner as non-overlapping (exclusive edges)', () => {
    expect(overlaps(CORNER_TOUCH_A, CORNER_TOUCH_B)).toBe(false);
  });

  it('reports overlap only when both axes overlap', () => {
    const a = createAabb(0, 0, 10, 10);
    const sameRow = createAabb(5, 20, 10, 10);
    expect(overlaps(a, sameRow)).toBe(false);
  });

  it('reports a box fully contained in another as overlapping', () => {
    const outer = createAabb(0, 0, 100, 100);
    const inner = createAabb(10, 10, 5, 5);
    expect(overlaps(outer, inner)).toBe(true);
  });

  it('reports an identical box as overlapping', () => {
    const a = createAabb(1, 2, 3, 4);
    expect(overlaps(a, a)).toBe(true);
  });

  it('is symmetric', () => {
    expect(overlaps(OVERLAP_A, OVERLAP_B)).toBe(overlaps(OVERLAP_B, OVERLAP_A));
  });
});

describe('Aabb separation', () => {
  it('is the inverse of overlap', () => {
    expect(isSeparated(OVERLAP_A, OVERLAP_B)).toBe(false);
    expect(isSeparated(EDGE_TOUCH_RIGHT_A, EDGE_TOUCH_RIGHT_B)).toBe(true);
    expect(isSeparated(SEPARATED_A, SEPARATED_B)).toBe(true);
  });
});

describe('createAabb', () => {
  it('creates an Aabb from top-left position and size', () => {
    expect(createAabb(1, 2, 3, 4)).toEqual({ x: 1, y: 2, width: 3, height: 4 });
  });

  it('rejects zero, negative, or non-finite sizes', () => {
    for (const size of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createAabb(0, 0, size, 1)).toThrow(RangeError);
      expect(() => createAabb(0, 0, 1, size)).toThrow(RangeError);
    }
  });

  it('rejects zero width explicitly', () => {
    expect(() => createAabb(0, 0, 0, 10)).toThrow(RangeError);
  });

  it('rejects zero height explicitly', () => {
    expect(() => createAabb(0, 0, 10, 0)).toThrow(RangeError);
  });

  it('rejects non-finite positions', () => {
    expect(() => createAabb(Number.NaN, 0, 1, 1)).toThrow(RangeError);
    expect(() => createAabb(0, Number.NaN, 1, 1)).toThrow(RangeError);
  });
});

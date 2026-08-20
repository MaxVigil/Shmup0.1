/**
 * Mulberry32 PRNG with unsigned 32-bit state (Technical Foundation §8,
 * TECH-DEC-011). Deterministic and environment-independent.
 */
export class Mulberry32 {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform unsigned 32-bit integer. */
  nextUint32(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Uniform float in [0, 1). */
  nextFloat(): number {
    return this.nextUint32() / 4294967296;
  }

  /**
   * Uniform integer in [0, maxExclusive) using rejection sampling so the
   * selection is not biased by modulo reduction.
   */
  nextInt(maxExclusive: number): number {
    if (
      !Number.isInteger(maxExclusive) ||
      maxExclusive <= 0 ||
      maxExclusive > 0xffffffff
    ) {
      throw new RangeError(
        `nextInt maxExclusive must be an integer in [1, 2^32): ${maxExclusive}`,
      );
    }
    const threshold = 4294967296 - (4294967296 % maxExclusive);
    let value = this.nextUint32();
    while (value >= threshold) {
      value = this.nextUint32();
    }
    return value % maxExclusive;
  }
}

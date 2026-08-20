import type { SessionSeedSource } from '@application/ports';

/**
 * Browser entropy adapter (Technical Foundation §8): one unsigned 32-bit
 * session seed from `crypto.getRandomValues`. A missing entropy API or a
 * failed draw throws, which Boot reports as a fatal initialization failure.
 */
export function createBrowserSessionSeedSource(): SessionSeedSource {
  return {
    getSessionSeed(): number {
      if (typeof globalThis.crypto?.getRandomValues !== 'function') {
        throw new Error('Crypto entropy is unavailable in this environment');
      }
      const buffer = new Uint32Array(1);
      globalThis.crypto.getRandomValues(buffer);
      const seed = buffer[0];
      if (seed === undefined) {
        throw new Error('Failed to obtain the session seed');
      }
      return seed;
    },
  };
}

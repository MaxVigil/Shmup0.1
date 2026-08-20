/**
 * Application port for the one unsigned 32-bit session seed.
 *
 * The concrete adapter lives in `src/platform/` and is injected at the
 * composition root. Failure to obtain a seed is a fatal initialization failure
 * (Technical Foundation §8): the implementation throws and boot reports a fatal
 * outcome.
 */
export interface SessionSeedSource {
  getSessionSeed(): number;
}

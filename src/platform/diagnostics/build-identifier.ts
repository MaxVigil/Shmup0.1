/**
 * Delivery §4 / Master §7.11: one build identifier is available in console
 * diagnostics and performance records but is never displayed in normal player
 * UI. Vite replaces the ambient `__APP_BUILD_IDENTIFIER__` literal at build
 * time (vite.config.ts `define`); the guarded fallback keeps the module usable
 * in tooling that loads it without the define (for example Vitest).
 *
 * S14-WI01 build traceability: the identifier must not let an uncommitted
 * candidate masquerade as a clean committed revision. `formatBuildIdentifier`
 * appends `-dirty` whenever the working tree has uncommitted changes, so a
 * build is always traceable to its exact git state.
 */
declare const __APP_BUILD_IDENTIFIER__: string | undefined;

export interface BuildIdentifierParts {
  /** package.json version, for example `0.1.0`. */
  readonly version: string;
  /** short commit revision, or `unknown` when git is unavailable. */
  readonly revision: string;
  /** true when the working tree has uncommitted changes at build time. */
  readonly dirty: boolean;
}

/** Formats the truthful build identifier from its git/package parts. */
export function formatBuildIdentifier(parts: BuildIdentifierParts): string {
  const revision =
    parts.revision === '' || parts.revision === 'unknown'
      ? 'unknown'
      : parts.dirty
        ? `${parts.revision}-dirty`
        : parts.revision;
  return `shmup@${parts.version} (${revision})`;
}

export const BUILD_IDENTIFIER: string =
  typeof __APP_BUILD_IDENTIFIER__ === 'string'
    ? __APP_BUILD_IDENTIFIER__
    : formatBuildIdentifier({
        version: 'unknown',
        revision: 'unknown',
        dirty: false,
      });

/** Writes the single approved build diagnostic to the browser console. */
export function logBuildIdentifier(): void {
  console.info(`[shmup] build ${BUILD_IDENTIFIER}`);
}

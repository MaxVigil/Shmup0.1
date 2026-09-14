import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import * as domainSurface from '@domain/index';
import * as missionSurface from './mission';
import type { CombatSession } from './combat';
import type { MissionResult } from './mission/mission-result';

/**
 * V02-WI-05 E01 source/contract regressions: the temporary v0.1 instant-Aborted
 * production path (Return to Base Pause action, `requestReturnToBase`,
 * `abortMission`, the Aborted Mission Result kind, `applySeamAbort`, and the
 * free marker-clear seam) is REMOVED and must not return. These regressions
 * prove absence at the type surface, the module surface, and the production
 * source text after comments and string literals are stripped (so descriptive
 * prose that mentions the removed path cannot false-positive).
 */

/** Recursively lists production `.ts`/`.tsx` files (no `*.test.*`). */
function productionSourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...productionSourceFiles(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Removes `//` and block-comment delimiters and every quoted/template string
 * so only code tokens remain. JSX text nodes (which are not JS string
 * literals) stay present, so a re-introduced `Return to Base` button label
 * would be caught.
 */
function stripCommentsAndStrings(source: string): string {
  let out = '';
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      index += 2;
      while (
        index < source.length &&
        !(source[index] === '*' && source[index + 1] === '/')
      ) {
        index += 1;
      }
      index += 2;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      index += 1;
      while (index < source.length) {
        if (source[index] === '\\') {
          index += 2;
          continue;
        }
        if (source[index] === quote) {
          index += 1;
          break;
        }
        index += 1;
      }
      out += ' ';
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

// Type-level assertions: the `MissionResult` union and `CombatSession` surface
// have no Aborted kind and no Return-to-Base member. If either reappears, the
// `AssertNever` application below fails to compile.
type AssertNever<T extends never> = T;
type MissionResultKinds = MissionResult['kind'];
type NoAbortedResultKind = AssertNever<Extract<MissionResultKinds, 'aborted'>>;
type NoReturnToBaseMember = AssertNever<
  Extract<keyof CombatSession, 'requestReturnToBase'>
>;
void (undefined as NoAbortedResultKind | NoReturnToBaseMember | undefined);

describe('V02-WI-05 E01: no reachable instant-Aborted seam in production', () => {
  const root = process.cwd();
  const files = productionSourceFiles(join(root, 'src'));

  it('the abort-mission module file no longer exists', () => {
    // Covered indirectly by the source scan below, but asserted explicitly so
    // a deleted-file regression is obvious.
    const filesWithSeam = files.filter((file) =>
      file.includes('abort-mission'),
    );
    expect(filesWithSeam).toEqual([]);
  });

  it('the application and domain module surfaces export no abort command or transition', () => {
    expect('abortMission' in missionSurface).toBe(false);
    expect('applySeamAbort' in domainSurface).toBe(false);
  });

  it('production source contains no instant-Aborted code tokens or button label', () => {
    const stripped = files.map((file) => ({
      file,
      code: stripCommentsAndStrings(readFileSync(file, 'utf8')),
    }));
    const forbiddenPatterns: RegExp[] = [
      /requestReturnToBase/,
      /abortMission/,
      /applySeamAbort/,
      /\bAborted\b/,
      /\baborted\b/,
      /abort-mission/,
      /Return to Base/,
    ];
    const violations: string[] = [];
    for (const { file, code } of stripped) {
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(code)) {
          const line = code.split('\n').findIndex((text) => pattern.test(text));
          violations.push(`${file}:${line + 1} matches ${String(pattern)}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

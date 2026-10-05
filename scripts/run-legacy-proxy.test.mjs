import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  BASE_COPY_SHARED_FILES,
  copySharedHarnessIntoBaseCopy,
  recordProxy,
} from './run-legacy-proxy.mjs';

/**
 * V02-WI-07 D05 focused evidence-execution regression for
 * `scripts/run-legacy-proxy.mjs`.
 *
 * The legacy five-Basic proxy used to retry each side up to three times inside
 * one controlled run, which could silently replace an unfavourable 6 s sample
 * (or a real failure) with a later, more favourable attempt. These cases pin
 * the repaired contract: exactly ONE Playwright invocation per side, the first
 * raw failure propagated unchanged, and no replacement or rewrite of a failed
 * sample's raw record.
 */
const BASE_BUILD_IDENTIFIER = '[shmup] build shmup@0.1.0 (168822f)';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The relative local imports the reconstructed shared harness actually needs.
 * A disposable base copy is complete only when every one of them resolves on
 * disk; this is the check whose absence let the C01 defect through.
 */
function unresolvedHarnessImports(baseDir) {
  const harnessPath = join(baseDir, 'e2e', 'legacy-proxy-performance.spec.ts');
  if (!existsSync(harnessPath)) {
    return ['e2e/legacy-proxy-performance.spec.ts'];
  }
  const source = readFileSync(harnessPath, 'utf8');
  return [...source.matchAll(/from '(\.[^']+)'/g)]
    .map((match) => match[1])
    .filter((specifier) => {
      const target = resolve(dirname(harnessPath), specifier);
      return !existsSync(`${target}.ts`) && !existsSync(target);
    });
}

describe('disposable base-copy preparation (V02-WI-07 D05-C02)', () => {
  it('creates the absent destination directory and copies the complete shared harness set byte-for-byte', () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'shmup-base-copy-'));
    try {
      // The immutable base revision has no src/test-support at all.
      expect(existsSync(join(baseDir, 'src', 'test-support'))).toBe(false);

      copySharedHarnessIntoBaseCopy(baseDir, ROOT);

      expect(existsSync(join(baseDir, 'src', 'test-support'))).toBe(true);
      const sourceHelper = readFileSync(
        join(ROOT, 'src/test-support/legacy-proxy-evidence.ts'),
      );
      const copiedHelper = readFileSync(
        join(baseDir, 'src/test-support/legacy-proxy-evidence.ts'),
      );
      expect(copiedHelper.equals(sourceHelper)).toBe(true);
      for (const relative of BASE_COPY_SHARED_FILES) {
        expect(existsSync(join(baseDir, relative))).toBe(true);
      }
      // The reconstructed harness resolves every real local import it declares.
      expect(unresolvedHarnessImports(baseDir)).toEqual([]);
      expect(BASE_COPY_SHARED_FILES).toContain(
        'src/test-support/legacy-proxy-evidence.ts',
      );
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });

  it('detects an omitted local harness module (the C01 defect) in the same base copy', () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'shmup-base-copy-'));
    try {
      // Reproduce the C01 reconstruction: harness only, no local helper.
      mkdirSync(join(baseDir, 'e2e'), { recursive: true });
      cpSync(
        join(ROOT, 'e2e', 'legacy-proxy-performance.spec.ts'),
        join(baseDir, 'e2e', 'legacy-proxy-performance.spec.ts'),
      );

      expect(unresolvedHarnessImports(baseDir)).toContain(
        '../src/test-support/legacy-proxy-evidence',
      );
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });
});

describe('legacy proxy side invocation (V02-WI-07 D05)', () => {
  it('invokes the unchanged workload exactly once on success with the side record identity', async () => {
    const invocations = [];
    const invoke = async (cwd, env) => {
      invocations.push({ cwd, env });
    };

    await recordProxy(
      '/tmp/legacy-side',
      'post-integration-legacy-five-basic.json',
      'post-integration',
      undefined,
      invoke,
    );

    expect(invocations).toHaveLength(1);
    expect(invocations[0].cwd).toBe('/tmp/legacy-side');
    expect(invocations[0].env.LEGACY_PROXY_RECORD).toBe(
      'post-integration-legacy-five-basic.json',
    );
    expect(invocations[0].env.LEGACY_PROXY_SIDE).toBe('post-integration');
    // The current side has no injected revision: its build identity must come
    // from the served artifact's own build line, never from a hardcoded value.
    expect(invocations[0].env.LEGACY_PROXY_BUILD_IDENTIFIER).toBeUndefined();
  });

  it('forwards the injected immutable base revision exactly once so the base record is never unknown', async () => {
    const invocations = [];
    const invoke = async (cwd, env) => {
      invocations.push({ cwd, env });
    };

    await recordProxy(
      '/tmp/legacy-base-side',
      'base-legacy-five-basic.json',
      'base',
      BASE_BUILD_IDENTIFIER,
      invoke,
    );

    expect(invocations).toHaveLength(1);
    expect(invocations[0].env.LEGACY_PROXY_RECORD).toBe(
      'base-legacy-five-basic.json',
    );
    expect(invocations[0].env.LEGACY_PROXY_SIDE).toBe('base');
    expect(invocations[0].env.LEGACY_PROXY_BUILD_IDENTIFIER).toBe(
      BASE_BUILD_IDENTIFIER,
    );
  });

  it('propagates the first failure unchanged, stops after one attempt, and leaves the failed sample untouched', async () => {
    const recordDir = mkdtempSync(join(tmpdir(), 'shmup-legacy-proxy-side-'));
    try {
      // A raw failed sample already on disk (the harness writes its record only
      // after every in-browser assertion passed).
      const recordPath = join(recordDir, 'base-legacy-five-basic.json');
      const rawFailedSample = `${JSON.stringify(
        { side: 'base', sustainedFps: 41.2, minimumSustainedWindowFps: 41.2 },
        null,
        2,
      )}\n`;
      writeFileSync(recordPath, rawFailedSample);

      const invocations = [];
      const firstError = new Error(
        'npx playwright test -c playwright.legacy.config.ts failed with exit 1',
      );
      const invoke = async () => {
        invocations.push(1);
        // A retry-until-pass loop would have written a favourable replacement
        // record here; this is the defect the regression must keep out.
        if (invocations.length > 1) {
          writeFileSync(
            recordPath,
            `${JSON.stringify({ side: 'base', sustainedFps: 60.1 }, null, 2)}\n`,
          );
        }
        throw firstError;
      };

      await expect(
        recordProxy(
          '/tmp/legacy-base-side',
          'base-legacy-five-basic.json',
          'base',
          BASE_BUILD_IDENTIFIER,
          invoke,
        ),
      ).rejects.toBe(firstError);

      expect(invocations).toHaveLength(1);
      expect(readFileSync(recordPath, 'utf8')).toBe(rawFailedSample);
    } finally {
      rmSync(recordDir, { recursive: true, force: true });
    }
  });
});

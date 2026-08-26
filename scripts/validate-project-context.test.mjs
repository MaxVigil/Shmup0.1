import { describe, expect, it } from 'vitest';

import {
  EXPECTED_PACKAGE_NAME,
  normalizeRepositoryRemote,
  validateProjectContext,
} from './validate-project-context.mjs';

const revision = 'a'.repeat(40);

function validSnapshot(overrides = {}) {
  return {
    root: '/tmp/Shmup0.1',
    packageName: EXPECTED_PACKAGE_NAME,
    originRemote: 'https://github.com/MaxVigil/Shmup0.1',
    head: revision,
    branch: 'main',
    originMain: revision,
    divergence: '0 0',
    handoffBaseRevision: null,
    workingTreeEntries: 0,
    ...overrides,
  };
}

describe('project context validation', () => {
  it.each([
    'https://github.com/MaxVigil/Shmup0.1',
    'https://github.com/MaxVigil/Shmup0.1.git',
    'git@github.com:MaxVigil/Shmup0.1.git',
    'ssh://git@github.com/MaxVigil/Shmup0.1.git',
  ])('normalizes an accepted origin form: %s', (remote) => {
    expect(normalizeRepositoryRemote(remote)).toBe(
      'github.com/maxvigil/shmup0.1',
    );
  });

  it('accepts the canonical repository on current main', () => {
    expect(() => validateProjectContext(validSnapshot())).not.toThrow();
  });

  it('rejects an archive or similarly named repository', () => {
    expect(() =>
      validateProjectContext(
        validSnapshot({
          originRemote: 'https://github.com/MaxVigil/Shmup-archive',
        }),
      ),
    ).toThrow('origin must identify github.com/maxvigil/shmup0.1');
  });

  it('rejects the canonical path on a different Git host', () => {
    expect(() =>
      validateProjectContext(
        validSnapshot({
          originRemote: 'https://gitlab.com/MaxVigil/Shmup0.1',
        }),
      ),
    ).toThrow('origin must identify github.com/maxvigil/shmup0.1');
  });

  it('rejects the wrong package marker', () => {
    expect(() =>
      validateProjectContext(validSnapshot({ packageName: 'shmup' })),
    ).toThrow('package name must be shmup-mvp');
  });

  it('rejects a stale local main', () => {
    expect(() =>
      validateProjectContext(
        validSnapshot({ originMain: 'b'.repeat(40), divergence: '1 1' }),
      ),
    ).toThrow('local main must equal the fetched origin/main revision');
  });

  it.each([
    ['HEAD', { head: 'not-a-revision' }],
    ['origin/main', { originMain: 'not-a-revision' }],
  ])('rejects an invalid %s revision', (_, overrides) => {
    expect(() => validateProjectContext(validSnapshot(overrides))).toThrow(
      'must resolve to a full Git revision',
    );
  });

  it('rejects non-zero main divergence even when revisions match', () => {
    expect(() =>
      validateProjectContext(validSnapshot({ divergence: '1 0' })),
    ).toThrow('local main must have zero divergence from origin/main');
  });

  it('permits an isolated feature worktree based on the same repository', () => {
    expect(() =>
      validateProjectContext(validSnapshot({ branch: 'docs/governance-v1.1' })),
    ).not.toThrow();
  });

  it('rejects a handoff created for another revision', () => {
    expect(() =>
      validateProjectContext(
        validSnapshot({ handoffBaseRevision: 'b'.repeat(40) }),
      ),
    ).toThrow('active handoff baseRevision');
  });
});

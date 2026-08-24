import { describe, expect, it } from 'vitest';

import { validateControl, validateResult } from './validate-agent-handoff.mjs';

const revision = 'a'.repeat(40);

function currentControl(overrides = {}) {
  return {
    protocolVersion: 2,
    runId: 'enemy-types-epic-01',
    scopeId: 'E01',
    taskType: 'epic',
    baseRevision: revision,
    canonicalSections: ['Project Documentation/example.md §1'],
    delta: ['Add one approved observable outcome.'],
    risks: [],
    requiredGates: ['npm run verify'],
    state: 'assigned',
    ...overrides,
  };
}

function currentResult(overrides = {}) {
  return {
    protocolVersion: 2,
    runId: 'enemy-types-epic-01',
    scopeId: 'E01',
    baseRevision: revision,
    state: 'awaiting_review',
    changedPaths: ['src/content/enemies.ts'],
    criteria: ['Enemy Types AC-001'],
    gates: [{ command: 'npm run verify', status: 'pass' }],
    evidencePaths: [],
    deviations: [],
    blockers: [],
    ...overrides,
  };
}

describe('agent handoff protocol', () => {
  it('retains legacy MVP protocol-v1 compatibility', () => {
    const control = {
      protocolVersion: 1,
      runId: 's14',
      sliceId: 'S14',
      taskType: 'slice',
      baseRevision: revision,
      canonicalSection: 'MVP S14',
      overrides: [],
      state: 'assigned',
    };
    const result = {
      protocolVersion: 1,
      runId: 's14',
      sliceId: 'S14',
      baseRevision: revision,
      state: 'awaiting_review',
      changedPaths: [],
      criteria: [],
      gates: [],
      evidencePaths: [],
      deviations: [],
      blockers: [],
    };

    expect(() => validateControl(control)).not.toThrow();
    expect(() => validateResult(result, control)).not.toThrow();
  });

  it('accepts a compact post-MVP protocol-v2 handoff', () => {
    const control = currentControl();

    expect(() => validateControl(control)).not.toThrow();
    expect(() => validateResult(currentResult(), control)).not.toThrow();
  });

  it.each(['canonicalSections', 'delta', 'requiredGates'])(
    'requires a non-empty %s route',
    (field) => {
      expect(() => validateControl(currentControl({ [field]: [] }))).toThrow(
        `control.${field} must be a non-empty string array`,
      );
    },
  );

  it('requires every assigned gate to pass before review', () => {
    const control = currentControl({
      requiredGates: ['npm run verify', 'npm run verify:browser'],
    });

    expect(() => validateResult(currentResult(), control)).toThrow(
      'required gate was not reported as pass: npm run verify:browser',
    );
  });

  it('rejects mismatched post-MVP scope identity', () => {
    expect(() =>
      validateResult(currentResult({ scopeId: 'E02' }), currentControl()),
    ).toThrow('result identity does not match control');
  });
});

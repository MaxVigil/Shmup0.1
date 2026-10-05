import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createEvidenceAttempt,
  closeEvidenceAttempt,
  evidenceDirectory,
} from './evidence-output.mjs';
import { runVerification, verificationCommands } from './run-verification.mjs';
import { validateControl } from './validate-agent-handoff.mjs';

const roots = [];
const root = () => {
  const value = mkdtempSync(join(tmpdir(), 'shmup-process-'));
  roots.push(value);
  return value;
};
afterEach(() => {
  for (const value of roots.splice(0))
    rmSync(value, { recursive: true, force: true });
});
const fingerprint = () => ({ head: 'a'.repeat(40), digest: '12345678' });

describe('isolated verification attempts', () => {
  it('never defaults to historical evidence and shares one directory with children', () => {
    const env = {};
    const base = root();
    const first = evidenceDirectory({ root: base, env });
    expect(evidenceDirectory({ root: base, env })).toBe(first);
    expect(first).toContain('/.agent-handoff/runs/attempt-');
    expect(evidenceDirectory({ root: base, env: {} })).not.toBe(first);
  });
  it('rejects a historical path and refuses to reopen a sealed run', () => {
    const base = root();
    const historical = join(base, '.agent-handoff/evidence');
    mkdirSync(historical, { recursive: true });
    expect(() =>
      evidenceDirectory({ env: { SHMUP_EVIDENCE_DIR: historical } }),
    ).toThrow();
    const directory = createEvidenceAttempt(base);
    closeEvidenceAttempt(directory, { exitCode: 0 });
    expect(() =>
      evidenceDirectory({ env: { SHMUP_EVIDENCE_DIR: directory } }),
    ).toThrow(/open isolated/);
  });
  it('preserves a failed sample, propagates the first failure once and does not touch accepted evidence', () => {
    const base = root();
    const historical = join(base, '.agent-handoff/evidence');
    mkdirSync(historical, { recursive: true });
    const accepted = join(historical, 'accepted.json');
    writeFileSync(accepted, 'accepted bytes');
    writeFileSync(
      join(base, '.agent-handoff/control.json'),
      JSON.stringify(control()),
    );
    let calls = 0;
    const result = runVerification('evidence', {
      root: base,
      env: {},
      fingerprint,
      invoke: (_cmd, _args, options) => {
        calls++;
        writeFileSync(
          join(options.env.SHMUP_EVIDENCE_DIR, 'failed.json'),
          '41.3',
        );
        return { status: 7 };
      },
    });
    expect(calls).toBe(1);
    expect(result.exitCode).toBe(7);
    expect(readFileSync(accepted, 'utf8')).toBe('accepted bytes');
    expect(readFileSync(join(result.directory, 'failed.json'), 'utf8')).toBe(
      '41.3',
    );
    expect(result.stages.slice(1).every((x) => x.status === 'not_run')).toBe(
      true,
    );
    expect(
      JSON.parse(readFileSync(join(result.directory, 'attempt.json'))).state,
    ).toBe('failed');
  });
  it('seals thrown execution errors as failures even after an earlier success', () => {
    const base = root();
    let directory;
    let calls = 0;
    expect(() =>
      runVerification('smoke', {
        root: base,
        env: {},
        fingerprint,
        invoke: (_cmd, _args, options) => {
          directory = options.env.SHMUP_EVIDENCE_DIR;
          if (++calls === 2) throw new Error('spawn failed');
          return { status: 0 };
        },
      }),
    ).toThrow('spawn failed');
    expect(
      JSON.parse(readFileSync(join(directory, 'attempt.json'))).state,
    ).toBe('failed');
  });
  it('fails a green sequence when its source identity changed', () => {
    let calls = 0;
    const result = runVerification('integration', {
      root: root(),
      env: {},
      fingerprint: () => ({ ...fingerprint(), digest: String(calls++) }),
      invoke: () => ({ status: 0 }),
    });
    expect(result.exitCode).toBe(1);
  });
  it('fails before invoking the evidence chain without an active handoff', () => {
    let invoked = false;
    expect(() =>
      runVerification('evidence', {
        root: root(),
        env: {},
        fingerprint,
        invoke: () => {
          invoked = true;
          return { status: 0 };
        },
      }),
    ).toThrow(/valid active handoff/);
    expect(invoked).toBe(false);
  });
  it('does not seal a passed attempt when final fingerprint collection throws', () => {
    let directory;
    let calls = 0;
    expect(() =>
      runVerification('integration', {
        root: root(),
        env: {},
        fingerprint: () => {
          if (calls++) throw new Error('fingerprint failed');
          return fingerprint();
        },
        invoke: (_cmd, _args, options) => {
          directory = options.env.SHMUP_EVIDENCE_DIR;
          return { status: 0 };
        },
      }),
    ).toThrow('fingerprint failed');
    expect(
      JSON.parse(readFileSync(join(directory, 'attempt.json'))).state,
    ).toBe('failed');
  });
  it('preflights before measurement and produces Elite records before embedded legacy comparison', () => {
    const commands = verificationCommands('evidence').map((x) => x.join(' '));
    expect(commands[0]).toBe('node scripts/run-legacy-proxy.mjs --preflight');
    expect(commands.indexOf('npm run evidence:pass-b-elite')).toBeLessThan(
      commands.indexOf('npm run evidence:legacy'),
    );
    expect(new Set(commands).size).toBe(commands.length);
  });
});

function control() {
  return {
    protocolVersion: 2,
    runId: 'pilot',
    scopeId: 'V03-WI-01',
    taskType: 'work_item',
    baseRevision: 'a'.repeat(40),
    canonicalSections: ['spec §1'],
    delta: ['outcome'],
    risks: [],
    state: 'assigned',
    requiredGates: ['preflight', 'measure'],
    processExperiment: 'P123',
    readinessRef: 'spec §2',
    repairOwners: ['scripts/owner.mjs'],
    gatePlan: [
      {
        command: 'preflight',
        lane: 'preflight',
        dependsOn: [],
        reason: 'imports',
      },
      {
        command: 'measure',
        lane: 'release',
        dependsOn: ['preflight'],
        reason: 'approved workload',
      },
    ],
  };
}
describe('bounded readiness mechanics', () => {
  it('accepts a complete route without claiming product readiness', () =>
    expect(() => validateControl(control())).not.toThrow());
  it('rejects a consumer before its producer', () => {
    const c = control();
    c.gatePlan[0].dependsOn = ['measure'];
    expect(() => validateControl(c)).toThrow(/dependency/);
  });
  it('rejects a missing required gate mapping', () => {
    const c = control();
    c.gatePlan.pop();
    expect(() => validateControl(c)).toThrow(/cover/);
  });
  it('requires a diagnosis and PO decision after two rejected corrections', () => {
    const c = control();
    c.correctionCheckpoint = { rejectedCorrections: 2, causeClass: 'evidence' };
    expect(() => validateControl(c)).toThrow(/diagnosisRef/);
    c.correctionCheckpoint.diagnosisRef = 'review §1';
    expect(() => validateControl(c)).toThrow(/productOwnerDecisionRef/);
    c.correctionCheckpoint.productOwnerDecisionRef = 'decision §1';
    expect(() => validateControl(c)).not.toThrow();
  });
});

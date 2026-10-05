import { spawnSync } from 'node:child_process';
import { closeSync, openSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  createEvidenceAttempt,
  closeEvidenceAttempt,
} from './evidence-output.mjs';
import { computeSourceFingerprint } from './evidence-source-fingerprint.mjs';
import { validateControl } from './validate-agent-handoff.mjs';

// Deliberately a small set of existing commands, not a task scheduler.
export function verificationCommands(lane) {
  const preflight = ['node', 'scripts/run-legacy-proxy.mjs', '--preflight'];
  const npm = (name) => ['npm', 'run', name];
  const lanes = {
    integration: [npm('verify:all')],
    smoke: [
      npm('build'),
      [
        'npx',
        'playwright',
        'test',
        '--project=production',
        '--grep-invert',
        '@release-evidence',
      ],
    ],
    preflight: [preflight],
    evidence: [
      preflight,
      npm('verify:all'),
      npm('evidence:pass-a'),
      npm('evidence:pass-b-elite'),
      npm('evidence:legacy'),
      npm('evidence:mutation'),
      npm('evidence:compare'),
    ],
  };
  if (!lanes[lane]) throw new Error(`Unknown lane ${lane}`);
  return lanes[lane];
}

export function runVerification(
  lane,
  {
    root = process.cwd(),
    invoke = spawnSync,
    fingerprint = computeSourceFingerprint,
    env = process.env,
  } = {},
) {
  const commands = verificationCommands(lane);
  const sourceFingerprint = fingerprint(root);
  let runId = null;
  let control = null;
  try {
    control = JSON.parse(
      readFileSync(join(root, '.agent-handoff/control.json'), 'utf8'),
    );
    validateControl(control);
    if (control.baseRevision !== sourceFingerprint.head)
      throw new Error('Stale handoff base revision');
    runId = control.runId;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (lane === 'evidence' && control === null)
    throw new Error(
      'Evidence chain requires a valid active handoff before any expensive command',
    );
  const directory = createEvidenceAttempt(root);
  const childEnv = {
    ...env,
    SHMUP_EVIDENCE_DIR: directory,
    // No control means diagnostic evidence, not a fabricated accepted identity.
    SHMUP_EVIDENCE_RUN_ID:
      runId ?? `diagnostic-${directory.split(/[\\/]/).at(-1)}`,
    SHMUP_EVIDENCE_SOURCE_FINGERPRINT: JSON.stringify(sourceFingerprint),
  };
  const stages = commands.map((command) => ({ command, status: 'not_run' }));
  let exitCode = 1;
  console.log(`Isolated evidence: ${directory}`);
  try {
    for (const [index, command] of commands.entries()) {
      const started = Date.now();
      const fd = openSync(join(directory, `${index + 1}.log`), 'wx');
      let result;
      exitCode = 1;
      try {
        result = invoke(command[0], command.slice(1), {
          cwd: root,
          env: childEnv,
          stdio: ['ignore', fd, fd],
        });
      } finally {
        closeSync(fd);
      }
      exitCode = result.status ?? 1;
      stages[index] = {
        command,
        status: exitCode === 0 ? 'pass' : 'fail',
        exitCode,
        signal: result.signal ?? null,
        durationMs: Date.now() - started,
      };
      console.log(`${command.join(' ')}: ${stages[index].status}`);
      if (exitCode !== 0) break;
    }
    if (
      JSON.stringify(fingerprint(root)) !== JSON.stringify(sourceFingerprint)
    ) {
      exitCode = 1;
      stages.push({ command: ['source-identity'], status: 'fail' });
    }
  } catch (error) {
    exitCode = 1;
    stages.push({
      command: ['runner-error'],
      status: 'fail',
      error: String(error),
    });
    throw error;
  } finally {
    closeEvidenceAttempt(directory, {
      lane,
      runId,
      sourceFingerprint,
      exitCode,
      stages,
    });
  }
  return { directory, exitCode, stages };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const lane = process.argv[2];
  if (process.argv.includes('--list'))
    console.log(JSON.stringify(verificationCommands(lane), null, 2));
  else process.exitCode = runVerification(lane).exitCode;
}

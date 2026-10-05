import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = 'attempt.json';

// Output routing only. This never changes scenario, source or workload identity.
export function createEvidenceAttempt(root = ROOT) {
  const parent = join(root, '.agent-handoff', 'runs');
  mkdirSync(parent, { recursive: true });
  const directory = realpathSync(mkdtempSync(join(parent, 'attempt-')));
  writeFileSync(
    join(directory, MARKER),
    JSON.stringify(
      {
        schemaVersion: 1,
        directory,
        state: 'open',
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  );
  return directory;
}

export function validateEvidenceDirectory(directory, { writable = true } = {}) {
  const actual = realpathSync(directory);
  const marker = JSON.parse(readFileSync(join(actual, MARKER), 'utf8'));
  if (
    actual !== resolve(directory) ||
    marker.schemaVersion !== 1 ||
    marker.directory !== actual ||
    dirname(dirname(actual)).split(/[\\/]/).at(-1) !== '.agent-handoff' ||
    dirname(actual).split(/[\\/]/).at(-1) !== 'runs' ||
    (writable && marker.state !== 'open')
  ) {
    throw new Error(
      'Evidence output must be an open isolated attempt, never an accepted/historical directory',
    );
  }
  return actual;
}

export function evidenceDirectory({
  root = ROOT,
  env = process.env,
  writable = true,
} = {}) {
  // Direct diagnostic invocations also get a fresh directory; never fall back
  // to the historical .agent-handoff/evidence files. Children inherit it.
  if (!env.SHMUP_EVIDENCE_DIR)
    env.SHMUP_EVIDENCE_DIR = createEvidenceAttempt(root);
  return validateEvidenceDirectory(env.SHMUP_EVIDENCE_DIR, { writable });
}

export function closeEvidenceAttempt(directory, outcome) {
  validateEvidenceDirectory(directory);
  const marker = JSON.parse(readFileSync(join(directory, MARKER), 'utf8'));
  writeFileSync(
    join(directory, MARKER),
    JSON.stringify(
      {
        ...marker,
        ...outcome,
        directory: marker.directory,
        state: outcome.exitCode === 0 ? 'passed' : 'failed',
        finishedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
  );
}

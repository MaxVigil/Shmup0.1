import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);

export const EXPECTED_REPOSITORY = 'github.com/maxvigil/shmup0.1';
export const EXPECTED_PACKAGE_NAME = 'shmup-mvp';

function fail(messages) {
  const details = Array.isArray(messages) ? messages.join('\n- ') : messages;
  throw new Error(`Invalid project context:\n- ${details}`);
}

export function normalizeRepositoryRemote(remote) {
  if (typeof remote !== 'string' || remote.trim().length === 0) return '';

  const value = remote
    .trim()
    .replace(/\/$/, '')
    .replace(/\.git$/i, '');
  if (value.includes('://')) {
    try {
      const url = new URL(value);
      return `${url.hostname}/${url.pathname.replace(/^\//, '')}`.toLowerCase();
    } catch {
      return value.toLowerCase();
    }
  }

  const scpMatch = value.match(/^(?:[^@]+@)?([^:]+):(.+)$/);
  return scpMatch
    ? `${scpMatch[1]}/${scpMatch[2]}`.toLowerCase()
    : value.toLowerCase();
}

export function validateProjectContext(snapshot) {
  const errors = [];
  const normalizedRemote = normalizeRepositoryRemote(snapshot.originRemote);

  if (!snapshot.root?.startsWith('/')) {
    errors.push('repository root must be an absolute path');
  }
  if (normalizedRemote !== EXPECTED_REPOSITORY) {
    errors.push(
      `origin must identify ${EXPECTED_REPOSITORY}; received ${normalizedRemote || '<missing>'}`,
    );
  }
  if (snapshot.packageName !== EXPECTED_PACKAGE_NAME) {
    errors.push(
      `package name must be ${EXPECTED_PACKAGE_NAME}; received ${snapshot.packageName || '<missing>'}`,
    );
  }
  if (!/^[0-9a-f]{40}$/.test(snapshot.head)) {
    errors.push('HEAD must resolve to a full Git revision');
  }
  if (!/^[0-9a-f]{40}$/.test(snapshot.originMain)) {
    errors.push('origin/main must resolve to a full Git revision');
  }
  if (snapshot.branch === 'main') {
    if (snapshot.head !== snapshot.originMain) {
      errors.push('local main must equal the fetched origin/main revision');
    }
    if (snapshot.divergence !== '0 0') {
      errors.push(
        `local main must have zero divergence from origin/main; received ${snapshot.divergence}`,
      );
    }
  }
  if (
    snapshot.handoffBaseRevision !== null &&
    snapshot.handoffBaseRevision !== snapshot.head
  ) {
    errors.push(
      `active handoff baseRevision ${snapshot.handoffBaseRevision} does not equal HEAD ${snapshot.head}`,
    );
  }

  if (errors.length > 0) fail(errors);
}

async function git(root, ...args) {
  const { stdout } = await execFileAsync('git', args, {
    cwd: root,
    encoding: 'utf8',
  });
  return stdout.trim();
}

async function readHandoffBaseRevision(root) {
  try {
    const control = JSON.parse(
      await readFile(resolve(root, '.agent-handoff/control.json'), 'utf8'),
    );
    return typeof control.baseRevision === 'string'
      ? control.baseRevision
      : '<missing>';
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    fail('.agent-handoff/control.json is invalid JSON');
  }
}

export async function collectProjectContext(startDirectory = process.cwd()) {
  const root = await git(startDirectory, 'rev-parse', '--show-toplevel');
  const packageJson = JSON.parse(
    await readFile(resolve(root, 'package.json'), 'utf8'),
  );
  const [originRemote, head, branch, originMain, rawDivergence, status] =
    await Promise.all([
      git(root, 'remote', 'get-url', 'origin'),
      git(root, 'rev-parse', 'HEAD'),
      git(root, 'branch', '--show-current'),
      git(root, 'rev-parse', 'refs/remotes/origin/main'),
      git(root, 'rev-list', '--left-right', '--count', 'HEAD...origin/main'),
      git(root, 'status', '--short'),
    ]);

  const workingTreeStatus =
    status.length === 0 ? [] : status.split('\n').filter(Boolean);

  return {
    root,
    packageName: packageJson.name,
    originRemote,
    head,
    branch: branch || '<detached>',
    originMain,
    divergence: rawDivergence.replace(/\s+/, ' '),
    handoffBaseRevision: await readHandoffBaseRevision(root),
    workingTreeEntries: workingTreeStatus.length,
    workingTreeStatus,
  };
}

export async function validateCurrentProject(startDirectory = process.cwd()) {
  const snapshot = await collectProjectContext(startDirectory);
  validateProjectContext(snapshot);
  return snapshot;
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMainModule) {
  const snapshot = await validateCurrentProject();
  console.log('Project context valid.');
  console.log(`Root: ${snapshot.root}`);
  console.log(`Origin: ${snapshot.originRemote}`);
  console.log(`Branch: ${snapshot.branch}`);
  console.log(`HEAD: ${snapshot.head}`);
  console.log(`origin/main: ${snapshot.originMain}`);
  console.log(`Working-tree entries: ${snapshot.workingTreeEntries}`);
  for (const entry of snapshot.workingTreeStatus) {
    console.log(`  ${entry}`);
  }
  console.log(
    `Active handoff: ${snapshot.handoffBaseRevision === null ? 'none' : 'matches HEAD'}`,
  );
}

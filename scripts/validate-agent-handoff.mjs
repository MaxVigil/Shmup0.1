import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const defaultRoot = new URL('../.agent-handoff/', import.meta.url);

function fail(message) {
  throw new Error(`Invalid agent handoff: ${message}`);
}

async function readJson(name, required, root) {
  try {
    return JSON.parse(await readFile(new URL(name, root), 'utf8'));
  } catch (error) {
    if (!required && error?.code === 'ENOENT') return null;
    fail(`${name} is missing or invalid JSON`);
  }
}

function string(value, field) {
  if (typeof value !== 'string' || value.length === 0)
    fail(`${field} must be a non-empty string`);
}

function strings(value, field, { nonEmpty = false } = {}) {
  if (
    !Array.isArray(value) ||
    (nonEmpty && value.length === 0) ||
    value.some((item) => typeof item !== 'string' || item.length === 0)
  )
    fail(`${field} must be a${nonEmpty ? ' non-empty' : ''} string array`);
}

function validateRevision(value, field) {
  if (!/^[0-9a-f]{40}$/.test(value))
    fail(`${field} must be a full Git revision`);
}

function validateLegacyControl(control) {
  if (!/^S\d{2}$/.test(control.sliceId)) fail('control.sliceId must match Sxx');
  if (!['slice', 'correction'].includes(control.taskType))
    fail('control.taskType is invalid');
  string(control.canonicalSection, 'control.canonicalSection');
  strings(control.overrides, 'control.overrides');
}

function validateCurrentControl(control) {
  if (!/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/.test(control.scopeId))
    fail('control.scopeId must be an uppercase scope identifier');
  if (!['epic', 'work_item', 'correction'].includes(control.taskType))
    fail('control.taskType is invalid');
  strings(control.canonicalSections, 'control.canonicalSections', {
    nonEmpty: true,
  });
  strings(control.delta, 'control.delta', { nonEmpty: true });
  strings(control.risks, 'control.risks');
  strings(control.requiredGates, 'control.requiredGates', { nonEmpty: true });
}

export function validateControl(control) {
  if (![1, 2].includes(control?.protocolVersion))
    fail('unsupported protocolVersion');
  string(control.runId, 'control.runId');
  validateRevision(control.baseRevision, 'control.baseRevision');
  if (control.state !== 'assigned') fail('control.state must be assigned');

  if (control.protocolVersion === 1) validateLegacyControl(control);
  else validateCurrentControl(control);
}

function validateIssue(issue, field) {
  if (!['S0', 'S1', 'S2', 'S3'].includes(issue?.severity))
    fail(`${field}.severity is invalid`);
  if (
    !['blocked', 'fix_now', 'accepted_observation'].includes(issue?.disposition)
  )
    fail(`${field}.disposition is invalid`);
  string(issue.impact, `${field}.impact`);
  if (issue.disposition === 'accepted_observation')
    string(issue.owner, `${field}.owner`);
}

function validateResultIdentity(result, control) {
  const sharedIdentityMatches =
    result.protocolVersion === control.protocolVersion &&
    result.runId === control.runId &&
    result.baseRevision === control.baseRevision;
  const scopeIdentityMatches =
    control.protocolVersion === 1
      ? result.sliceId === control.sliceId
      : result.scopeId === control.scopeId;

  if (!sharedIdentityMatches || !scopeIdentityMatches)
    fail('result identity does not match control');
}

export function validateResult(result, control) {
  validateResultIdentity(result, control);
  if (!['awaiting_review', 'blocked'].includes(result.state))
    fail('result.state is invalid');
  strings(result.changedPaths, 'result.changedPaths');
  strings(result.criteria, 'result.criteria');
  strings(result.evidencePaths, 'result.evidencePaths');
  if (!Array.isArray(result.gates)) fail('result.gates must be an array');
  for (const [index, gate] of result.gates.entries()) {
    string(gate?.command, `result.gates[${index}].command`);
    if (!['pass', 'fail', 'not_run'].includes(gate?.status))
      fail(`result.gates[${index}].status is invalid`);
  }
  if (!Array.isArray(result.deviations) || !Array.isArray(result.blockers))
    fail('result deviations/blockers must be arrays');
  result.deviations.forEach((issue, index) =>
    validateIssue(issue, `result.deviations[${index}]`),
  );
  result.blockers.forEach((issue, index) =>
    validateIssue(issue, `result.blockers[${index}]`),
  );

  if (control.protocolVersion === 2 && result.state === 'awaiting_review') {
    const reportedCommands = new Set(
      result.gates
        .filter((gate) => gate.status === 'pass')
        .map((gate) => gate.command),
    );
    const missingGate = control.requiredGates.find(
      (command) => !reportedCommands.has(command),
    );
    if (missingGate)
      fail(`required gate was not reported as pass: ${missingGate}`);
  }

  const blocking = [...result.deviations, ...result.blockers].some((issue) =>
    ['S0', 'S1', 'S2'].includes(issue.severity),
  );
  const failedGate = result.gates.some((gate) => gate.status !== 'pass');
  if (result.state === 'awaiting_review' && (blocking || failedGate))
    fail('awaiting_review cannot contain S0-S2 or an unpassed gate');
  if (result.state === 'blocked' && result.blockers.length === 0)
    fail('blocked requires at least one blocker');
}

export async function validateHandoff(root = defaultRoot) {
  const control = await readJson('control.json', true, root);
  validateControl(control);
  const result = await readJson('result.json', false, root);
  if (result !== null) validateResult(result, control);
  return result === null;
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMainModule) {
  const hasOnlyControl = await validateHandoff();
  console.log(
    hasOnlyControl
      ? 'Agent handoff control valid.'
      : 'Agent handoff control and result valid.',
  );
}

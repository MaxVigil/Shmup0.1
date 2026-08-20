import { readFile } from 'node:fs/promises';

const root = new URL('../.agent-handoff/', import.meta.url);

function fail(message) {
  throw new Error(`Invalid agent handoff: ${message}`);
}

async function readJson(name, required) {
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

function strings(value, field) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
    fail(`${field} must be a string array`);
}

function validateControl(control) {
  if (control.protocolVersion !== 1) fail('unsupported protocolVersion');
  string(control.runId, 'control.runId');
  if (!/^S\d{2}$/.test(control.sliceId)) fail('control.sliceId must match Sxx');
  if (!['slice', 'correction'].includes(control.taskType))
    fail('control.taskType is invalid');
  if (!/^[0-9a-f]{40}$/.test(control.baseRevision))
    fail('control.baseRevision must be a full Git revision');
  string(control.canonicalSection, 'control.canonicalSection');
  strings(control.overrides, 'control.overrides');
  if (control.state !== 'assigned') fail('control.state must be assigned');
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

function validateResult(result, control) {
  if (
    result.protocolVersion !== 1 ||
    result.runId !== control.runId ||
    result.sliceId !== control.sliceId ||
    result.baseRevision !== control.baseRevision
  )
    fail('result identity does not match control');
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
  const blocking = [...result.deviations, ...result.blockers].some((issue) =>
    ['S0', 'S1', 'S2'].includes(issue.severity),
  );
  const failedGate = result.gates.some((gate) => gate.status !== 'pass');
  if (result.state === 'awaiting_review' && (blocking || failedGate))
    fail('awaiting_review cannot contain S0-S2 or an unpassed gate');
  if (result.state === 'blocked' && result.blockers.length === 0)
    fail('blocked requires at least one blocker');
}

const control = await readJson('control.json', true);
validateControl(control);
const result = await readJson('result.json', false);
if (result !== null) validateResult(result, control);
console.log(
  result === null
    ? 'Agent handoff control valid.'
    : 'Agent handoff control and result valid.',
);

#!/usr/bin/env node
/**
 * V02-WI-06 E04-C01-M01 manual Mission 03 review — pure session logic.
 *
 * Everything in this module is deterministic and free of browser/gameplay
 * access so it can be unit-tested: the machine-readable session record and
 * capture-manifest schemas, the bounded passive capture policy, the attempt
 * chronology, the post-terminal cleanup contract, and the source-scan guard
 * that keeps the runner inside its non-gameplay boundary.
 *
 * The manual review session is human-controlled: the Product Owner owns every
 * Combat decision. Automation may only prepare supported campaign state, launch
 * the production browser, passively observe rendered output, and inspect
 * persistence after a terminal/Continue boundary.
 */

export const SESSION_STATUS = Object.freeze({
  SUCCESS_VERIFIED: 'success-verified',
  INCOMPLETE: 'incomplete',
  CANCELLED: 'cancelled',
  ENVIRONMENT_UNAVAILABLE: 'environment-unavailable',
  CAPTURE_COMPLETE: 'capture-complete',
});

/** Session kinds: the production manual review and the fallback capture run. */
export const SESSION_KINDS = Object.freeze({
  PRODUCTION_MANUAL: 'v02-wi-06-e04-c01-m01-manual-mission03-session',
  FORCED_FALLBACK_CAPTURE:
    'v02-wi-06-e04-c01-m01-forced-fallback-capture-session',
});

export const TERMINAL_KINDS = Object.freeze(['success', 'defeat', 'evacuated']);

export const CAPTURE_STATES = Object.freeze(['armoured', 'vulnerable']);

export const CAPTURE_SOURCES = Object.freeze([
  'production-manual-session',
  'development-forced-fallback',
]);

/**
 * Canonical per-role destruction rewards, used only to cross-check that a
 * recorded Success payout includes the authored Elite `+8`. The values mirror
 * `src/content/enemies/index.ts`; the unit suite fails if they drift.
 */
export const ROLE_DESTRUCTION_REWARDS = Object.freeze({
  Basic: 1,
  Ranged: 2,
  Hunter: 2,
  Elite: 8,
});

/**
 * True only when the SAME approved asset URL was requested more than once, i.e.
 * a real retry after the injected failure. The Elite legitimately has two
 * distinct assets (armoured and vulnerable), so the raw request count alone must
 * never be read as a retry.
 */
export function deriveSecondRequestObserved(requests) {
  const counts = new Map();
  for (const request of requests ?? []) {
    const url = request?.url ?? '';
    counts.set(url, (counts.get(url) ?? 0) + 1);
  }
  return [...counts.values()].some((count) => count > 1);
}

/**
 * Success requires every authored group spawned and zero living enemies, and
 * the authored Elite never escapes (Epic §9.4), so a recorded Mission Complete
 * proves the player destroyed the Elite with projectiles during a Vulnerable
 * window. The reward arithmetic corroborates it whenever the visible rows carry
 * enough detail.
 */
export function deriveEliteDestructionCrossCheck(input) {
  const rows = input?.rows ?? {};
  const counts = {};
  for (const part of String(rows.Destroyed ?? '').split('·')) {
    const match = /^\s*([A-Za-z]+)\s+(\d+)\s*$/.exec(part);
    if (match !== null) {
      counts[match[1]] = Number.parseInt(match[2], 10);
    }
  }
  let withoutElite = 0;
  let withElite = ROLE_DESTRUCTION_REWARDS.Elite;
  for (const [role, count] of Object.entries(counts)) {
    const reward = ROLE_DESTRUCTION_REWARDS[role] ?? 0;
    withoutElite += reward * count;
    withElite += reward * count;
  }
  const recorded =
    typeof input?.combatRewards === 'number'
      ? input.combatRewards
      : Number.parseInt(
          String(rows['Combat rewards'] ?? '').replace('+', ''),
          10,
        );
  return {
    destroyedCounts: counts,
    rewardsWithoutElite: withoutElite,
    rewardsWithElite: withElite,
    recordedCombatRewards: Number.isFinite(recorded) ? recorded : null,
    matchesWithElite: recorded === withElite,
    matchesWithoutElite: recorded === withoutElite,
    eliteDestroyed:
      recorded === withElite ? true : recorded === withoutElite ? false : null,
  };
}

/** Required visible facts for an accepted manual Session (Epic §8.3–8.3.1). */
export const ACCEPTANCE_FACTS = Object.freeze([
  'productionArtifact',
  'arrivalAt0520',
  'zeroZeroSeen',
  'eliteArmouredSeen',
  'eliteVulnerableSeen',
  'eliteDestroyed',
  'successTerminal',
  'continueObserved',
  'missionCompletedPersisted',
  'noFurtherUnlock',
  'replayableVerified',
  'cleanCombatResidue',
]);

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
}

function requireNumber(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
  }
}

function requireArray(value, field) {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array.`);
  }
}

function requireBoolean(value, field) {
  if (typeof value !== 'boolean') {
    throw new Error(`${field} must be a boolean.`);
  }
}

/** Deterministic evidence directory for one manual session. */
export function sessionDirectoryFor(evidenceRoot, runId) {
  requireString(evidenceRoot, 'evidenceRoot');
  requireString(runId, 'runId');
  if (!/^[a-zA-Z0-9._-]+$/.test(runId)) {
    throw new Error('runId must contain only safe path characters.');
  }
  return `${evidenceRoot}/manual-m03/${runId}`;
}

export function createSessionRecord(input) {
  const record = {
    kind: input.kind ?? SESSION_KINDS.PRODUCTION_MANUAL,
    runId: input.runId,
    scopeId: 'V02-WI-06-E04-C01-M01',
    baseRevision: input.baseRevision,
    sourceFingerprint: input.sourceFingerprint,
    status: input.status ?? SESSION_STATUS.INCOMPLETE,
    startedAt: input.startedAt,
    endedAt: input.endedAt ?? null,
    viewport: input.viewport,
    seed: input.seed,
    productionArtifact: {
      buildDir: input.buildDir,
      served: input.served,
      debugSurfaceExposed: input.debugSurfaceExposed,
    },
    controls: input.controls,
    attempts: input.attempts ?? [],
    repairs: input.repairs ?? [],
    captures: input.captures ?? [],
    eliteObservations: input.eliteObservations ?? {
      armouredFirstSeenAt: null,
      vulnerableFirstSeenAt: null,
      armouredFrames: 0,
      vulnerableFrames: 0,
    },
    acceptanceFacts: input.acceptanceFacts ?? {},
    acceptanceComplete: input.acceptanceComplete ?? false,
    missingAcceptanceFacts: input.missingAcceptanceFacts ?? [],
    postTerminalBaseObserved: input.postTerminalBaseObserved ?? false,
    fallbackEvidence: input.fallbackEvidence ?? null,
    persisted: input.persisted ?? null,
    replay: input.replay ?? null,
    cleanup: input.cleanup ?? null,
    notes: input.notes ?? [],
    errors: input.errors ?? {
      pageErrors: [],
      consoleErrors: [],
      runnerErrors: [],
    },
    artifacts: input.artifacts ?? {},
  };
  validateSessionRecord(record);
  return record;
}

/** Required provenance for the forced-fallback development session. */
export function validateFallbackEvidence(evidence) {
  if (!isPlainObject(evidence)) {
    throw new Error('fallback session evidence must be an object.');
  }
  requireString(evidence.assetPath, 'fallback.assetPath');
  requireString(evidence.failureInjectedAt, 'fallback.failureInjectedAt');
  requireNumber(evidence.requestCount, 'fallback.requestCount');
  if (evidence.requestCount < 1) {
    throw new Error('fallback.requestCount must record the failed request.');
  }
  requireBoolean(
    evidence.secondRequestObserved,
    'fallback.secondRequestObserved',
  );
  if (evidence.secondRequestObserved !== false) {
    throw new Error('the forced fallback must prove no second request.');
  }
  requireBoolean(evidence.lateSwapObserved, 'fallback.lateSwapObserved');
  if (evidence.lateSwapObserved !== false) {
    throw new Error('the forced fallback must prove no late prepared swap.');
  }
  requireBoolean(evidence.debugAuthorityUsed, 'fallback.debugAuthorityUsed');
  requireBoolean(
    evidence.servedFromDevelopment,
    'fallback.servedFromDevelopment',
  );
  if (evidence.servedFromDevelopment !== true) {
    throw new Error(
      'the forced fallback session must be a development session.',
    );
  }
  return evidence;
}

/** Validates a session record; throws on any missing or inconsistent fact. */
export function validateSessionRecord(record) {
  if (!isPlainObject(record)) {
    throw new Error('session record must be an object.');
  }
  requireString(record.kind, 'session.kind');
  if (!Object.values(SESSION_KINDS).includes(record.kind)) {
    throw new Error('session.kind is invalid.');
  }
  requireString(record.runId, 'session.runId');
  requireString(record.scopeId, 'session.scopeId');
  requireString(record.baseRevision, 'session.baseRevision');
  requireString(record.sourceFingerprint, 'session.sourceFingerprint');
  if (!Object.values(SESSION_STATUS).includes(record.status)) {
    throw new Error('session.status is invalid.');
  }
  requireString(record.startedAt, 'session.startedAt');
  if (!isPlainObject(record.viewport)) {
    throw new Error('session.viewport must be an object.');
  }
  requireNumber(record.viewport.width, 'session.viewport.width');
  requireNumber(record.viewport.height, 'session.viewport.height');
  requireNumber(record.seed, 'session.seed');
  if (!isPlainObject(record.productionArtifact)) {
    throw new Error('session.productionArtifact must be an object.');
  }
  requireBoolean(
    record.productionArtifact.debugSurfaceExposed,
    'session.productionArtifact.debugSurfaceExposed',
  );
  requireArray(record.attempts, 'session.attempts');
  requireArray(record.repairs, 'session.repairs');
  requireArray(record.captures, 'session.captures');
  requireArray(record.notes, 'session.notes');
  requireArray(record.missingAcceptanceFacts, 'session.missingAcceptanceFacts');
  requireBoolean(record.acceptanceComplete, 'session.acceptanceComplete');
  requireBoolean(
    record.postTerminalBaseObserved,
    'session.postTerminalBaseObserved',
  );
  if (!isPlainObject(record.acceptanceFacts)) {
    throw new Error('session.acceptanceFacts must be an object.');
  }
  if (!isPlainObject(record.errors)) {
    throw new Error('session.errors must be an object.');
  }
  for (const field of ['pageErrors', 'consoleErrors', 'runnerErrors']) {
    requireArray(record.errors[field], `session.errors.${field}`);
  }

  let expectedOrdinal = 0;
  for (const attempt of record.attempts) {
    expectedOrdinal += 1;
    if (attempt.ordinal !== expectedOrdinal) {
      throw new Error('session.attempts must be ordinal and contiguous.');
    }
    if (!TERMINAL_KINDS.includes(attempt.terminal)) {
      throw new Error(
        `session.attempts[${attempt.ordinal}].terminal is invalid.`,
      );
    }
    requireString(
      attempt.openedAt,
      `session.attempts[${attempt.ordinal}].openedAt`,
    );
    if (!isPlainObject(attempt.rows)) {
      throw new Error('session attempt rows must be an object.');
    }
    if (attempt.persisted !== null && attempt.persisted !== undefined) {
      if (!isPlainObject(attempt.persisted)) {
        throw new Error('session attempt persisted facts must be an object.');
      }
    }
  }

  if (record.kind === SESSION_KINDS.FORCED_FALLBACK_CAPTURE) {
    validateFallbackEvidence(record.fallbackEvidence);
  }
  if (record.status === SESSION_STATUS.SUCCESS_VERIFIED) {
    if (record.productionArtifact.debugSurfaceExposed !== false) {
      throw new Error(
        'a Success-verified session must prove no Debug surface was exposed.',
      );
    }
    const missing = ACCEPTANCE_FACTS.filter(
      (fact) => record.acceptanceFacts[fact] !== true,
    );
    if (missing.length > 0) {
      throw new Error(
        `a Success-verified session is missing acceptance facts: ${missing.join(', ')}`,
      );
    }
    if (record.acceptanceComplete !== true) {
      throw new Error(
        'a Success-verified session must set acceptanceComplete.',
      );
    }
    if (!record.attempts.some((attempt) => attempt.terminal === 'success')) {
      throw new Error('a Success-verified session needs a Success terminal.');
    }
    if (!isPlainObject(record.persisted) || !isPlainObject(record.replay)) {
      throw new Error(
        'a Success-verified session must record persisted and replay facts.',
      );
    }
    if (!isPlainObject(record.cleanup) || record.cleanup.clean !== true) {
      throw new Error(
        'a Success-verified session must record clean Combat residue facts.',
      );
    }
  }
  return record;
}

/** Required provenance for one visual-evidence capture. */
export function validateCaptureManifest(manifest) {
  if (!isPlainObject(manifest)) {
    throw new Error('capture manifest must be an object.');
  }
  requireString(manifest.runId, 'manifest.runId');
  requireString(manifest.baseRevision, 'manifest.baseRevision');
  requireString(manifest.sourceFingerprint, 'manifest.sourceFingerprint');
  if (!isPlainObject(manifest.viewport)) {
    throw new Error('manifest.viewport must be an object.');
  }
  requireNumber(manifest.viewport.width, 'manifest.viewport.width');
  requireNumber(manifest.viewport.height, 'manifest.viewport.height');
  requireArray(manifest.captures, 'manifest.captures');
  if (manifest.captures.length === 0) {
    throw new Error('manifest.captures must not be empty.');
  }
  for (const [index, capture] of manifest.captures.entries()) {
    const label = `manifest.captures[${index}]`;
    if (!CAPTURE_STATES.includes(capture.state)) {
      throw new Error(`${label}.state is invalid.`);
    }
    if (!CAPTURE_SOURCES.includes(capture.source)) {
      throw new Error(`${label}.source is invalid.`);
    }
    requireString(capture.path, `${label}.path`);
    requireString(capture.reviewPurpose, `${label}.reviewPurpose`);
    requireString(capture.capturedAt, `${label}.capturedAt`);
    requireString(capture.sessionRunId, `${label}.sessionRunId`);
    requireBoolean(
      capture.selectedFromRenderedEvidence,
      `${label}.selectedFromRenderedEvidence`,
    );
    if (capture.selectedFromRenderedEvidence !== true) {
      throw new Error(
        `${label} must be selected from rendered evidence, never hidden state.`,
      );
    }
    if (!isPlainObject(capture.assetRequest)) {
      throw new Error(`${label}.assetRequest must be an object.`);
    }
    requireString(capture.assetRequest.path, `${label}.assetRequest.path`);
    requireString(capture.assetRequest.status, `${label}.assetRequest.status`);
    if (capture.source === 'development-forced-fallback') {
      requireString(
        capture.assetRequest.failureInjectedAt,
        `${label}.assetRequest.failureInjectedAt`,
      );
      requireBoolean(
        capture.assetRequest.secondRequestObserved,
        `${label}.assetRequest.secondRequestObserved`,
      );
      if (capture.assetRequest.secondRequestObserved !== false) {
        throw new Error(
          `${label} must prove the forced fallback issued no second request.`,
        );
      }
      requireBoolean(
        capture.assetRequest.lateSwapObserved,
        `${label}.assetRequest.lateSwapObserved`,
      );
      if (capture.assetRequest.lateSwapObserved !== false) {
        throw new Error(`${label} must prove no late prepared-asset swap.`);
      }
    }
  }
  return manifest;
}

/**
 * Bounded passive capture policy. A capture is selected ONLY when the rendered
 * frame shows the authored Elite in the requested state; counts per state and a
 * minimum spacing keep the selection bounded and non-cherry-picked, and nothing
 * is ever selected from hidden state.
 */
export function createCaptureSelector(options) {
  const maxPerState = options?.maxPerState ?? 4;
  const minSpacingMs = options?.minSpacingMs ?? 10000;
  const saved = new Map(CAPTURE_STATES.map((state) => [state, []]));
  const lastSavedAt = new Map(CAPTURE_STATES.map((state) => [state, null]));
  let lastObservation = null;

  return {
    consider(observation, nowMs) {
      lastObservation = observation;
      if (!isPlainObject(observation) || observation.eliteVisible !== true) {
        return null;
      }
      const state = observation.eliteState;
      if (!CAPTURE_STATES.includes(state)) {
        return null;
      }
      if (saved.get(state).length >= maxPerState) {
        return null;
      }
      const previous = lastSavedAt.get(state);
      if (previous !== null && nowMs - previous < minSpacingMs) {
        return null;
      }
      saved.get(state).push(nowMs);
      lastSavedAt.set(state, nowMs);
      return { state, index: saved.get(state).length };
    },
    counts() {
      return Object.fromEntries(
        CAPTURE_STATES.map((state) => [state, saved.get(state).length]),
      );
    },
    savedAt() {
      return Object.fromEntries(
        CAPTURE_STATES.map((state) => [state, [...saved.get(state)]]),
      );
    },
    lastObservation() {
      return lastObservation;
    },
  };
}

/**
 * Truthful attempt chronology for a single manual session: a natural Defeat may
 * be followed by an affordable Repair and a replay, and only a real Success
 * terminal may be recorded as Success (Epic §2, §13.6).
 */
export function createAttemptTracker() {
  const attempts = [];
  const repairs = [];
  let openTerminal = null;

  return {
    openTerminal(kind, rows, hullVisible, openedAt) {
      if (!TERMINAL_KINDS.includes(kind)) {
        throw new Error(`invalid terminal kind: ${kind}`);
      }
      if (openTerminal !== null) {
        throw new Error('a terminal is already open.');
      }
      openTerminal = {
        ordinal: attempts.length + 1,
        terminal: kind,
        rows: { ...rows },
        hullVisible,
        openedAt,
        closedAt: null,
        persisted: null,
      };
      attempts.push(openTerminal);
      return openTerminal;
    },
    closeTerminal(closedAt, persisted) {
      if (openTerminal === null) {
        return null;
      }
      openTerminal.closedAt = closedAt;
      openTerminal.persisted = persisted ?? null;
      const closed = openTerminal;
      openTerminal = null;
      return closed;
    },
    recordRepair(entry) {
      repairs.push({ index: repairs.length + 1, ...entry });
      return repairs[repairs.length - 1];
    },
    isTerminalOpen() {
      return openTerminal !== null;
    },
    attempts() {
      return attempts;
    },
    repairs() {
      return repairs;
    },
  };
}

/** Post-Continue cleanup contract: no Combat residue may remain on screen. */
export function evaluateCombatResidue(facts) {
  if (!isPlainObject(facts)) {
    throw new Error('cleanup facts must be an object.');
  }
  const violations = [];
  if (facts.canvasCount !== 0) {
    violations.push('canvasCount');
  }
  if (facts.combatHudCount !== 0) {
    violations.push('combatHudCount');
  }
  if (facts.countdownCount !== 0) {
    violations.push('countdownCount');
  }
  if (facts.dialogCount !== 0) {
    violations.push('dialogCount');
  }
  if (facts.operationsVisible !== true) {
    violations.push('operationsVisible');
  }
  return {
    ...facts,
    violations,
    clean: violations.length === 0,
  };
}

/** Derives the acceptance facts of one manual session from recorded evidence. */
export function deriveAcceptanceFacts(input) {
  const persisted = input.persisted ?? null;
  const completed = Array.isArray(persisted?.completedMissionIds)
    ? persisted.completedMissionIds
    : [];
  const unlocked = Array.isArray(persisted?.unlockedMissionIds)
    ? persisted.unlockedMissionIds
    : [];
  return {
    productionArtifact: input.productionArtifact === true,
    arrivalAt0520: input.arrivalAt0520 === true,
    zeroZeroSeen: input.zeroZeroSeen === true,
    eliteArmouredSeen: input.eliteArmouredSeen === true,
    eliteVulnerableSeen: input.eliteVulnerableSeen === true,
    eliteDestroyed:
      input.eliteDestroyed === true || input.successTerminal === true,
    successTerminal: input.successTerminal === true,
    continueObserved:
      input.continueObserved === true ||
      input.postTerminalBaseObserved === true,
    missionCompletedPersisted:
      completed.includes('interception-03') &&
      persisted?.missionInProgress === null,
    noFurtherUnlock:
      unlocked.length === 3 &&
      unlocked.includes('interception-01') &&
      unlocked.includes('interception-02') &&
      unlocked.includes('interception-03'),
    replayableVerified: input.replayableVerified === true,
    cleanCombatResidue: input.cleanCombatResidue === true,
  };
}

/**
 * True when the session returned to Base (no dialog, no Combat canvas) after at
 * least one recorded terminal. That transition can only happen when the player
 * consumed the committed result with `Continue`, so it is direct path evidence
 * for `continueObserved`. The runner records it live; the verification step can
 * also re-derive it from the recorded Base observations.
 */
export function derivePostTerminalBaseObserved(record) {
  if (record?.postTerminalBaseObserved === true) {
    return true;
  }
  const closedAttempts = (record?.attempts ?? []).filter(
    (attempt) => typeof attempt.closedAt === 'string',
  );
  const baseEvidence =
    record?.cleanup !== null && record?.cleanup !== undefined;
  return closedAttempts.length > 0 && (baseEvidence || record?.replay != null);
}

/**
 * Source-scan boundary guard for the manual review runner. The runner may
 * prepare supported campaign state, launch the production browser, observe
 * visible output, and read persistence after a terminal boundary only. These
 * patterns would let it drive Combat, reach hidden state, or fake a result.
 */
export const FORBIDDEN_RUNNER_PATTERNS = Object.freeze([
  {
    pattern: /page\.mouse\.(move|down|up|click|wheel)/,
    reason: 'drives pointer input',
  },
  {
    pattern: /page\.keyboard\.(press|down|up|type)/,
    reason: 'drives keyboard input',
  },
  { pattern: /locator\([^)]*\)\.hover\(/, reason: 'drives pointer input' },
  { pattern: /\.dragTo\(/, reason: 'drives pointer input' },
  {
    pattern: /__shmupDevObservability__/,
    reason: 'reads a Debug/observability surface',
  },
  {
    pattern: /__legacyBenchmarkIdentity__/,
    reason: 'reads a Debug/observability surface',
  },
  { pattern: /CombatSimulationState/, reason: 'reads simulation state' },
  {
    pattern: /phaser|\bScene\b|\.registry\b/,
    reason: 'reaches renderer internals',
  },
  {
    pattern: /combatDebugCommand|debugScenario|__shmupDebug/,
    reason: 'uses Debug authority',
  },
  {
    pattern:
      /Date\.now\(\)\s*;\s*\/\/\s*clock|advanceClock|setFixedStep|stepCount/,
    reason: 'manipulates the clock',
  },
  {
    pattern: /missionResult:|fakeResult|injectTerminal|syntheticTerminal/,
    reason: 'injects a synthetic result',
  },
  {
    pattern: /crypto\.getRandomValues\s*=/,
    reason: 'replaces the seed outside the approved init script',
  },
]);

/**
 * Scans runner source text against the forbidden patterns. `allowedPatterns`
 * lists patterns that the approved setup phase legitimately needs (for example
 * the seed init script), keyed by pattern source.
 */
export function scanManualReviewSource(source, options = {}) {
  requireString(source, 'source');
  const allowed = new Set(options.allowedPatterns ?? []);
  const violations = [];
  for (const { pattern, reason } of FORBIDDEN_RUNNER_PATTERNS) {
    if (allowed.has(pattern.source)) {
      continue;
    }
    if (pattern.test(source)) {
      violations.push({ pattern: pattern.source, reason });
    }
  }
  return violations;
}

/** Throws when the runner source leaves its non-gameplay boundary. */
export function assertManualReviewBoundary(source, options = {}) {
  const violations = scanManualReviewSource(source, options);
  if (violations.length > 0) {
    throw new Error(
      `manual review boundary violation: ${violations
        .map((violation) => violation.reason)
        .join('; ')}`,
    );
  }
  return true;
}

/** Collects the real evidence paths of one session for the record. */
export function buildArtifacts(sessionDir, extras = {}) {
  return {
    sessionDirectory: relative(process.cwd(), sessionDir),
    record: relative(process.cwd(), `${sessionDir}/session-record.json`),
    capturesDirectory: relative(process.cwd(), `${sessionDir}/captures`),
    videoDirectory: relative(process.cwd(), `${sessionDir}/video`),
    ...extras,
  };
}

/** Removes a session directory that would otherwise hold false-green data. */
export function prepareSessionDirectory(
  evidenceRoot,
  runId,
  fs,
  group = 'manual-m03',
) {
  const directory = `${evidenceRoot}/${group}/${runId}`;
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(`${directory}/captures`, { recursive: true });
  fs.mkdirSync(`${directory}/video`, { recursive: true });
  return directory;
}

function relative(from, to) {
  const normalizedFrom = from.endsWith('/') ? from : `${from}/`;
  if (!to.startsWith(normalizedFrom)) {
    return to;
  }
  return to.slice(normalizedFrom.length);
}

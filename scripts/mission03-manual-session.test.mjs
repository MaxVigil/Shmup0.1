import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ACCEPTANCE_FACTS,
  CAPTURE_SOURCES,
  CLIPPED_ELITE_ACCEPT_AFTER_MS,
  D04_CAPTURE_FACTS,
  D04_SCOPE_ID,
  FORBIDDEN_RUNNER_PATTERNS,
  ROLE_DESTRUCTION_REWARDS,
  SESSION_KINDS,
  SESSION_STATUS,
  assertManualReviewBoundary,
  buildArtifacts,
  buildD04CaptureManifest,
  createAttemptTracker,
  createCaptureSelector,
  createSessionRecord,
  deriveAcceptanceFacts,
  deriveD04CaptureFacts,
  deriveEliteCaptureOffer,
  deriveEliteDestructionCrossCheck,
  deriveElitePhasePair,
  derivePostTerminalBaseObserved,
  deriveSecondRequestObserved,
  evaluateCombatResidue,
  prepareSessionDirectory,
  scanManualReviewSource,
  sessionDirectoryFor,
  validateCaptureManifest,
  validateD04CaptureManifest,
  validateD04FallbackEvidence,
  validateSessionRecord,
} from './mission03-manual-session.mjs';
import {
  D04_CANDIDATE_DIGEST_METHOD,
  computeCandidateDigest,
  parsePorcelainPaths,
} from './evidence-d04-candidate.mjs';
import {
  BASIC_DRONE,
  ELITE_DRONE,
  HUNTER_DRONE,
  RANGED_DRONE,
} from '../src/content/enemies/index.ts';

const RUNNER_SOURCE_PATH = 'scripts/mission03-manual-review.mjs';
/** The only approved source exception: the fixed-seed init script. */
const SEED_INIT_EXCEPTION = ['crypto\\.getRandomValues\\s*='];

function validInput(overrides = {}) {
  return {
    runId: 'v02-wi-06-e04-c01-m01-abc1234-20260918',
    baseRevision: 'd'.repeat(40),
    sourceFingerprint: '12345678',
    startedAt: '2026-09-18T10:00:00.000Z',
    viewport: { width: 1280, height: 600 },
    seed: 19023,
    buildDir: 'dist',
    served: 'http://127.0.0.1:4180',
    debugSurfaceExposed: false,
    controls: 'Product Owner pointer/keyboard only',
    ...overrides,
  };
}

describe('manual Mission 03 review session record (V02-WI-06 E04-C01-M01)', () => {
  it('accepts a complete manual session record', () => {
    const record = createSessionRecord(
      validInput({ status: SESSION_STATUS.INCOMPLETE }),
    );
    expect(record.scopeId).toBe('V02-WI-06-E04-C01-M01');
    expect(record.seed).toBe(19023);
    expect(record.status).toBe(SESSION_STATUS.INCOMPLETE);
    expect(record.acceptanceComplete).toBe(false);
  });

  it('rejects an unidentified session and records Debug-surface observations', () => {
    expect(() =>
      createSessionRecord(validInput({ sourceFingerprint: '' })),
    ).toThrow(/sourceFingerprint/);
    expect(() => createSessionRecord(validInput({ seed: Number.NaN }))).toThrow(
      /seed/,
    );
    // An unfinished session may truthfully record an observed Debug surface;
    // a Success-verified session may not.
    const observed = createSessionRecord(
      validInput({ debugSurfaceExposed: true }),
    );
    expect(observed.productionArtifact.debugSurfaceExposed).toBe(true);
    expect(() =>
      createSessionRecord(
        validInput({
          debugSurfaceExposed: true,
          status: SESSION_STATUS.SUCCESS_VERIFIED,
          acceptanceComplete: true,
          acceptanceFacts: Object.fromEntries(
            ACCEPTANCE_FACTS.map((fact) => [fact, true]),
          ),
          persisted: {
            missionInProgress: null,
            completedMissionIds: [],
            unlockedMissionIds: [],
          },
          replay: { started: true },
          cleanup: { clean: true },
          attempts: [
            { ordinal: 1, terminal: 'success', rows: {}, openedAt: 'now' },
          ],
        }),
      ),
    ).toThrow(/prove no Debug surface/);
  });

  it('refuses a Success claim that lacks any required visible or persisted fact', () => {
    const completeFacts = Object.fromEntries(
      ACCEPTANCE_FACTS.map((fact) => [fact, true]),
    );
    const successInput = validInput({
      status: SESSION_STATUS.SUCCESS_VERIFIED,
      acceptanceComplete: true,
      acceptanceFacts: completeFacts,
      persisted: {
        credits: 51,
        hullIntegrity: 100,
        missionInProgress: null,
        completedMissionIds: [
          'interception-01',
          'interception-02',
          'interception-03',
        ],
        unlockedMissionIds: [
          'interception-01',
          'interception-02',
          'interception-03',
        ],
      },
      replay: { started: true, countdownText: '05:20', attemptId: 4 },
      cleanup: { clean: true },
      attempts: [
        {
          ordinal: 1,
          terminal: 'success',
          rows: { 'Credits earned': '+38 Credits' },
          openedAt: '2026-09-18T10:05:00.000Z',
          closedAt: null,
          persisted: null,
        },
      ],
    });
    expect(
      validateSessionRecord(createSessionRecord(successInput)),
    ).toBeTruthy();
    for (const fact of ACCEPTANCE_FACTS) {
      const partial = { ...completeFacts, [fact]: false };
      expect(() =>
        createSessionRecord({ ...successInput, acceptanceFacts: partial }),
      ).toThrow(new RegExp(fact));
    }
    expect(() =>
      createSessionRecord({
        ...successInput,
        attempts: [
          {
            ordinal: 1,
            terminal: 'defeat',
            rows: {},
            openedAt: 'now',
            closedAt: 'later',
            persisted: null,
          },
        ],
      }),
    ).toThrow(/Success terminal/);
    expect(() =>
      createSessionRecord({ ...successInput, cleanup: { clean: false } }),
    ).toThrow(/clean Combat residue/);
  });

  it('requires ordinal, contiguous, truthful attempt chronology', () => {
    expect(() =>
      createSessionRecord(
        validInput({
          attempts: [
            {
              ordinal: 2,
              terminal: 'defeat',
              rows: {},
              openedAt: 'now',
              closedAt: 'later',
              persisted: {},
            },
          ],
        }),
      ),
    ).toThrow(/ordinal and contiguous/);
    expect(() =>
      createSessionRecord(
        validInput({
          attempts: [
            { ordinal: 1, terminal: 'victory', rows: {}, openedAt: 'now' },
          ],
        }),
      ),
    ).toThrow(/terminal is invalid/);
  });
});

function validCapture(overrides = {}) {
  return {
    state: 'armoured',
    source: CAPTURE_SOURCES[0],
    path: '.agent-handoff/evidence/manual-m03/run/captures/armoured-1.png',
    reviewPurpose: 'WI-06 E04 prepared Elite Armoured state at 1280x600',
    capturedAt: '2026-09-18T10:02:00.000Z',
    sessionRunId: 'v02-wi-06-e04-c01-m01-abc1234-20260918',
    selectedFromRenderedEvidence: true,
    assetRequest: {
      path: 'assets/enemies/elite-drone.png',
      status: 'prepared',
    },
    ...overrides,
  };
}

function buildManifest(capture) {
  return {
    runId: 'r',
    baseRevision: 'd'.repeat(40),
    sourceFingerprint: 'f',
    viewport: { width: 1280, height: 600 },
    captures: [capture],
  };
}

describe('visual-evidence capture manifest (V02-WI-06 E04-C01-M01)', () => {
  it('accepts a complete manifest for prepared gameplay captures', () => {
    expect(validateCaptureManifest(buildManifest(validCapture()))).toBeTruthy();
  });

  it('rejects captures that are not selected from rendered evidence', () => {
    expect(() =>
      validateCaptureManifest(
        buildManifest(validCapture({ selectedFromRenderedEvidence: false })),
      ),
    ).toThrow(/rendered evidence/);
    expect(() =>
      validateCaptureManifest({
        ...buildManifest(validCapture()),
        captures: [],
      }),
    ).toThrow(/must not be empty/);
    expect(() =>
      validateCaptureManifest(buildManifest(validCapture({ state: 'idle' }))),
    ).toThrow(/state is invalid/);
  });

  it('requires the forced-fallback capture to prove its request boundary', () => {
    const fallback = validCapture({
      source: CAPTURE_SOURCES[1],
      assetRequest: {
        path: 'assets/enemies/elite-drone.png',
        status: 'fallback',
        failureInjectedAt: 'pre-Boot preload',
        secondRequestObserved: false,
        lateSwapObserved: false,
      },
    });
    expect(validateCaptureManifest(buildManifest(fallback))).toBeTruthy();
    expect(() =>
      validateCaptureManifest(
        buildManifest({
          ...fallback,
          assetRequest: {
            ...fallback.assetRequest,
            secondRequestObserved: true,
          },
        }),
      ),
    ).toThrow(/no second request/);
    expect(() =>
      validateCaptureManifest(
        buildManifest({
          ...fallback,
          assetRequest: { ...fallback.assetRequest, lateSwapObserved: true },
        }),
      ),
    ).toThrow(/late prepared-asset swap/);
    expect(() =>
      validateCaptureManifest(
        buildManifest({
          ...fallback,
          assetRequest: {
            path: 'assets/enemies/elite-drone.png',
            status: 'fallback',
          },
        }),
      ),
    ).toThrow(/failureInjectedAt/);
  });
});

describe('bounded passive capture policy (V02-WI-06 E04-C01-M01)', () => {
  it('selects only rendered Elite states, bounded and spaced', () => {
    const selector = createCaptureSelector({
      maxPerState: 2,
      minSpacingMs: 10000,
    });
    expect(
      selector.consider({ eliteVisible: false, eliteState: null }, 1000),
    ).toBeNull();
    expect(
      selector.consider({ eliteVisible: true, eliteState: 'unknown' }, 1100),
    ).toBeNull();
    expect(
      selector.consider({ eliteVisible: true, eliteState: 'armoured' }, 1200),
    ).toEqual({ state: 'armoured', index: 1 });
    expect(
      selector.consider({ eliteVisible: true, eliteState: 'armoured' }, 5000),
    ).toBeNull();
    expect(
      selector.consider({ eliteVisible: true, eliteState: 'vulnerable' }, 6000),
    ).toEqual({ state: 'vulnerable', index: 1 });
    expect(
      selector.consider({ eliteVisible: true, eliteState: 'armoured' }, 13000),
    ).toEqual({ state: 'armoured', index: 2 });
    expect(
      selector.consider({ eliteVisible: true, eliteState: 'armoured' }, 25000),
    ).toBeNull();
    expect(selector.counts()).toEqual({ armoured: 2, vulnerable: 1 });
    expect(selector.savedAt().vulnerable).toEqual([6000]);
  });
});

describe('manual session attempt chronology (V02-WI-06 E04-C01-M01)', () => {
  it('records a natural Defeat, its Repair, a replay and the eventual Success', () => {
    const tracker = createAttemptTracker();
    tracker.openTerminal(
      'defeat',
      { 'Mission reward': '0 Credits', 'Credits earned': '+0 Credits' },
      0,
      '2026-09-18T10:04:00.000Z',
    );
    expect(tracker.isTerminalOpen()).toBe(true);
    tracker.closeTerminal('2026-09-18T10:04:20.000Z', {
      credits: 42,
      hullIntegrity: 0,
      missionInProgress: null,
    });
    tracker.recordRepair({
      at: '2026-09-18T10:05:00.000Z',
      cost: 8,
      creditsBefore: 42,
      creditsAfter: 34,
      hullBefore: 0,
      hullAfter: 100,
    });
    tracker.openTerminal(
      'success',
      { 'Credits earned': '+38 Credits' },
      100,
      's',
    );
    tracker.closeTerminal('2026-09-18T10:12:00.000Z', { credits: 51 });
    const attempts = tracker.attempts();
    expect(attempts.map((attempt) => attempt.terminal)).toEqual([
      'defeat',
      'success',
    ]);
    expect(attempts.map((attempt) => attempt.ordinal)).toEqual([1, 2]);
    expect(tracker.repairs()).toHaveLength(1);
    expect(() => tracker.openTerminal('success', {}, 10, 's')).not.toThrow();
    expect(() => tracker.openTerminal('success', {}, 10, 's')).toThrow(
      /already open/,
    );
    expect(() => tracker.openTerminal('victory', {}, 10, 's')).toThrow(
      /invalid terminal kind/,
    );
  });
});

describe('post-Continue cleanup and acceptance derivation (V02-WI-06 E04-C01-M01)', () => {
  it('flags Combat residue and requires completed/replayable persisted facts', () => {
    expect(
      evaluateCombatResidue({
        operationsVisible: true,
        canvasCount: 0,
        combatHudCount: 0,
        countdownCount: 0,
        dialogCount: 0,
      }).clean,
    ).toBe(true);
    const residue = evaluateCombatResidue({
      operationsVisible: false,
      canvasCount: 1,
      combatHudCount: 1,
      countdownCount: 0,
      dialogCount: 1,
    });
    expect(residue.clean).toBe(false);
    expect(residue.violations).toEqual([
      'canvasCount',
      'combatHudCount',
      'dialogCount',
      'operationsVisible',
    ]);

    const facts = deriveAcceptanceFacts({
      productionArtifact: true,
      arrivalAt0520: true,
      zeroZeroSeen: true,
      eliteArmouredSeen: true,
      eliteVulnerableSeen: true,
      successTerminal: true,
      continueObserved: true,
      replayableVerified: true,
      cleanCombatResidue: true,
      persisted: {
        missionInProgress: null,
        completedMissionIds: [
          'interception-01',
          'interception-02',
          'interception-03',
        ],
        unlockedMissionIds: [
          'interception-01',
          'interception-02',
          'interception-03',
        ],
      },
    });
    expect(facts.missionCompletedPersisted).toBe(true);
    expect(facts.noFurtherUnlock).toBe(true);
    expect(
      deriveAcceptanceFacts({
        persisted: {
          missionInProgress: { missionId: 'interception-03', attemptId: 2 },
          completedMissionIds: ['interception-01'],
          unlockedMissionIds: ['interception-04'],
        },
      }).missionCompletedPersisted,
    ).toBe(false);
  });
});

describe('Elite destruction evidence (V02-WI-06 E04-C01-M01)', () => {
  it('keeps the reward table identical to the canonical content definitions', () => {
    expect(ROLE_DESTRUCTION_REWARDS.Basic).toBe(
      BASIC_DRONE.playerDestructionReward,
    );
    expect(ROLE_DESTRUCTION_REWARDS.Ranged).toBe(
      RANGED_DRONE.playerDestructionReward,
    );
    expect(ROLE_DESTRUCTION_REWARDS.Hunter).toBe(
      HUNTER_DRONE.playerDestructionReward,
    );
    expect(ROLE_DESTRUCTION_REWARDS.Elite).toBe(
      ELITE_DRONE.playerDestructionReward,
    );
    expect(ELITE_DRONE.playerDestructionReward).toBe(8);
  });

  it('proves the Elite payout from the visible result rows', () => {
    const withElite = deriveEliteDestructionCrossCheck({
      rows: {
        Destroyed: 'Basic 9 · Ranged 4 · Hunter 3',
        'Combat rewards': '+31 Credits',
      },
    });
    expect(withElite.rewardsWithoutElite).toBe(23);
    expect(withElite.rewardsWithElite).toBe(31);
    expect(withElite.eliteDestroyed).toBe(true);
    const withoutElite = deriveEliteDestructionCrossCheck({
      rows: {
        Destroyed: 'Basic 9 · Ranged 4 · Hunter 3',
        'Combat rewards': '+23 Credits',
      },
    });
    expect(withoutElite.eliteDestroyed).toBe(false);
    const inconclusive = deriveEliteDestructionCrossCheck({
      rows: {
        Destroyed: 'Basic 10 · Ranged 4 · Hunter 2',
        'Combat rewards': '+20 Credits',
      },
    });
    expect(inconclusive.eliteDestroyed).toBeNull();
    expect(inconclusive.recordedCombatRewards).toBe(20);
  });

  it('requires Elite destruction for any Success acceptance claim', () => {
    const base = {
      productionArtifact: true,
      arrivalAt0520: true,
      zeroZeroSeen: true,
      eliteArmouredSeen: true,
      eliteVulnerableSeen: true,
      successTerminal: true,
      continueObserved: true,
      replayableVerified: true,
      cleanCombatResidue: true,
      persisted: {
        missionInProgress: null,
        completedMissionIds: [
          'interception-01',
          'interception-02',
          'interception-03',
        ],
        unlockedMissionIds: [
          'interception-01',
          'interception-02',
          'interception-03',
        ],
      },
    };
    const aligned = deriveAcceptanceFacts(base);
    expect(aligned.eliteDestroyed).toBe(true);
    expect(Object.values(aligned).every((fact) => fact === true)).toBe(true);
  });

  it('re-derives continueObserved from the recorded post-terminal Base state', () => {
    const record = {
      attempts: [
        {
          ordinal: 1,
          terminal: 'defeat',
          closedAt: '2026-09-18T10:00:00.000Z',
        },
        {
          ordinal: 2,
          terminal: 'success',
          closedAt: '2026-09-18T10:10:00.000Z',
        },
      ],
      cleanup: { clean: true },
      replay: { startedFromCompletedOperations: true },
    };
    expect(derivePostTerminalBaseObserved(record)).toBe(true);
    expect(
      derivePostTerminalBaseObserved({ attempts: [], cleanup: null }),
    ).toBe(false);
    expect(
      deriveAcceptanceFacts({
        postTerminalBaseObserved: true,
        successTerminal: true,
      }).continueObserved,
    ).toBe(true);
    expect(
      deriveAcceptanceFacts({ continueObserved: false }).continueObserved,
    ).toBe(false);
  });
});

describe('manual runner boundary and artifact hygiene (V02-WI-06 E04-C01-M01)', () => {
  it('keeps the real runner inside its non-gameplay boundary', () => {
    const source = readFileSync(RUNNER_SOURCE_PATH, 'utf8');
    expect(
      scanManualReviewSource(source, { allowedPatterns: SEED_INIT_EXCEPTION }),
    ).toEqual([]);
    // The guard is not vacuous: a synthetic combat-input or hidden-state read
    // must be detected.
    const violations = scanManualReviewSource(
      'await page.mouse.move(10, 10);\nconst s = window.__shmupDevObservability__;',
    );
    expect(violations.map((entry) => entry.reason)).toEqual([
      'drives pointer input',
      'reads a Debug/observability surface',
    ]);
    expect(() =>
      assertManualReviewBoundary('await page.keyboard.press("F");'),
    ).toThrow(/drives keyboard input/);
    expect(FORBIDDEN_RUNNER_PATTERNS.length).toBeGreaterThan(8);
  });

  it('requires the forced-fallback session to prove its request boundary', () => {
    const fallbackInput = {
      ...validInput({ debugSurfaceExposed: false }),
      kind: SESSION_KINDS.FORCED_FALLBACK_CAPTURE,
      status: SESSION_STATUS.CAPTURE_COMPLETE,
      fallbackEvidence: {
        assetPath: 'assets/runtime/enemies/elite-drone-*.png',
        failureInjectedAt: 'pre-Boot navigation',
        requestCount: 1,
        secondRequestObserved: false,
        lateSwapObserved: false,
        debugAuthorityUsed: false,
        servedFromDevelopment: true,
      },
    };
    expect(createSessionRecord(fallbackInput).status).toBe(
      SESSION_STATUS.CAPTURE_COMPLETE,
    );
    for (const broken of [
      { secondRequestObserved: true },
      { lateSwapObserved: true },
      { requestCount: 0 },
      { servedFromDevelopment: false },
    ]) {
      expect(() =>
        createSessionRecord({
          ...fallbackInput,
          fallbackEvidence: { ...fallbackInput.fallbackEvidence, ...broken },
        }),
      ).toThrow();
    }
    expect(() =>
      createSessionRecord({ ...fallbackInput, kind: 'unknown-session' }),
    ).toThrow(/session.kind/);
    expect(() =>
      createSessionRecord({ ...fallbackInput, fallbackEvidence: null }),
    ).toThrow(/fallback session evidence/);
  });

  it('treats only a repeated asset URL as a second request', () => {
    expect(
      deriveSecondRequestObserved([
        { url: 'http://x/enemies/elite-drone-armoured.png' },
        { url: 'http://x/enemies/elite-drone-vulnerable.png' },
      ]),
    ).toBe(false);
    expect(
      deriveSecondRequestObserved([
        { url: 'http://x/enemies/elite-drone-armoured.png' },
        { url: 'http://x/enemies/elite-drone-armoured.png' },
      ]),
    ).toBe(true);
    expect(deriveSecondRequestObserved([])).toBe(false);
  });

  it('keeps the fallback session directory separate from the manual session', () => {
    const root = '/tmp/manual-root';
    const fs = { mkdirSync: () => undefined, rmSync: () => undefined };
    expect(
      prepareSessionDirectory(root, 'run-2', fs, 'manual-m03-fallback'),
    ).toBe('/tmp/manual-root/manual-m03-fallback/run-2');
  });

  it('documents one runnable command and no committed failing gate', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(packageJson.scripts['evidence:mission03-manual']).toBe(
      'node scripts/mission03-manual-review.mjs',
    );
    const smoke = readFileSync('e2e/production-smoke.spec.ts', 'utf8');
    expect(smoke).not.toContain('pixel-only pilot');
  });

  it('creates a clean session directory and removes stale captures', () => {
    const root = mkdtempSync(join(tmpdir(), 'manual-m03-'));
    try {
      const directory = prepareSessionDirectory(root, 'run-1', {
        mkdirSync,
        rmSync,
      });
      const stale = join(directory, 'captures', 'stale.png');
      writeFileSync(stale, 'stale');
      expect(
        buildArtifacts(directory).record.endsWith('session-record.json'),
      ).toBe(true);
      const again = prepareSessionDirectory(root, 'run-1', {
        mkdirSync,
        rmSync,
      });
      expect(again).toBe(directory);
      expect(() => readFileSync(stale)).toThrow();
      expect(sessionDirectoryFor(root, 'run-1')).toBe(
        `${root}/manual-m03/run-1`,
      );
      expect(() => sessionDirectoryFor(root, '../escape')).toThrow(
        /safe path characters/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('V02-WI-07 D04-C01 Elite production capture contract', () => {
  const HEAD = 'a'.repeat(40);
  const SHA_ARMOURED = 'b'.repeat(64);
  const SHA_VULNERABLE = 'c'.repeat(64);
  const RUN_ID = 'v02-wi-07-d04-c01-elite-prepared-abc1234-20260926120000';
  const FALLBACK_RUN_ID =
    'v02-wi-07-d04-c01-elite-fallback-abc1234-20260926130000';

  function captureFor(runId, state, sha256, capturedAt, source, extra = {}) {
    return {
      state,
      source,
      path: `manual-m03-d04/${runId}/captures/${state}-1.png`,
      sha256,
      capturedAt,
      sessionRunId: runId,
      selectedFromRenderedEvidence: true,
      visibleFacts: { eliteCenterX: 640, eliteTop: 120 },
      ...extra,
    };
  }

  function d04Input(runId = RUN_ID, overrides = {}) {
    return {
      runId,
      baseRevision: HEAD,
      sourceFingerprint: 'deadbeef',
      candidateDigest: 'cafebabe',
      candidateDigestMethod: D04_CANDIDATE_DIGEST_METHOD,
      buildIdentity: '[shmup] build shmup@0.1.0 (abc1234-dirty)',
      buildDir: 'dist',
      servedFrom: 'http://127.0.0.1:4180',
      requestFailureMode: 'none',
      debugSurfaceExposed: false,
      capturePolicy:
        'Elite captures are offered only after the authored 05:20 arrival has been observed.',
      viewport: { width: 1280, height: 600 },
      requests: [],
      captures: [
        captureFor(
          runId,
          'armoured',
          SHA_ARMOURED,
          '2026-09-26T12:00:00.000Z',
          'production-d04-elite-prepared',
        ),
        captureFor(
          runId,
          'vulnerable',
          SHA_VULNERABLE,
          '2026-09-26T12:00:20.000Z',
          'production-d04-elite-prepared',
        ),
      ],
      phaseTransition: {
        observed: true,
        armouredCapturedAt: '2026-09-26T12:00:00.000Z',
        vulnerableCapturedAt: '2026-09-26T12:00:20.000Z',
      },
      ...overrides,
    };
  }

  function fallbackInput(runId = FALLBACK_RUN_ID) {
    const requests = [
      {
        url: 'http://127.0.0.1:4180/enemies/elite-drone-armoured.png',
        generation: 2,
        at: '2026-09-26T13:00:00.000Z',
      },
      {
        url: 'http://127.0.0.1:4180/enemies/elite-drone-vulnerable.png',
        generation: 2,
        at: '2026-09-26T13:00:00.000Z',
      },
    ];
    const failure = {
      failureInjectedAt: 'pre-Boot navigation (route installed before goto)',
      requestCount: 2,
      secondRequestObserved: false,
      lateSwapObserved: false,
    };
    return d04Input(runId, {
      requestFailureMode: 'elite-preload-abort',
      requests,
      assetRequestCount: requests.length,
      secondRequestObserved: false,
      lateSwapObserved: false,
      captures: [
        captureFor(
          runId,
          'armoured',
          SHA_ARMOURED,
          '2026-09-26T13:01:00.000Z',
          'production-d04-forced-fallback',
          failure,
        ),
        captureFor(
          runId,
          'vulnerable',
          SHA_VULNERABLE,
          '2026-09-26T13:01:20.000Z',
          'production-d04-forced-fallback',
          failure,
        ),
      ],
    });
  }

  it('accepts a prepared-sprite manifest and a production forced-fallback manifest', () => {
    expect(buildD04CaptureManifest(d04Input()).scopeId).toBe(D04_SCOPE_ID);
    const fallback = buildD04CaptureManifest(fallbackInput());
    expect(fallback.requestFailureMode).toBe('elite-preload-abort');
    expect(fallback.assetRequestCount).toBe(2);
    expect(deriveSecondRequestObserved(fallback.requests)).toBe(false);
  });

  it('rejects a D04 manifest that is not a production session with both states and a real transition', () => {
    for (const broken of [
      { buildDir: 'development server' },
      { debugSurfaceExposed: true },
      { requestFailureMode: 'bogus' },
      { candidateDigestMethod: '' },
      {
        captures: [
          captureFor(
            RUN_ID,
            'armoured',
            SHA_ARMOURED,
            '2026-09-26T12:00:00.000Z',
            'production-d04-elite-prepared',
          ),
        ],
      },
      {
        phaseTransition: {
          observed: true,
          armouredCapturedAt: '2026-09-26T12:00:30.000Z',
          vulnerableCapturedAt: '2026-09-26T12:00:20.000Z',
        },
      },
      { phaseTransition: { observed: false } },
    ]) {
      expect(() => buildD04CaptureManifest(d04Input(RUN_ID, broken))).toThrow();
    }
    const shortHash = d04Input(RUN_ID);
    shortHash.captures = shortHash.captures.map((capture) => ({
      ...capture,
      sha256: 'not-a-hash',
    }));
    expect(() => buildD04CaptureManifest(shortHash)).toThrow(/SHA-256/);
    const mismatched = d04Input(RUN_ID, { sessionRunId: 'other-run' });
    expect(() => buildD04CaptureManifest(mismatched)).toThrow(/sessionRunId/);
    expect(() =>
      validateD04CaptureManifest({
        ...buildD04CaptureManifest(d04Input()),
        scopeId: 'V02-WI-06-E04-C01-M01',
      }),
    ).toThrow(/V02-WI-07-D04-C01/);
  });

  it('requires the aborted-preload mode to prove its request boundary', () => {
    expect(
      validateD04CaptureManifest(buildD04CaptureManifest(fallbackInput())),
    ).toBeTruthy();
    const repeated = fallbackInput();
    repeated.requests = [...repeated.requests, { ...repeated.requests[0] }];
    expect(() => buildD04CaptureManifest(repeated)).toThrow(
      /no second request/,
    );
    const oneRequest = fallbackInput();
    oneRequest.requests = [oneRequest.requests[0]];
    oneRequest.assetRequestCount = 1;
    expect(() => buildD04CaptureManifest(oneRequest)).toThrow(/both approved/);
    const lateSwap = fallbackInput();
    lateSwap.captures = lateSwap.captures.map((capture) => ({
      ...capture,
      lateSwapObserved: true,
    }));
    expect(() => buildD04CaptureManifest(lateSwap)).toThrow(
      /late prepared-asset swap/,
    );
    const noFailureEvidence = fallbackInput();
    noFailureEvidence.captures = noFailureEvidence.captures.map((capture) => {
      const clone = { ...capture };
      delete clone.failureInjectedAt;
      return clone;
    });
    expect(() => buildD04CaptureManifest(noFailureEvidence)).toThrow(
      /failureInjectedAt/,
    );
  });

  it('gates every Elite capture on the authored arrival and prefers unclipped frames', () => {
    // Before the Countdown reaches 00:00 no Elite exists: a merged cluster of
    // regular enemies or projectiles must never be offered as an Elite state.
    expect(
      deriveEliteCaptureOffer({
        zeroZeroSeen: false,
        eliteVisible: true,
        eliteState: 'armoured',
        clipped: false,
      }).offer,
    ).toBe(false);
    expect(
      deriveEliteCaptureOffer({
        zeroZeroSeen: true,
        eliteVisible: true,
        eliteState: 'vulnerable',
        clipped: false,
      }),
    ).toEqual({ offer: true, reason: 'unclipped', clipped: false });
    expect(
      deriveEliteCaptureOffer({
        zeroZeroSeen: true,
        eliteVisible: true,
        eliteState: 'vulnerable',
        clipped: true,
        firstSeenAt: '2026-09-26T12:00:00.000Z',
        nowMs: Date.parse('2026-09-26T12:00:04.000Z'),
      }),
    ).toEqual({
      offer: false,
      reason: 'clipped-awaiting-unclipped',
      clipped: true,
    });
    expect(
      deriveEliteCaptureOffer({
        zeroZeroSeen: true,
        eliteVisible: true,
        eliteState: 'vulnerable',
        clipped: true,
        firstSeenAt: '2026-09-26T12:00:00.000Z',
        nowMs: Date.parse('2026-09-26T12:00:09.000Z'),
      }).offer,
    ).toBe(true);
    expect(
      deriveEliteCaptureOffer({
        zeroZeroSeen: true,
        eliteVisible: false,
        eliteState: null,
      }).reason,
    ).toBe('no-elite-state');
    expect(CLIPPED_ELITE_ACCEPT_AFTER_MS).toBe(8000);
  });

  it('derives the D04 capture facts from the visible state sequence', () => {
    // V02-WI-07 D04-C02: a genuine transition is an ordered Armoured→Vulnerable
    // pair inside one attempt — even when the Elite was first seen Vulnerable.
    expect(
      deriveElitePhasePair([
        { state: 'armoured', at: '2026-09-26T12:00:00.000Z', attempt: 1 },
        { state: 'vulnerable', at: '2026-09-26T12:00:12.000Z', attempt: 1 },
      ]),
    ).toMatchObject({
      observed: true,
      attempt: 1,
      armouredAt: '2026-09-26T12:00:00.000Z',
      vulnerableAt: '2026-09-26T12:00:12.000Z',
    });
    // First seen Vulnerable, then Armoured, then a real Vulnerable: the genuine
    // pair is the later Armoured→Vulnerable step, not the first observations.
    expect(
      deriveElitePhasePair([
        { state: 'vulnerable', at: '2026-09-26T12:00:00.000Z', attempt: 1 },
        { state: 'armoured', at: '2026-09-26T12:00:12.000Z', attempt: 1 },
        { state: 'vulnerable', at: '2026-09-26T12:00:24.000Z', attempt: 1 },
      ]),
    ).toMatchObject({
      observed: true,
      armouredAt: '2026-09-26T12:00:12.000Z',
      vulnerableAt: '2026-09-26T12:00:24.000Z',
    });
    // Vulnerable-only and Armoured-only sequences are not a transition.
    expect(
      deriveElitePhasePair([
        { state: 'vulnerable', at: '2026-09-26T12:00:00.000Z', attempt: 1 },
      ]).observed,
    ).toBe(false);
    expect(deriveElitePhasePair([]).observed).toBe(false);
    // Cross-attempt stitching is rejected: Armoured in attempt 1 and Vulnerable
    // in attempt 2 (after a Defeat/Repair/replay) are not one transition.
    expect(
      deriveElitePhasePair([
        { state: 'armoured', at: '2026-09-26T12:00:00.000Z', attempt: 1 },
        { state: 'vulnerable', at: '2026-09-26T12:05:00.000Z', attempt: 2 },
      ]),
    ).toMatchObject({
      observed: false,
      reason: 'no-ordered-pair-in-one-attempt',
    });
    // Duplicate and out-of-order timestamps are rejected, not re-sorted.
    expect(
      deriveElitePhasePair([
        { state: 'armoured', at: '2026-09-26T12:00:12.000Z', attempt: 1 },
        { state: 'vulnerable', at: '2026-09-26T12:00:00.000Z', attempt: 1 },
      ]),
    ).toMatchObject({ observed: false, reason: 'out-of-order-observations' });
    expect(
      deriveElitePhasePair([
        { state: 'armoured', at: '2026-09-26T12:00:00.000Z', attempt: 1 },
        { state: 'armoured', at: '2026-09-26T12:00:00.000Z', attempt: 1 },
      ]),
    ).toMatchObject({
      observed: false,
      reason: 'duplicate-observation-timestamp',
    });

    const facts = deriveD04CaptureFacts({
      productionArtifact: true,
      zeroZeroSeen: true,
      armouredFrames: 3,
      vulnerableFrames: 1,
      sequence: [
        { state: 'armoured', at: '2026-09-26T12:00:00.000Z', attempt: 1 },
        { state: 'vulnerable', at: '2026-09-26T12:00:12.000Z', attempt: 1 },
      ],
    });
    expect(D04_CAPTURE_FACTS.every((fact) => facts[fact] === true)).toBe(true);
    const incomplete = deriveD04CaptureFacts({
      productionArtifact: true,
      zeroZeroSeen: true,
      armouredFrames: 2,
      vulnerableFrames: 0,
      sequence: [
        { state: 'armoured', at: '2026-09-26T12:00:00.000Z', attempt: 1 },
        { state: 'armoured', at: '2026-09-26T12:00:12.000Z', attempt: 1 },
      ],
    });
    expect(incomplete.eliteVulnerableSeen).toBe(false);
    expect(incomplete.phaseTransitionObserved).toBe(false);
  });

  describe('V02-WI-07 D04-C01 capture session record and candidate identity', () => {
    const HEAD = 'a'.repeat(40);
    const RUN_ID = 'v02-wi-07-d04-c01-elite-prepared-abc1234-20260926120000';

    function d04Facts(overrides = {}) {
      return {
        productionArtifact: true,
        zeroZeroSeen: true,
        eliteArmouredSeen: true,
        eliteVulnerableSeen: true,
        phaseTransitionObserved: true,
        ...overrides,
      };
    }

    function d04RecordInput(overrides = {}) {
      return {
        ...validInput(),
        runId: RUN_ID,
        scopeId: D04_SCOPE_ID,
        buildDir: 'dist',
        kind: SESSION_KINDS.D04_ELITE_PREPARED_CAPTURE,
        status: SESSION_STATUS.CAPTURE_COMPLETE,
        d04CaptureFacts: d04Facts(),
        ...overrides,
      };
    }

    function d04FallbackCapture() {
      return {
        assetPath: 'assets/runtime/enemies/elite-drone-*.png',
        failureInjectedAt: 'pre-Boot navigation (route installed before goto)',
        requestCount: 2,
        secondRequestObserved: false,
        lateSwapObserved: false,
        debugAuthorityUsed: false,
        servedFromDevelopment: false,
        servedFrom: 'http://127.0.0.1:4180',
        buildIdentity: '[shmup] build shmup@0.1.0 (abc1234-dirty)',
      };
    }

    it('accepts a capture-complete D04 prepared session and rejects an incomplete one', () => {
      expect(createSessionRecord(d04RecordInput()).scopeId).toBe(D04_SCOPE_ID);
      expect(() =>
        createSessionRecord(
          d04RecordInput({
            d04CaptureFacts: d04Facts({ phaseTransitionObserved: false }),
          }),
        ),
      ).toThrow(/phaseTransitionObserved/);
      expect(() =>
        createSessionRecord({ ...d04RecordInput(), scopeId: 'unknown-scope' }),
      ).toThrow(/V02-WI-07-D04-C01/);
      expect(() =>
        createSessionRecord({
          ...d04RecordInput(),
          buildDir: 'development server',
        }),
      ).toThrow(/dist/);
      expect(() =>
        createSessionRecord({ ...d04RecordInput(), d04CaptureFacts: null }),
      ).toThrow(/capture facts/);
    });

    it('requires the D04 production forced-fallback session to prove its request boundary', () => {
      const fallbackInput = {
        ...d04RecordInput(),
        kind: SESSION_KINDS.D04_ELITE_PRODUCTION_FALLBACK_CAPTURE,
        d04Capture: d04FallbackCapture(),
      };
      expect(createSessionRecord(fallbackInput).kind).toBe(
        SESSION_KINDS.D04_ELITE_PRODUCTION_FALLBACK_CAPTURE,
      );
      for (const broken of [
        { servedFromDevelopment: true },
        { secondRequestObserved: true },
        { lateSwapObserved: true },
        { requestCount: 0 },
        { buildIdentity: '' },
      ]) {
        expect(() =>
          createSessionRecord({
            ...fallbackInput,
            d04Capture: { ...fallbackInput.d04Capture, ...broken },
          }),
        ).toThrow();
      }
      expect(() =>
        createSessionRecord({ ...fallbackInput, d04Capture: null }),
      ).toThrow(/D04 fallback session evidence/);
      expect(() =>
        validateD04FallbackEvidence(d04FallbackCapture()),
      ).toBeTruthy();
    });

    it('keeps the WI-06 development fallback contract unchanged', () => {
      const devRecord = createSessionRecord({
        ...validInput(),
        kind: SESSION_KINDS.FORCED_FALLBACK_CAPTURE,
        status: SESSION_STATUS.CAPTURE_COMPLETE,
        fallbackEvidence: {
          assetPath: 'assets/runtime/enemies/elite-drone-*.png',
          failureInjectedAt: 'pre-Boot navigation',
          requestCount: 1,
          secondRequestObserved: false,
          lateSwapObserved: false,
          debugAuthorityUsed: false,
          servedFromDevelopment: true,
        },
      });
      expect(devRecord.kind).toBe(SESSION_KINDS.FORCED_FALLBACK_CAPTURE);
      expect(devRecord.d04Capture).toBeNull();
    });

    it('documents both D04 production capture modes in the runner vocabulary', () => {
      const source = readFileSync(RUNNER_SOURCE_PATH, 'utf8');
      expect(source).toContain('--d04-elite-capture');
      expect(source).toContain('--production-fallback');
      expect(source).toContain('production-d04-forced-fallback');
      expect(source).toContain('d04-elite-capture-manifest.json');
      expect(CAPTURE_SOURCES).toContain('production-d04-elite-prepared');
      expect(CAPTURE_SOURCES).toContain('production-d04-forced-fallback');
    });

    it('computes a deterministic candidate digest over the working-tree entries', () => {
      expect(parsePorcelainPaths(' M e2e/a.ts\0')).toEqual(['e2e/a.ts']);
      expect(parsePorcelainPaths('?? scripts/x.mjs\0')).toEqual([
        'scripts/x.mjs',
      ]);
      // A rename record carries the original path as the following chunk.
      expect(parsePorcelainPaths('R  new.ts\0old.ts\0')).toEqual(['new.ts']);
      expect(parsePorcelainPaths('')).toEqual([]);
      const files = [
        { path: 'a.ts', content: 'one' },
        { path: 'b.ts', content: 'two' },
      ];
      const first = computeCandidateDigest({ head: HEAD, files });
      expect(
        computeCandidateDigest({ head: HEAD, files: [...files].reverse() }),
      ).toBe(first);
      expect(
        computeCandidateDigest({
          head: HEAD,
          files: [{ path: 'a.ts', content: 'changed' }, files[1]],
        }),
      ).not.toBe(first);
      expect(computeCandidateDigest({ head: 'b'.repeat(40), files })).not.toBe(
        first,
      );
      expect(D04_CANDIDATE_DIGEST_METHOD).toMatch(/fnv1a32/);
      expect(() => computeCandidateDigest({ head: '', files })).toThrow(/HEAD/);
    });
  });
});

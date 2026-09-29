#!/usr/bin/env node
/**
 * V02-WI-06 E04-C01-M01 — manual Mission 03 session verification.
 *
 * Re-derives the acceptance facts of a recorded manual session from its raw
 * evidence (attempt chronology, Elite observations, post-Continue Base state,
 * persisted campaign row and replay facts) without touching the record itself.
 * It exists because a runner bookkeeping defect can under-report a fact that the
 * recorded evidence already proves; the reviewer can therefore re-check the
 * derivation against the raw record and see exactly which raw fact carries it.
 *
 * Usage: npm run evidence:mission03-manual-verify [-- <sessionDirectory>]
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ACCEPTANCE_FACTS,
  D04_CAPTURE_FACTS,
  SESSION_KINDS,
  SESSION_STATUS,
  deriveAcceptanceFacts,
  deriveD04CaptureFacts,
  deriveEliteDestructionCrossCheck,
  deriveElitePhasePair,
  derivePostTerminalBaseObserved,
  validateD04CaptureManifest,
} from './mission03-manual-session.mjs';

const ROOT = process.cwd();
const MANUAL_ROOT = join(ROOT, '.agent-handoff', 'evidence', 'manual-m03');

function latestSessionDirectory() {
  if (!existsSync(MANUAL_ROOT)) {
    throw new Error('no manual Mission 03 session directory exists yet.');
  }
  const directories = readdirSync(MANUAL_ROOT)
    .filter((entry) =>
      existsSync(join(MANUAL_ROOT, entry, 'session-record.json')),
    )
    .sort();
  if (directories.length === 0) {
    throw new Error('no recorded manual Mission 03 session was found.');
  }
  return join(MANUAL_ROOT, directories[directories.length - 1]);
}

/**
 * V02-WI-07 D04-C01: independently re-derives the Elite production capture
 * facts from the raw session record, validates the D04 capture manifest, and
 * re-hashes every captured screenshot. It never rewrites the recorded evidence.
 */
function verifyD04Session(sessionDirectory, recordPath, record) {
  const relative = (path) => path.replace(`${ROOT}/`, '');
  const manifestPath = join(
    sessionDirectory,
    'd04-elite-capture-manifest.json',
  );
  let manifest = null;
  let manifestError = null;
  if (existsSync(manifestPath)) {
    try {
      manifest = validateD04CaptureManifest(
        JSON.parse(readFileSync(manifestPath, 'utf8')),
      );
    } catch (error) {
      manifestError = error.message;
    }
  } else {
    manifestError = 'the D04 capture manifest is missing.';
  }
  const d04Facts = deriveD04CaptureFacts({
    productionArtifact:
      record.productionArtifact?.debugSurfaceExposed === false,
    zeroZeroSeen:
      record.d04CaptureFacts?.zeroZeroSeen ??
      record.acceptanceFacts?.zeroZeroSeen,
    armouredFrames: record.eliteObservations?.armouredFrames,
    vulnerableFrames: record.eliteObservations?.vulnerableFrames,
    // V02-WI-07 D04-C02: re-derive the one-attempt ordered pair from the recorded
    // visible observation sequence. The preserved first-seen fields are only
    // provenance; they can never prove a transition.
    sequence: Array.isArray(record.eliteObservations?.sequence)
      ? record.eliteObservations.sequence.map((entry) => ({
          state: entry.state,
          at: entry.at,
          attempt: entry.attempt,
        }))
      : [],
  });
  const capturePair = deriveElitePhasePair(
    (record.captures ?? []).map((capture) => ({
      state: capture.state,
      at: capture.capturedAt,
      // A retained record without attempt provenance cannot prove that its
      // captures belong to one attempt; report that instead of stitching them.
      attempt:
        typeof capture.attempt === 'number'
          ? capture.attempt
          : (record.attempts ?? []).length <= 1
            ? 1
            : null,
    })),
  );
  const missing = D04_CAPTURE_FACTS.filter((fact) => d04Facts[fact] !== true);
  const observationPair = deriveElitePhasePair(
    Array.isArray(record.eliteObservations?.sequence)
      ? record.eliteObservations.sequence.map((entry) => ({
          state: entry.state,
          at: entry.at,
          attempt: entry.attempt,
        }))
      : [],
  );
  const screenshotHashes = (record.captures ?? []).map((capture) => {
    let verified = false;
    let error = null;
    try {
      const bytes = readFileSync(join(ROOT, capture.path));
      verified =
        createHash('sha256').update(bytes).digest('hex') === capture.sha256;
    } catch (hashError) {
      error = hashError.message;
    }
    return { path: capture.path, sha256: capture.sha256, verified, error };
  });
  const screenshotHashesVerified =
    screenshotHashes.length > 0 &&
    screenshotHashes.every((entry) => entry.verified);
  const complete =
    missing.length === 0 && manifest !== null && screenshotHashesVerified;
  const verification = {
    kind: 'v02-wi-07-d04-c01-elite-capture-verification',
    sessionRunId: record.runId,
    sessionRecord: relative(recordPath),
    sessionKind: record.kind,
    scopeId: record.scopeId,
    recordedStatus: record.status,
    recordedD04CaptureFacts: record.d04CaptureFacts ?? null,
    derivedD04CaptureFacts: d04Facts,
    // V02-WI-07 D04-C02 pairing provenance: the capture pair actually used by the
    // manifest and the re-derived observation pair, both inside one attempt.
    capturePhasePair: capturePair,
    observationPhasePair: observationPair,
    derivedD04CaptureComplete: missing.length === 0,
    missingD04CaptureFacts: missing,
    manifest: {
      path: relative(manifestPath),
      valid: manifest !== null,
      error: manifestError,
      requestFailureMode: manifest?.requestFailureMode ?? null,
      baseRevision: manifest?.baseRevision ?? null,
      sourceFingerprint: manifest?.sourceFingerprint ?? null,
      candidateDigest: manifest?.candidateDigest ?? null,
      buildIdentity: manifest?.buildIdentity ?? null,
      phaseTransition: manifest?.phaseTransition ?? null,
      captures: (manifest?.captures ?? []).map((capture) => ({
        state: capture.state,
        source: capture.source,
        path: capture.path,
        sha256: capture.sha256,
      })),
    },
    screenshotHashes,
    screenshotHashesVerified,
    eliteObservations: record.eliteObservations ?? null,
    requestBoundary: {
      assetPath: record.d04Capture?.assetPath ?? null,
      failureInjectedAt: record.d04Capture?.failureInjectedAt ?? null,
      requestCount: record.d04Capture?.requestCount ?? null,
      requests: record.d04Capture?.requests ?? null,
      secondRequestObserved: record.d04Capture?.secondRequestObserved ?? null,
      lateSwapObserved: record.d04Capture?.lateSwapObserved ?? null,
      servedFromDevelopment: record.d04Capture?.servedFromDevelopment ?? null,
    },
    derivationSources:
      'record.d04CaptureFacts, record.eliteObservations, record.captures and the validated D04 capture manifest; no hidden gameplay state is read',
    status: complete ? SESSION_STATUS.CAPTURE_COMPLETE : record.status,
  };
  writeFileSync(
    join(sessionDirectory, 'verification.json'),
    `${JSON.stringify(verification, null, 2)}\n`,
  );
  process.stdout.write(
    `[m03-verify] ${record.runId}: D04 Elite capture facts ${Object.values(d04Facts).filter(Boolean).length}/${D04_CAPTURE_FACTS.length}; missing: ${missing.length === 0 ? 'none' : missing.join(', ')}\n`,
  );
  process.stdout.write(
    `[m03-verify] screenshot hashes verified: ${screenshotHashes.filter((entry) => entry.verified).length}/${screenshotHashes.length}; manifest: ${manifest !== null ? 'valid' : `invalid (${manifestError})`}\n`,
  );
  process.stdout.write(
    `[m03-verify] verification written to ${relative(join(sessionDirectory, 'verification.json'))}\n`,
  );
  process.exit(complete ? 0 : 2);
}

function main() {
  const argument = process.argv[2];
  const sessionDirectory =
    argument === undefined ? latestSessionDirectory() : argument;
  const recordPath = join(sessionDirectory, 'session-record.json');
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));

  const d04Kinds = [
    SESSION_KINDS.D04_ELITE_PREPARED_CAPTURE,
    SESSION_KINDS.D04_ELITE_PRODUCTION_FALLBACK_CAPTURE,
  ];
  if (d04Kinds.includes(record.kind)) {
    verifyD04Session(sessionDirectory, recordPath, record);
    return;
  }

  const postTerminalBaseObserved = derivePostTerminalBaseObserved(record);
  const acceptanceFacts = deriveAcceptanceFacts({
    productionArtifact:
      record.productionArtifact?.debugSurfaceExposed === false,
    arrivalAt0520: record.acceptanceFacts?.arrivalAt0520 === true,
    zeroZeroSeen: record.acceptanceFacts?.zeroZeroSeen === true,
    eliteArmouredSeen: (record.eliteObservations?.armouredFrames ?? 0) > 0,
    eliteVulnerableSeen: (record.eliteObservations?.vulnerableFrames ?? 0) > 0,
    successTerminal: record.attempts.some(
      (attempt) => attempt.terminal === 'success',
    ),
    continueObserved: record.acceptanceFacts?.continueObserved === true,
    postTerminalBaseObserved,
    replayableVerified: record.replay?.startedFromCompletedOperations === true,
    cleanCombatResidue: record.cleanup?.clean === true,
    persisted: record.persisted,
  });
  const missing = ACCEPTANCE_FACTS.filter(
    (fact) => acceptanceFacts[fact] !== true,
  );
  const verification = {
    kind: 'v02-wi-06-e04-c01-m01-manual-session-verification',
    sessionRunId: record.runId,
    sessionRecord: recordPath.replace(`${ROOT}/`, ''),
    recordedStatus: record.status,
    recordedAcceptanceComplete: record.acceptanceComplete,
    recordedMissingFacts: record.missingAcceptanceFacts,
    derivedAcceptanceFacts: acceptanceFacts,
    derivedAcceptanceComplete: missing.length === 0,
    missingAcceptanceFacts: missing,
    evidenceForContinueObserved: {
      postTerminalBaseObserved,
      postTerminalBaseObservedInRecord: record.postTerminalBaseObserved ?? null,
      attemptsWithClosedTerminal: record.attempts
        .filter((attempt) => typeof attempt.closedAt === 'string')
        .map((attempt) => ({
          ordinal: attempt.ordinal,
          terminal: attempt.terminal,
          closedAt: attempt.closedAt,
        })),
      postContinueBaseState: record.cleanup,
      replay: record.replay,
    },
    eliteDestruction: {
      rule: 'Success requires every authored group spawned and zero living enemies, and the authored Elite never escapes and only accepts projectile damage while Vulnerable (src/application/combat/enemies.ts, Epic §9.4/§12).',
      visibleStates: record.eliteObservations,
      rewardCrossChecks: record.attempts
        .filter((attempt) => attempt.terminal === 'success')
        .map((attempt) => ({
          ordinal: attempt.ordinal,
          ...deriveEliteDestructionCrossCheck({ rows: attempt.rows }),
        })),
      confirmed: record.attempts.some(
        (attempt) => attempt.terminal === 'success',
      ),
    },
    status:
      missing.length === 0 ? SESSION_STATUS.SUCCESS_VERIFIED : record.status,
  };
  writeFileSync(
    join(sessionDirectory, 'verification.json'),
    `${JSON.stringify(verification, null, 2)}\n`,
  );
  process.stdout.write(
    `[m03-verify] ${record.runId}: derived ${Object.values(acceptanceFacts).filter(Boolean).length}/${ACCEPTANCE_FACTS.length} acceptance facts; missing: ${missing.length === 0 ? 'none' : missing.join(', ')}\n`,
  );
  process.stdout.write(
    '[m03-verify] verification written to ' +
      `${join(sessionDirectory, 'verification.json').replace(`${ROOT}/`, '')}\n`,
  );
  process.exit(missing.length === 0 ? 0 : 2);
}

main();

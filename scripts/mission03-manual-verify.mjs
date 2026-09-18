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
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ACCEPTANCE_FACTS,
  SESSION_STATUS,
  deriveAcceptanceFacts,
  deriveEliteDestructionCrossCheck,
  derivePostTerminalBaseObserved,
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

function main() {
  const argument = process.argv[2];
  const sessionDirectory =
    argument === undefined ? latestSessionDirectory() : argument;
  const recordPath = join(sessionDirectory, 'session-record.json');
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));

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

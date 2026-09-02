/**
 * V02-WI-04 C05 evidence ownership reader (Epic §20.1, V02-AC-028; delta 4).
 * The comparison validator requires every generated performance record to
 * carry the current control runId and a common current-source fingerprint.
 * The launch layer supplies both through the environment:
 *   - `SHMUP_EVIDENCE_RUN_ID` (the active `.agent-handoff/control.json`
 *     runId), and
 *   - `SHMUP_EVIDENCE_SOURCE_FINGERPRINT` (a JSON `{head, digest}` produced by
 *     `scripts/evidence-source-fingerprint.mjs` from the current WI-04 tree).
 * A record written without these fields (null) is rejected by the comparison
 * validator, so a missing env can never produce a plausible record.
 */
export interface SourceFingerprint {
  readonly head: string;
  readonly digest: string;
}

export interface EvidenceOwnership {
  readonly runId: string | null;
  readonly sourceFingerprint: SourceFingerprint | null;
}

export function readEvidenceOwnership(): EvidenceOwnership {
  const runId = process.env.SHMUP_EVIDENCE_RUN_ID ?? null;
  const raw = process.env.SHMUP_EVIDENCE_SOURCE_FINGERPRINT;
  let sourceFingerprint: SourceFingerprint | null = null;
  if (raw !== undefined) {
    try {
      const parsed = JSON.parse(raw) as Partial<SourceFingerprint>;
      if (
        typeof parsed.head === 'string' &&
        typeof parsed.digest === 'string'
      ) {
        sourceFingerprint = { head: parsed.head, digest: parsed.digest };
      }
    } catch {
      sourceFingerprint = null;
    }
  }
  return { runId, sourceFingerprint };
}

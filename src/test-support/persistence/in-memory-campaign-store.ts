import { beginMission, migrateCampaignRecord } from '@domain/index';
import type {
  CampaignSchemaContext,
  CampaignStateV1,
  CampaignTransitionResult,
} from '@domain/index';
import type {
  CampaignReadResult,
  CampaignStartOutcome,
  CampaignStorePort,
  CampaignUpdateOutcome,
} from '@application/persistence';
import type { MissionId } from '@domain/index';

/**
 * In-memory `CampaignStorePort` fake for deterministic application/UI tests.
 * It mirrors the real Dexie adapter's contract exactly: stored input is
 * validated through the domain migration/validation boundary, `update` runs
 * the transform atomically over the single record, corrupted data is reported
 * and never overwritten, and `startMission` allocates a globally unique
 * monotonic attempt id from a NON-RESETTING allocator (confirmed New Game,
 * Save Data Error replacement, and ordinary `replace` never reset it — the
 * real IndexedDB key generator behaves the same way).
 */
export class InMemoryCampaignStore implements CampaignStorePort {
  private record: CampaignStateV1 | null = null;
  private nextAttemptId = 0;

  constructor(private readonly context: CampaignSchemaContext) {}

  /** Seeds a stored record directly (test setup); it is validated on read. */
  seed(record: CampaignStateV1): void {
    this.record = record;
  }

  get current(): CampaignStateV1 | null {
    return this.record;
  }

  async read(): Promise<CampaignReadResult> {
    if (this.record === null) {
      return { kind: 'none' };
    }
    return migrateCampaignRecord(this.record as unknown, this.context);
  }

  async update(
    transform: (current: CampaignStateV1) => CampaignTransitionResult,
  ): Promise<CampaignUpdateOutcome> {
    if (this.record === null) {
      return { kind: 'missing' };
    }
    const parsed = migrateCampaignRecord(this.record as unknown, this.context);
    if (parsed.kind === 'invalid') {
      return { kind: 'invalid', diagnostics: parsed.diagnostics };
    }
    const decision = transform(parsed.campaign);
    if (decision.kind === 'rejected') {
      return { kind: 'no-change', reason: decision.reason };
    }
    this.record = decision.campaign;
    return { kind: 'applied', next: decision.campaign };
  }

  async startMission(missionId: MissionId): Promise<CampaignStartOutcome> {
    if (this.record === null) {
      return { kind: 'missing' };
    }
    const parsed = migrateCampaignRecord(this.record as unknown, this.context);
    if (parsed.kind === 'invalid') {
      return { kind: 'invalid', diagnostics: parsed.diagnostics };
    }
    // Mirror the real IndexedDB key generator: the id is consumed on every
    // allocation attempt and is never reused (a rejected start consumes the
    // id but leaves no allocator row behind, matching the real rolled-back
    // insert).
    const attemptId = this.nextAttemptId;
    this.nextAttemptId += 1;
    const decision = beginMission(parsed.campaign, missionId, attemptId);
    if (decision.kind === 'rejected') {
      return { kind: 'no-change', reason: decision.reason };
    }
    this.record = decision.campaign;
    return { kind: 'applied', next: decision.campaign, attemptId };
  }

  async replace(next: CampaignStateV1): Promise<void> {
    this.record = next;
  }
}

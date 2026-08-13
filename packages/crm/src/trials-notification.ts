import type { CrmId, CrmTrial } from "./index.js";

export interface CrmTrialNotificationRepository {
  readonly listExpiredUnnotified: (
    staleBefore: Date,
  ) => Promise<readonly CrmTrial[]>;
  readonly claimExpiredUnnotified: (
    id: CrmId,
    taskUid: string,
    claimedAt: Date,
    staleBefore: Date,
  ) => Promise<boolean>;
  readonly renewNotificationClaim: (
    id: CrmId,
    taskUid: string,
    renewedAt: Date,
  ) => Promise<boolean>;
  readonly releaseNotificationClaim: (
    id: CrmId,
    taskUid: string,
  ) => Promise<void>;
  readonly markNotifiedClaimed: (
    id: CrmId,
    taskUid: string,
    notifiedAt: Date,
  ) => Promise<CrmTrial>;
  readonly appendInteraction: (input: {
    readonly leadId: CrmId;
    readonly content: string;
    readonly actorSubject: string;
  }) => Promise<void>;
}

export interface CrmTrialNotificationDeliveryPort {
  readonly send: (input: {
    readonly trialId: CrmId;
    readonly leadId: CrmId;
    readonly expiredAt: Date;
    readonly idempotencyKey: string;
  }) => Promise<{ readonly delivered: boolean }>;
}

export interface CrmTrialNotificationResult {
  readonly considered: number;
  readonly claimed: number;
  readonly delivered: number;
  readonly failed: number;
}

interface DeliveryWithHeartbeatResult {
  readonly delivered: boolean;
  readonly claimLost: boolean;
}

export function createCrmTrialNotificationIdempotencyKey(
  trialId: CrmId,
): string {
  return `crm.trial.expired.notification:v1:${trialId}`;
}

export class CrmTrialNotificationProcessor {
  constructor(
    private readonly repository: CrmTrialNotificationRepository,
    private readonly delivery: CrmTrialNotificationDeliveryPort,
    private readonly createTaskUid: () => string,
    private readonly claimLeaseMs: number,
    private readonly now: () => Date = () => new Date(),
    private readonly actorSubject = "crm-trial-notification",
  ) {
    if (!Number.isSafeInteger(claimLeaseMs) || claimLeaseMs < 1_000) {
      throw new Error(
        "CRM trial notification claim lease must be at least 1000ms",
      );
    }
  }

  async runPending(): Promise<CrmTrialNotificationResult> {
    const scanAt = this.now();
    const staleBefore = new Date(scanAt.getTime() - this.claimLeaseMs);
    const trials = await this.repository.listExpiredUnnotified(staleBefore);
    let claimed = 0;
    let delivered = 0;
    let failed = 0;

    for (const trial of trials) {
      const taskUid = this.createTaskUid();
      const claimedAt = this.now();
      const claimStaleBefore = new Date(
        claimedAt.getTime() - this.claimLeaseMs,
      );
      const ownsClaim = await this.repository.claimExpiredUnnotified(
        trial.id,
        taskUid,
        claimedAt,
        claimStaleBefore,
      );
      if (!ownsClaim) continue;
      claimed += 1;

      try {
        const result = await this.deliverWithHeartbeat(trial, taskUid);
        if (!result.delivered || result.claimLost) {
          failed += 1;
          await this.repository.releaseNotificationClaim(trial.id, taskUid);
          continue;
        }

        const notifiedAt = this.now();
        await this.repository.markNotifiedClaimed(
          trial.id,
          taskUid,
          notifiedAt,
        );
        await this.repository.appendInteraction({
          leadId: trial.leadId,
          content: "Notificação de expiração do trial enviada",
          actorSubject: this.actorSubject,
        });
        delivered += 1;
      } catch {
        failed += 1;
        await this.repository.releaseNotificationClaim(trial.id, taskUid);
      }
    }

    return {
      considered: trials.length,
      claimed,
      delivered,
      failed,
    };
  }

  private async deliverWithHeartbeat(
    trial: CrmTrial,
    taskUid: string,
  ): Promise<DeliveryWithHeartbeatResult> {
    const heartbeatMs = Math.max(250, Math.floor(this.claimLeaseMs / 3));
    let claimLost = false;
    let renewal: Promise<void> | null = null;

    const renew = () => {
      if (claimLost || renewal) return;
      renewal = this.repository
        .renewNotificationClaim(trial.id, taskUid, this.now())
        .then((renewed) => {
          if (!renewed) claimLost = true;
        })
        .catch(() => {
          claimLost = true;
        })
        .finally(() => {
          renewal = null;
        });
    };

    const waitForRenewal = async (): Promise<void> => {
      const pendingRenewal = renewal;
      if (pendingRenewal !== null) {
        await pendingRenewal;
      }
    };

    const timer = setInterval(renew, heartbeatMs);
    try {
      const result = await this.delivery.send({
        trialId: trial.id,
        leadId: trial.leadId,
        expiredAt: trial.endDate,
        idempotencyKey: createCrmTrialNotificationIdempotencyKey(trial.id),
      });
      await waitForRenewal();
      return { delivered: result.delivered, claimLost };
    } finally {
      clearInterval(timer);
      await waitForRenewal();
    }
  }
}

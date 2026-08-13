import type { CrmId, CrmTrial } from "./index.js";

export interface CrmTrialNotificationRepository {
  readonly listExpiredUnnotified: () => Promise<readonly CrmTrial[]>;
  readonly markNotified: (id: CrmId, notifiedAt: Date) => Promise<CrmTrial>;
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
  }) => Promise<{ readonly delivered: boolean }>;
}

export interface CrmTrialNotificationResult {
  readonly considered: number;
  readonly delivered: number;
  readonly failed: number;
}

export class CrmTrialNotificationProcessor {
  constructor(
    private readonly repository: CrmTrialNotificationRepository,
    private readonly delivery: CrmTrialNotificationDeliveryPort,
    private readonly now: () => Date = () => new Date(),
    private readonly actorSubject = "crm-trial-notification",
  ) {}

  async runPending(): Promise<CrmTrialNotificationResult> {
    const trials = await this.repository.listExpiredUnnotified();
    let delivered = 0;
    let failed = 0;

    for (const trial of trials) {
      try {
        const result = await this.delivery.send({
          trialId: trial.id,
          leadId: trial.leadId,
          expiredAt: trial.endDate,
        });
        if (!result.delivered) {
          failed += 1;
          continue;
        }

        const notifiedAt = this.now();
        await this.repository.markNotified(trial.id, notifiedAt);
        await this.repository.appendInteraction({
          leadId: trial.leadId,
          content: "Notificação de expiração do trial enviada",
          actorSubject: this.actorSubject,
        });
        delivered += 1;
      } catch {
        failed += 1;
      }
    }

    return {
      considered: trials.length,
      delivered,
      failed,
    };
  }
}

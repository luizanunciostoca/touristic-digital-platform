import type { CrmFollowUp, CrmFollowUpSetting, CrmId } from "./index.js";

export interface CrmFollowUpSchedulerRepository {
  readonly listPending: () => Promise<readonly CrmFollowUp[]>;
  readonly listSettings: () => Promise<readonly CrmFollowUpSetting[]>;
  readonly claimPending: (id: CrmId, taskUid: string) => Promise<boolean>;
  readonly releaseClaim: (id: CrmId, taskUid: string) => Promise<void>;
  readonly markSentClaimed: (
    id: CrmId,
    taskUid: string,
    sentAt: Date,
  ) => Promise<CrmFollowUp>;
  readonly markSkippedClaimed: (
    id: CrmId,
    taskUid: string,
  ) => Promise<CrmFollowUp>;
  readonly updateLeadLastContact: (leadId: CrmId, at: Date) => Promise<void>;
  readonly appendInteraction: (input: {
    readonly leadId: CrmId;
    readonly content: string;
    readonly actorSubject: string;
  }) => Promise<void>;
}

export interface CrmFollowUpDeliveryPort {
  readonly send: (input: {
    readonly followUpId: CrmId;
    readonly leadId: CrmId;
    readonly message: string;
  }) => Promise<{ readonly delivered: boolean }>;
}

export interface CrmFollowUpSchedulerResult {
  readonly considered: number;
  readonly claimed: number;
  readonly sent: number;
  readonly skipped: number;
  readonly failed: number;
}

export class CrmFollowUpScheduler {
  constructor(
    private readonly repository: CrmFollowUpSchedulerRepository,
    private readonly delivery: CrmFollowUpDeliveryPort,
    private readonly createTaskUid: () => string,
    private readonly now: () => Date = () => new Date(),
    private readonly actorSubject = "crm-follow-up-scheduler",
  ) {}

  async runDue(): Promise<CrmFollowUpSchedulerResult> {
    const [pending, settings] = await Promise.all([
      this.repository.listPending(),
      this.repository.listSettings(),
    ]);
    const settingsById = new Map(settings.map((setting) => [setting.id, setting]));
    let claimed = 0;
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const followUp of pending) {
      if (followUp.settingId === null) continue;
      const setting = settingsById.get(followUp.settingId);
      const taskUid = this.createTaskUid();
      if (!(await this.repository.claimPending(followUp.id, taskUid))) continue;
      claimed += 1;

      if (
        !setting ||
        !setting.isActive ||
        followUp.attemptNumber > setting.maxAttempts ||
        !setting.messageTemplate?.trim()
      ) {
        await this.repository.markSkippedClaimed(followUp.id, taskUid);
        skipped += 1;
        continue;
      }

      try {
        const result = await this.delivery.send({
          followUpId: followUp.id,
          leadId: followUp.leadId,
          message: setting.messageTemplate,
        });
        if (!result.delivered) {
          await this.repository.releaseClaim(followUp.id, taskUid);
          failed += 1;
          continue;
        }

        const sentAt = this.now();
        await this.repository.markSentClaimed(followUp.id, taskUid, sentAt);
        await this.repository.appendInteraction({
          leadId: followUp.leadId,
          content: "Follow-up automático enviado",
          actorSubject: this.actorSubject,
        });
        await this.repository.updateLeadLastContact(followUp.leadId, sentAt);
        sent += 1;
      } catch {
        await this.repository.releaseClaim(followUp.id, taskUid);
        failed += 1;
      }
    }

    return {
      considered: pending.length,
      claimed,
      sent,
      skipped,
      failed,
    };
  }
}

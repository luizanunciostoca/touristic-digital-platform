import type { CrmId, CrmTrial } from "./index.js";

export interface CrmTrialSchedulerRepository {
  readonly listDue: () => Promise<readonly CrmTrial[]>;
  readonly claimDue: (id: CrmId, taskUid: string) => Promise<boolean>;
  readonly releaseClaim: (id: CrmId, taskUid: string) => Promise<void>;
  readonly markExpiredClaimed: (
    id: CrmId,
    taskUid: string,
  ) => Promise<CrmTrial>;
  readonly appendInteraction: (input: {
    readonly leadId: CrmId;
    readonly content: string;
    readonly actorSubject: string;
  }) => Promise<void>;
}

export interface CrmTrialSchedulerResult {
  readonly considered: number;
  readonly claimed: number;
  readonly expired: number;
  readonly failed: number;
}

export class CrmTrialScheduler {
  constructor(
    private readonly repository: CrmTrialSchedulerRepository,
    private readonly createTaskUid: () => string,
    private readonly actorSubject = "crm-trial-scheduler",
  ) {}

  async runDue(): Promise<CrmTrialSchedulerResult> {
    const due = await this.repository.listDue();
    let claimed = 0;
    let expired = 0;
    let failed = 0;

    for (const trial of due) {
      const taskUid = this.createTaskUid();
      if (!(await this.repository.claimDue(trial.id, taskUid))) continue;
      claimed += 1;

      try {
        await this.repository.markExpiredClaimed(trial.id, taskUid);
        await this.repository.appendInteraction({
          leadId: trial.leadId,
          content: "Trial expirado automaticamente.",
          actorSubject: this.actorSubject,
        });
        expired += 1;
      } catch {
        await this.repository.releaseClaim(trial.id, taskUid);
        failed += 1;
      }
    }

    return {
      considered: due.length,
      claimed,
      expired,
      failed,
    };
  }
}

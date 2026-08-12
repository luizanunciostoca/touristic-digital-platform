import {
  CrmFollowUpScheduler,
  type CrmFollowUpDeliveryPort,
  type CrmFollowUpSchedulerResult,
} from "@touristic/crm/followups-scheduler";
import type { Pool } from "mysql2/promise";

import { MySqlCrmFollowUpRepository } from "./mysql-followups-repository.js";

export interface CrmFollowUpSchedulerHostOptions {
  readonly intervalMs: number;
  readonly runImmediately?: boolean;
  readonly onRun?: (result: CrmFollowUpSchedulerResult) => void | Promise<void>;
  readonly onError?: (error: unknown) => void | Promise<void>;
}

export class CrmFollowUpSchedulerHost {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;

  constructor(
    private readonly scheduler: CrmFollowUpScheduler,
    private readonly options: CrmFollowUpSchedulerHostOptions,
  ) {
    if (
      !Number.isSafeInteger(options.intervalMs) ||
      options.intervalMs < 1_000
    ) {
      throw new Error("CRM follow-up scheduler interval must be at least 1000ms");
    }
  }

  get started(): boolean {
    return this.timer !== null;
  }

  async runOnce(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.execute().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.runOnce();
    }, this.options.intervalMs);
    if (this.options.runImmediately !== false) void this.runOnce();
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.running) await this.running;
  }

  private async execute(): Promise<void> {
    try {
      const result = await this.scheduler.runDue();
      await this.options.onRun?.(result);
    } catch (error) {
      await this.options.onError?.(error);
    }
  }
}

export interface CreateCrmFollowUpSchedulerHostOptions
  extends CrmFollowUpSchedulerHostOptions {
  readonly delivery: CrmFollowUpDeliveryPort;
  readonly createTaskUid: () => string;
  readonly now?: () => Date;
  readonly actorSubject?: string;
}

export function createCrmFollowUpSchedulerHost(
  pool: Pool,
  options: CreateCrmFollowUpSchedulerHostOptions,
): CrmFollowUpSchedulerHost {
  const scheduler = new CrmFollowUpScheduler(
    new MySqlCrmFollowUpRepository(pool),
    options.delivery,
    options.createTaskUid,
    options.now,
    options.actorSubject,
  );
  return new CrmFollowUpSchedulerHost(scheduler, options);
}

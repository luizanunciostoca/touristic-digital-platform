import {
  CrmTrialScheduler,
  type CrmTrialSchedulerResult,
} from "@touristic/crm/trials-scheduler";
import type { Pool } from "mysql2/promise";

import { MySqlCrmTrialRepository } from "./mysql-trials-repository.js";

export interface CrmTrialSchedulerHostOptions {
  readonly intervalMs: number;
  readonly runImmediately?: boolean;
  readonly onRun?: (result: CrmTrialSchedulerResult) => void | Promise<void>;
  readonly onError?: (error: unknown) => void | Promise<void>;
}

export class CrmTrialSchedulerHost {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;

  constructor(
    private readonly scheduler: CrmTrialScheduler,
    private readonly options: CrmTrialSchedulerHostOptions,
  ) {
    if (
      !Number.isSafeInteger(options.intervalMs) ||
      options.intervalMs < 1_000
    ) {
      throw new Error("CRM trial scheduler interval must be at least 1000ms");
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

export interface CreateCrmTrialSchedulerHostOptions extends CrmTrialSchedulerHostOptions {
  readonly createTaskUid: () => string;
  readonly actorSubject?: string;
}

export function createCrmTrialSchedulerHost(
  pool: Pool,
  options: CreateCrmTrialSchedulerHostOptions,
): CrmTrialSchedulerHost {
  const scheduler = new CrmTrialScheduler(
    new MySqlCrmTrialRepository(pool),
    options.createTaskUid,
    options.actorSubject,
  );
  return new CrmTrialSchedulerHost(scheduler, options);
}

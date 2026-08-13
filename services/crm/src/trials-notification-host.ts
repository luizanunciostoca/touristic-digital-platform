import {
  CrmTrialNotificationProcessor,
  type CrmTrialNotificationDeliveryPort,
  type CrmTrialNotificationResult,
} from "@touristic/crm/trials-notification";
import type { Pool } from "mysql2/promise";

import { MySqlCrmTrialRepository } from "./mysql-trials-repository.js";

export interface CrmTrialNotificationHostOptions {
  readonly intervalMs: number;
  readonly runImmediately?: boolean;
  readonly onRun?: (result: CrmTrialNotificationResult) => void | Promise<void>;
  readonly onError?: (error: unknown) => void | Promise<void>;
}

export class CrmTrialNotificationHost {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;

  constructor(
    private readonly processor: CrmTrialNotificationProcessor,
    private readonly options: CrmTrialNotificationHostOptions,
  ) {
    if (
      !Number.isSafeInteger(options.intervalMs) ||
      options.intervalMs < 1_000
    ) {
      throw new Error(
        "CRM trial notification interval must be at least 1000ms",
      );
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
      const result = await this.processor.runPending();
      await this.options.onRun?.(result);
    } catch (error) {
      await this.options.onError?.(error);
    }
  }
}

export interface CreateCrmTrialNotificationHostOptions extends CrmTrialNotificationHostOptions {
  readonly delivery: CrmTrialNotificationDeliveryPort;
  readonly createTaskUid: () => string;
  readonly now?: () => Date;
  readonly actorSubject?: string;
}

export function createCrmTrialNotificationHost(
  pool: Pool,
  options: CreateCrmTrialNotificationHostOptions,
): CrmTrialNotificationHost {
  const processor = new CrmTrialNotificationProcessor(
    new MySqlCrmTrialRepository(pool),
    options.delivery,
    options.createTaskUid,
    options.now,
    options.actorSubject,
  );
  return new CrmTrialNotificationHost(processor, options);
}

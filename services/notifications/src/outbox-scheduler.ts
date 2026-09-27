import type {
  NotificationDispatcher,
  NotificationDispatchResult,
} from "@touristic/notifications";

import type {
  NotificationOutboxLease,
  NotificationOutboxRepository,
} from "./mysql-notification-outbox.js";

export interface NotificationOutboxObservation {
  readonly tenantId: string;
  readonly outboxId: string;
  readonly attempt: number;
  readonly outcome:
    | "delivered"
    | "suppressed"
    | "duplicate"
    | "retry_scheduled"
    | "dead_letter";
  readonly reason?: string;
  readonly provider?: string;
}

export interface NotificationOutboxSchedulerResult {
  readonly claimed: number;
  readonly delivered: number;
  readonly suppressed: number;
  readonly duplicate: number;
  readonly retried: number;
  readonly deadLettered: number;
}

export interface NotificationOutboxSchedulerOptions {
  readonly batchSize: number;
  readonly leaseMs: number;
  readonly maxAttempts: number;
  readonly retryBaseMs: number;
  readonly retryMaxMs: number;
  readonly now?: () => Date;
  readonly observe?: (
    observation: NotificationOutboxObservation,
  ) => void | Promise<void>;
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`NOTIFICATION_INVALID_${label}`);
  }
}

function retryDelayMs(
  attempt: number,
  baseMs: number,
  maxMs: number,
): number {
  const exponent = Math.max(0, attempt - 1);
  return Math.min(maxMs, baseMs * 2 ** exponent);
}

function failureReason(result: NotificationDispatchResult): string {
  return result.status === "failed" ? result.reason : result.status;
}

export class NotificationOutboxScheduler {
  private readonly now: () => Date;

  constructor(
    private readonly repository: NotificationOutboxRepository,
    private readonly dispatcher: NotificationDispatcher,
    private readonly options: NotificationOutboxSchedulerOptions,
  ) {
    assertPositiveInteger(options.batchSize, "BATCH_SIZE");
    if (options.batchSize > 100) {
      throw new Error("NOTIFICATION_INVALID_BATCH_SIZE");
    }
    if (!Number.isSafeInteger(options.leaseMs) || options.leaseMs < 1_000) {
      throw new Error("NOTIFICATION_INVALID_LEASE_MS");
    }
    assertPositiveInteger(options.maxAttempts, "MAX_ATTEMPTS");
    assertPositiveInteger(options.retryBaseMs, "RETRY_BASE_MS");
    assertPositiveInteger(options.retryMaxMs, "RETRY_MAX_MS");
    if (options.retryBaseMs > options.retryMaxMs) {
      throw new Error("NOTIFICATION_INVALID_RETRY_RANGE");
    }
    this.now = options.now ?? (() => new Date());
  }

  async runOnce(): Promise<NotificationOutboxSchedulerResult> {
    const startedAt = this.now();
    const leases = await this.repository.claimDue({
      now: startedAt.toISOString(),
      leaseMs: this.options.leaseMs,
      limit: this.options.batchSize,
    });

    const counts = {
      claimed: leases.length,
      delivered: 0,
      suppressed: 0,
      duplicate: 0,
      retried: 0,
      deadLettered: 0,
    };

    for (const lease of leases) {
      await this.processLease(lease, counts);
    }
    return Object.freeze(counts);
  }

  private async processLease(
    lease: NotificationOutboxLease,
    counts: {
      claimed: number;
      delivered: number;
      suppressed: number;
      duplicate: number;
      retried: number;
      deadLettered: number;
    },
  ): Promise<void> {
    const completedAt = this.now().toISOString();
    let result: NotificationDispatchResult | null = null;
    let failure = "dispatcher_exception";

    try {
      result = await this.dispatcher.dispatch(lease.job.request);
      if (result.status !== "failed") {
        await this.repository.complete({
          tenantId: lease.tenantId,
          outboxId: lease.outboxId,
          leaseToken: lease.leaseToken,
          result,
          completedAt,
        });
        const outcome =
          result.status === "sent" ? "delivered" : result.status;
        counts[outcome === "delivered" ? "delivered" : outcome] += 1;
        await this.options.observe?.({
          tenantId: lease.tenantId,
          outboxId: lease.outboxId,
          attempt: lease.attempts,
          outcome,
          ...(result.status === "sent"
            ? { provider: result.provider }
            : {}),
        });
        return;
      }
      failure = failureReason(result);
    } catch {
      result = null;
    }

    if (lease.attempts >= this.options.maxAttempts) {
      await this.repository.deadLetter({
        tenantId: lease.tenantId,
        outboxId: lease.outboxId,
        leaseToken: lease.leaseToken,
        result,
        error: failure,
        completedAt,
      });
      counts.deadLettered += 1;
      await this.options.observe?.({
        tenantId: lease.tenantId,
        outboxId: lease.outboxId,
        attempt: lease.attempts,
        outcome: "dead_letter",
        reason: failure,
      });
      return;
    }

    const retryAt = new Date(
      this.now().getTime() +
        retryDelayMs(
          lease.attempts,
          this.options.retryBaseMs,
          this.options.retryMaxMs,
        ),
    ).toISOString();
    await this.repository.retry({
      tenantId: lease.tenantId,
      outboxId: lease.outboxId,
      leaseToken: lease.leaseToken,
      nextAttemptAt: retryAt,
      error: failure,
      updatedAt: completedAt,
    });
    counts.retried += 1;
    await this.options.observe?.({
      tenantId: lease.tenantId,
      outboxId: lease.outboxId,
      attempt: lease.attempts,
      outcome: "retry_scheduled",
      reason: failure,
    });
  }
}

export interface NotificationOutboxSchedulerHostOptions {
  readonly intervalMs: number;
  readonly runImmediately?: boolean;
  readonly onRun?: (
    result: NotificationOutboxSchedulerResult,
  ) => void | Promise<void>;
  readonly onError?: (error: unknown) => void | Promise<void>;
}

export class NotificationOutboxSchedulerHost {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;

  constructor(
    private readonly scheduler: NotificationOutboxScheduler,
    private readonly options: NotificationOutboxSchedulerHostOptions,
  ) {
    if (!Number.isSafeInteger(options.intervalMs) || options.intervalMs < 1_000) {
      throw new Error("Notification scheduler interval must be at least 1000ms");
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
      const result = await this.scheduler.runOnce();
      await this.options.onRun?.(result);
    } catch (error) {
      await this.options.onError?.(error);
    }
  }
}

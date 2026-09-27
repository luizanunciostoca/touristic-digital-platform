import { describe, expect, it, vi } from "vitest";

import {
  createNotificationRequest,
  type NotificationDispatcher,
} from "@touristic/notifications";

import type {
  NotificationOutboxLease,
  NotificationOutboxRepository,
} from "./mysql-notification-outbox.js";
import { NotificationOutboxScheduler } from "./outbox-scheduler.js";

const request = createNotificationRequest({
  id: "notification-001",
  idempotencyKey: "notify.ticket.evt-001.user-001",
  destinationId: "morro-de-sao-paulo",
  recipientReference: "user:user-001",
  locale: "pt-BR",
  template: "ticket_confirmation",
  channel: "email",
  variables: { ticketReference: "ticket-001" },
  requestedAt: "2026-09-27T03:00:00.000Z",
});

if (!request) throw new Error("Notification test request must be valid.");

function lease(attempts: number): NotificationOutboxLease {
  return {
    tenantId: "tenant-morro",
    outboxId: request.id,
    job: {
      request,
      deliverAt: "2026-09-27T03:00:00.000Z",
      sourceEventId: "evt-001",
    },
    status: "leased",
    attempts,
    availableAt: "2026-09-27T03:00:00.000Z",
    leaseUntil: "2026-09-27T03:01:00.000Z",
    terminalResult: null,
    lastError: null,
    createdAt: "2026-09-27T03:00:00.000Z",
    updatedAt: "2026-09-27T03:00:00.000Z",
    completedAt: null,
    leaseToken: "lease-001",
  };
}

function repository(
  claimed: NotificationOutboxLease,
): NotificationOutboxRepository & {
  complete: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
  deadLetter: ReturnType<typeof vi.fn>;
} {
  return {
    enqueue: vi.fn(async () => "enqueued" as const),
    claimDue: vi.fn(async () => [claimed]),
    complete: vi.fn(async () => undefined),
    retry: vi.fn(async () => undefined),
    deadLetter: vi.fn(async () => undefined),
    listTenant: vi.fn(async () => []),
  };
}

function options(now = "2026-09-27T03:00:10.000Z") {
  return {
    batchSize: 10,
    leaseMs: 30_000,
    maxAttempts: 3,
    retryBaseMs: 1_000,
    retryMaxMs: 60_000,
    now: () => new Date(now),
  } as const;
}

describe("NotificationOutboxScheduler", () => {
  it("completes successful delivery and records provider-safe observation", async () => {
    const store = repository(lease(1));
    const observe = vi.fn();
    const dispatcher: NotificationDispatcher = {
      dispatch: vi.fn(async () => ({
        status: "sent",
        provider: "test-provider",
        providerMessageId: "message-001",
      })),
    };
    const scheduler = new NotificationOutboxScheduler(store, dispatcher, {
      ...options(),
      observe,
    });

    await expect(scheduler.runOnce()).resolves.toEqual({
      claimed: 1,
      delivered: 1,
      suppressed: 0,
      duplicate: 0,
      retried: 0,
      deadLettered: 0,
    });
    expect(store.complete).toHaveBeenCalledOnce();
    expect(store.retry).not.toHaveBeenCalled();
    expect(observe).toHaveBeenCalledWith({
      tenantId: "tenant-morro",
      outboxId: "notification-001",
      attempt: 1,
      outcome: "delivered",
      provider: "test-provider",
    });
  });

  it("schedules exponential retry before the maximum attempt", async () => {
    const store = repository(lease(2));
    const dispatcher: NotificationDispatcher = {
      dispatch: vi.fn(async () => ({
        status: "failed",
        reason: "providers_failed",
        attemptedProviders: ["test-provider"],
      })),
    };
    const scheduler = new NotificationOutboxScheduler(
      store,
      dispatcher,
      options(),
    );

    await expect(scheduler.runOnce()).resolves.toMatchObject({
      claimed: 1,
      retried: 1,
      deadLettered: 0,
    });
    expect(store.retry).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-morro",
        outboxId: "notification-001",
        nextAttemptAt: "2026-09-27T03:00:12.000Z",
        error: "providers_failed",
      }),
    );
  });

  it("moves an exhausted delivery to the dead letter state", async () => {
    const store = repository(lease(3));
    const dispatcher: NotificationDispatcher = {
      dispatch: vi.fn(async () => {
        throw new Error("provider unavailable");
      }),
    };
    const scheduler = new NotificationOutboxScheduler(
      store,
      dispatcher,
      options(),
    );

    await expect(scheduler.runOnce()).resolves.toMatchObject({
      claimed: 1,
      retried: 0,
      deadLettered: 1,
    });
    expect(store.deadLetter).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-morro",
        outboxId: "notification-001",
        result: null,
        error: "dispatcher_exception",
      }),
    );
  });
});

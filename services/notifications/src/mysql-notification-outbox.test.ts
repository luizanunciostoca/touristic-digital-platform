import { describe, expect, it, vi } from "vitest";
import type { Pool } from "mysql2/promise";

import { createNotificationRequest } from "@touristic/notifications";

import { MySqlNotificationOutboxRepository } from "./mysql-notification-outbox.js";

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

const job = {
  request,
  deliverAt: "2026-09-27T03:05:00.000Z",
  sourceEventId: "evt-001",
} as const;

describe("MySqlNotificationOutboxRepository", () => {
  it("persists an outbox row with tenant scope and scheduled delivery", async () => {
    const execute = vi.fn(async () => [{ affectedRows: 1 }, undefined]);
    const repository = new MySqlNotificationOutboxRepository({
      execute,
    } as unknown as Pool);

    await expect(
      repository.enqueue({
        tenantId: "tenant-morro",
        job,
        enqueuedAt: "2026-09-27T03:00:00.000Z",
      }),
    ).resolves.toBe("enqueued");

    const parameters = execute.mock.calls[0]?.[1] as unknown[];
    expect(parameters[0]).toBe("tenant-morro");
    expect(parameters[1]).toBe("notification-001");
    expect(parameters[2]).toBe("notify.ticket.evt-001.user-001");
    expect(parameters[5]).toEqual(new Date("2026-09-27T03:05:00.000Z"));
    expect(JSON.stringify(parameters)).not.toContain("guest@example.com");
  });

  it("requires tenant scope for admin readback", async () => {
    const execute = vi.fn(async () => [[], undefined]);
    const repository = new MySqlNotificationOutboxRepository({
      execute,
    } as unknown as Pool);

    await expect(
      repository.listTenant({ tenantId: "tenant-morro", limit: 25 }),
    ).resolves.toEqual([]);

    const sql = String(execute.mock.calls[0]?.[0]);
    const parameters = execute.mock.calls[0]?.[1] as unknown[];
    expect(sql).toContain("WHERE tenant_id = ?");
    expect(parameters[0]).toBe("tenant-morro");
  });

  it("fails closed when a worker loses its lease", async () => {
    const execute = vi.fn(async () => [{ affectedRows: 0 }, undefined]);
    const repository = new MySqlNotificationOutboxRepository({
      execute,
    } as unknown as Pool);

    await expect(
      repository.retry({
        tenantId: "tenant-morro",
        outboxId: "notification-001",
        leaseToken: "lease-001",
        nextAttemptAt: "2026-09-27T03:06:00.000Z",
        error: "providers_failed",
        updatedAt: "2026-09-27T03:05:00.000Z",
      }),
    ).rejects.toThrow("NOTIFICATION_OUTBOX_LEASE_LOST");
  });
});

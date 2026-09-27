import { describe, expect, it, vi } from "vitest";

import {
  MySqlNotificationIdempotencyStore,
  MySqlNotificationPreferenceStore,
} from "./durable-dispatch-state.js";

describe("durable notification dispatch state", () => {
  it("defaults preferences to deny and upserts explicit choices", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([
        [
          {
            destination_id: "morro-de-sao-paulo",
            recipient_reference: "user_0001",
            topic: "ticket",
            channel: "email",
            allowed: 1,
            updated_at: "2026-09-27T05:00:00.000Z",
          },
        ],
      ]);
    const pool = { execute } as never;
    const store = new MySqlNotificationPreferenceStore(pool);

    await expect(
      store.isAllowed({
        destinationId: "morro-de-sao-paulo",
        recipientReference: "user_0001",
        topic: "ticket",
        channel: "email",
      }),
    ).resolves.toBe(false);

    await store.set({
      destinationId: "morro-de-sao-paulo",
      recipientReference: "user_0001",
      topic: "ticket",
      channel: "email",
      allowed: true,
      updatedAt: "2026-09-27T05:00:00.000Z",
    });

    await expect(
      store.list({
        destinationId: "morro-de-sao-paulo",
        recipientReference: "user_0001",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        topic: "ticket",
        channel: "email",
        allowed: true,
      }),
    ]);
  });

  it("claims idempotency atomically and releases failed delivery claims", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 0 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const pool = { execute } as never;
    const store = new MySqlNotificationIdempotencyStore(pool);

    await expect(store.claim("notify.ticket.event.user")).resolves.toBe(true);
    await expect(store.claim("notify.ticket.event.user")).resolves.toBe(false);
    await expect(
      store.release("notify.ticket.event.user"),
    ).resolves.toBeUndefined();

    expect(execute).toHaveBeenCalledTimes(3);
    expect(String(execute.mock.calls[0]?.[0])).toContain("INSERT IGNORE");
    expect(String(execute.mock.calls[2]?.[0])).toContain("DELETE FROM");
  });
});

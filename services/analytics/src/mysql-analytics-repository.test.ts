import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";
import type { Pool } from "mysql2/promise";

import { MySqlAnalyticsEventRepository } from "./mysql-analytics-repository.js";

describe("MySqlAnalyticsEventRepository privacy", () => {
  it("persists only the SHA-256 session hash, never the raw session id", async () => {
    const execute = vi.fn(async () => [
      { affectedRows: 1 },
      undefined,
    ]);
    const repository = new MySqlAnalyticsEventRepository({
      execute,
    } as unknown as Pool);

    const rawSessionId = "session-private-001";
    await expect(
      repository.record({
        event: {
          schemaVersion: "1",
          eventId: "event-001",
          name: "session_started",
          occurredAt: "2026-09-20T10:00:00.000Z",
          sessionId: rawSessionId,
          attributes: {},
        },
        receivedAt: "2026-09-20T10:00:01.000Z",
        retentionUntil: "2026-12-19T10:00:01.000Z",
      }),
    ).resolves.toBe("stored");

    const parameters = execute.mock.calls[0]?.[1] as unknown[];
    const expectedHash = createHash("sha256")
      .update(rawSessionId, "utf8")
      .digest("hex");

    expect(parameters[4]).toBe(expectedHash);
    expect(JSON.stringify(parameters)).not.toContain(rawSessionId);
  });
});

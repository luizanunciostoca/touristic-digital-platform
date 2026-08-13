import { describe, expect, it } from "vitest";

import { MySqlCrmTrialRepository } from "./mysql-trials-repository.js";

type Call = { sql: string; values: unknown[] | undefined };

function poolFixture(response: { affectedRows: number }) {
  const calls: Call[] = [];
  const pool = {
    execute: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      return [response, []];
    },
  };
  return { pool, calls };
}

describe("CRM M96 MySQL trial notification heartbeat", () => {
  it("renews only the notification claim owned by the same task uid", async () => {
    const renewedAt = new Date("2026-08-13T00:03:00.000Z");
    const { pool, calls } = poolFixture({ affectedRows: 1 });
    const repository = new MySqlCrmTrialRepository(pool as never);

    await expect(
      repository.renewNotificationClaim(41, "notify-41", renewedAt),
    ).resolves.toBe(true);

    expect(calls[0]?.sql).toContain("notification_claimed_at = ?");
    expect(calls[0]?.sql).toContain("status = 'expired'");
    expect(calls[0]?.sql).toContain("notified_at IS NULL");
    expect(calls[0]?.sql).toContain("notification_task_uid = ?");
    expect(calls[0]?.values).toEqual([renewedAt, 41, "notify-41"]);
  });

  it("reports lost ownership when no row matches the heartbeat uid", async () => {
    const { pool } = poolFixture({ affectedRows: 0 });
    const repository = new MySqlCrmTrialRepository(pool as never);

    await expect(
      repository.renewNotificationClaim(
        41,
        "stale-owner",
        new Date("2026-08-13T00:03:00.000Z"),
      ),
    ).resolves.toBe(false);
  });
});

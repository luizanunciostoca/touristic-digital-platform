import { describe, expect, it } from "vitest";

import { applyCrmM95Schema } from "./index.js";
import { crmM95TrialsNotificationLeaseSchemaSql } from "./trials-schema.js";

describe("CRM M95 trials notification lease schema", () => {
  it("defines a lease timestamp and a dedicated stale-claim lookup index", () => {
    expect(crmM95TrialsNotificationLeaseSchemaSql).toContain(
      "notification_claimed_at TIMESTAMP(3) NULL",
    );
    expect(crmM95TrialsNotificationLeaseSchemaSql).toContain(
      "crm_trials_notification_lease_idx",
    );
  });

  it("skips the M95 ALTER TABLE when the lease column already exists", async () => {
    const queries: string[] = [];
    const pool = {
      query: async (sql: string) => {
        queries.push(sql);
        if (sql.includes("COLUMN_NAME = 'notification_task_uid'")) {
          return [[{ COLUMN_NAME: "notification_task_uid" }], []];
        }
        if (sql.includes("COLUMN_NAME = 'notification_claimed_at'")) {
          return [[{ COLUMN_NAME: "notification_claimed_at" }], []];
        }
        return [[], []];
      },
    };

    await applyCrmM95Schema(pool as never);
    expect(
      queries.filter((sql) =>
        sql.includes("ADD COLUMN notification_claimed_at"),
      ),
    ).toHaveLength(0);
  });

  it("upgrades an M94 database exactly once when the lease column is absent", async () => {
    const queries: string[] = [];
    const pool = {
      query: async (sql: string) => {
        queries.push(sql);
        if (sql.includes("COLUMN_NAME = 'notification_task_uid'")) {
          return [[{ COLUMN_NAME: "notification_task_uid" }], []];
        }
        if (sql.includes("COLUMN_NAME = 'notification_claimed_at'")) {
          return [[], []];
        }
        return [[], []];
      },
    };

    await applyCrmM95Schema(pool as never);
    const leaseAlter = queries.filter((sql) =>
      sql.includes("ADD COLUMN notification_claimed_at"),
    );
    expect(leaseAlter).toHaveLength(1);
    expect(leaseAlter[0]).toContain("crm_trials_notification_lease_idx");
  });
});

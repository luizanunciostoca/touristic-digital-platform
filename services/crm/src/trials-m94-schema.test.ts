import { describe, expect, it } from "vitest";

import { applyCrmM94Schema } from "./index.js";
import { crmM94TrialsNotificationClaimSchemaSql } from "./trials-schema.js";

describe("CRM M94 trials notification claim schema", () => {
  it("defines a separate durable notification claim column and pending index", () => {
    expect(crmM94TrialsNotificationClaimSchemaSql).toContain(
      "notification_task_uid VARCHAR(191) NULL",
    );
    expect(crmM94TrialsNotificationClaimSchemaSql).toContain(
      "crm_trials_notification_pending_idx",
    );
  });

  it("skips ALTER TABLE when an existing database already has the claim column", async () => {
    const queries: string[] = [];
    const pool = {
      query: async (sql: string) => {
        queries.push(sql);
        if (sql.includes("information_schema.COLUMNS")) {
          return [[{ COLUMN_NAME: "notification_task_uid" }], []];
        }
        return [[], []];
      },
    };

    await applyCrmM94Schema(pool as never);
    expect(
      queries.filter((sql) => sql.includes("ALTER TABLE crm_trials")),
    ).toHaveLength(0);
  });

  it("upgrades an existing database exactly once when the claim column is absent", async () => {
    const queries: string[] = [];
    const pool = {
      query: async (sql: string) => {
        queries.push(sql);
        if (sql.includes("information_schema.COLUMNS")) return [[], []];
        return [[], []];
      },
    };

    await applyCrmM94Schema(pool as never);
    const alterStatements = queries.filter((sql) =>
      sql.includes("ALTER TABLE crm_trials"),
    );
    expect(alterStatements).toHaveLength(1);
    expect(alterStatements[0]).toContain("notification_task_uid");
  });
});

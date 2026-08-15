import { describe, expect, it } from "vitest";

import { MySqlCrmMetricsRepository } from "./mysql-metrics-repository.js";

type Call = { sql: string; values: unknown[] | undefined };

function poolFixture(responses: unknown[]) {
  const calls: Call[] = [];
  const lifecycle: string[] = [];
  const connection = {
    query: async (sql: string) => {
      lifecycle.push(sql);
      return [[], []];
    },
    execute: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return [next ?? [], []];
    },
    commit: async () => void lifecycle.push("COMMIT"),
    rollback: async () => void lifecycle.push("ROLLBACK"),
    release: () => void lifecycle.push("RELEASE"),
  };
  const pool = {
    getConnection: async () => connection,
  };
  return { pool, calls, lifecycle };
}

describe("CRM M138 authoritative dashboard metrics", () => {
  it("reproduces the frozen V1 funnel semantics from one consistent read-only snapshot", async () => {
    const createdAt = new Date("2026-08-15T04:00:00.000Z");
    const interactionAt = new Date("2026-08-15T04:30:00.000Z");
    const { pool, calls, lifecycle } = poolFixture([
      [
        {
          total: 8,
          active: 6,
          converted: 2,
          lost: 1,
          total_revenue: "598.50",
        },
      ],
      [
        { stage: "new_lead", count: 2 },
        { stage: "first_contact", count: 1 },
        { stage: "meeting_scheduled", count: 1 },
        { stage: "proposal_sent", count: 1 },
        { stage: "active_client", count: 2 },
        { stage: "lost", count: 1 },
      ],
      [
        {
          id: 8,
          company_name: "Toca",
          stage: "active_client",
          created_at: createdAt,
        },
      ],
      [
        {
          id: 21,
          lead_id: 8,
          type: "stage_change",
          content: "Etapa atualizada",
          created_at: interactionAt,
        },
      ],
    ]);
    const repository = new MySqlCrmMetricsRepository(pool as never);

    const result = await repository.readSnapshot();

    expect(result.total).toBe(8);
    expect(result.active).toBe(6);
    expect(result.converted).toBe(2);
    expect(result.lost).toBe(1);
    expect(result.conversionRate).toBe(25);
    expect(result.totalRevenue).toBe("598.50");
    expect(result.stageGroups.active_client).toBe(2);
    expect(result.stageGroups.contract_signed).toBe(0);
    expect(result.stageGroups.churned).toBe(0);
    expect(result.stageConversion[0]).toEqual({
      stage: "new_lead",
      count: 2,
      conversionRate: 25,
    });
    expect(result.stageConversion[1]).toEqual({
      stage: "first_contact",
      count: 1,
      conversionRate: 50,
    });
    expect(result.recentLeads).toEqual([
      {
        id: 8,
        companyName: "Toca",
        stage: "active_client",
        createdAt,
      },
    ]);
    expect(result.recentInteractions).toEqual([
      {
        id: 21,
        leadId: 8,
        type: "stage_change",
        content: "Etapa atualizada",
        createdAt: interactionAt,
      },
    ]);
    expect(calls).toHaveLength(4);
    expect(calls[0]?.sql).toContain("status = 'lost' OR stage = 'lost'");
    expect(calls[0]?.sql).toContain("stage = 'active_client'");
    expect(calls[2]?.sql).toContain("LIMIT 5");
    expect(calls[3]?.sql).toContain("LIMIT 10");
    expect(calls.every((call) => call.values === undefined)).toBe(true);
    expect(lifecycle).toEqual([
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ",
      "START TRANSACTION READ ONLY",
      "COMMIT",
      "RELEASE",
    ]);
  });

  it("fails closed when grouped stage authority does not reconcile with the aggregate", async () => {
    const { pool, lifecycle } = poolFixture([
      [
        {
          total: 2,
          active: 2,
          converted: 0,
          lost: 0,
          total_revenue: "0.00",
        },
      ],
      [{ stage: "new_lead", count: 1 }],
      [],
      [],
    ]);
    const repository = new MySqlCrmMetricsRepository(pool as never);

    await expect(repository.readSnapshot()).rejects.toThrow(
      "CRM_METRICS_STAGE_TOTAL_MISMATCH",
    );
    expect(lifecycle.at(-1)).toBe("RELEASE");
  });

  it("rejects unknown persisted stage vocabulary instead of silently dropping it", async () => {
    const { pool } = poolFixture([
      [
        {
          total: 1,
          active: 1,
          converted: 0,
          lost: 0,
          total_revenue: "0.00",
        },
      ],
      [{ stage: "future_stage", count: 1 }],
      [],
      [],
    ]);
    const repository = new MySqlCrmMetricsRepository(pool as never);

    await expect(repository.readSnapshot()).rejects.toThrow(
      "CRM_METRICS_INVALID_STAGE",
    );
  });

  it("rolls back and releases the connection when any snapshot query fails", async () => {
    const { pool, lifecycle } = poolFixture([
      [
        {
          total: 1,
          active: 1,
          converted: 0,
          lost: 0,
          total_revenue: "0.00",
        },
      ],
      new Error("MYSQL_READ_FAILED"),
    ]);
    const repository = new MySqlCrmMetricsRepository(pool as never);

    await expect(repository.readSnapshot()).rejects.toThrow("MYSQL_READ_FAILED");
    expect(lifecycle).toEqual([
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ",
      "START TRANSACTION READ ONLY",
      "ROLLBACK",
      "RELEASE",
    ]);
  });
});

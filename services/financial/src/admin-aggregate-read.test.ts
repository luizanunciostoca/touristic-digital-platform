import type { Pool } from "mysql2/promise";
import { describe, expect, it, vi } from "vitest";

import { MySqlPaymentRepository } from "./mysql-payment-repository.js";
import { MySqlFinancialReconciliationRepository } from "./mysql-reconciliation-repository.js";

describe("Financial owner admin aggregate reads", () => {
  it("aggregates confirmed revenue for a large payment batch in one query", async () => {
    const execute = vi.fn(async (sql: string, parameters?: unknown[]) => {
      void sql;
      void parameters;
      return [
        [{ currency: "BRL", amount_minor: "123456", payment_count: "80" }],
        [],
      ];
    });
    const repository = new MySqlPaymentRepository({
      execute,
    } as unknown as Pool);
    const ids = Array.from(
      { length: 80 },
      (_, index) => `pay_admin_${String(index + 1).padStart(4, "0")}`,
    );

    const result = await repository.aggregateConfirmedByIds(ids, {
      from: "2026-09-21T00:00:00.000Z",
      to: "2026-09-22T00:00:00.000Z",
    });

    expect(result).toEqual([
      { currency: "BRL", minorUnits: "123456", paymentCount: 80 },
    ]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]?.[0]).toContain("status = 'confirmed'");
    expect(execute.mock.calls[0]?.[0]).toContain("confirmed_at >= ?");
    expect(execute.mock.calls[0]?.[0]).toContain("confirmed_at < ?");
    expect(execute.mock.calls[0]?.[1]).toHaveLength(82);
  });

  it("returns authoritative zero without querying when the payment set is empty", async () => {
    const execute = vi.fn(async (sql: string, parameters?: unknown[]) => {
      void sql;
      void parameters;
      return [[], []];
    });
    const repository = new MySqlPaymentRepository({
      execute,
    } as unknown as Pool);

    await expect(repository.aggregateConfirmedByIds([])).resolves.toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects oversized payment batches", async () => {
    const execute = vi.fn(async (sql: string, parameters?: unknown[]) => {
      void sql;
      void parameters;
      return [[], []];
    });
    const repository = new MySqlPaymentRepository({
      execute,
    } as unknown as Pool);
    const ids = Array.from(
      { length: 501 },
      (_, index) => `pay_admin_${String(index + 1).padStart(4, "0")}`,
    );

    await expect(repository.aggregateConfirmedByIds(ids)).rejects.toThrow(
      "FINANCIAL_ADMIN_PAYMENT_BATCH_INVALID",
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("lists only open reconciliation findings and returns the authoritative count", async () => {
    const execute = vi.fn(async (sql: string, parameters?: unknown[]) => {
      void sql;
      void parameters;
      return [
        [
          {
            reconciliation_finding_id: "rcf_admin_00000001",
            payment_id: "pay_admin_0001",
            kind: "amount_mismatch",
            severity: "critical",
            evidence_hash: Buffer.alloc(32, 3),
            expected_value: "1000",
            observed_value: "900",
            state: "open",
            first_seen_at: "2026-09-21T10:00:00.000Z",
            last_seen_at: "2026-09-21T11:00:00.000Z",
            acknowledged_at: null,
            acknowledged_by: null,
            resolved_at: null,
            total_count: "3",
          },
        ],
        [],
      ];
    });
    const repository = new MySqlFinancialReconciliationRepository({
      execute,
    } as unknown as Pool);

    const result = await repository.listPendingReviewByPaymentIds(
      ["pay_admin_0001", "pay_admin_0002"],
      10,
    );

    expect(result.total).toBe(3);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      id: "rcf_admin_00000001",
      paymentId: "pay_admin_0001",
      state: "open",
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]?.[0]).toContain("f.state = 'open'");
    expect(execute.mock.calls[0]?.[0]).toContain("COUNT(*) OVER()");
    expect(execute.mock.calls[0]?.[1]).toEqual([
      "pay_admin_0001",
      "pay_admin_0002",
      10,
    ]);
  });
});

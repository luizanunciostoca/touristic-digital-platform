import { describe, expect, it, vi } from "vitest";

import {
  capturePricingSnapshot,
  createBusinessOrderRequestKey,
  createOrder,
  createPricingQuote,
  normalizeOrderId,
  normalizeOrderSourceReference,
} from "@touristic/ordering";

import { MySqlOrderRepository } from "./mysql-order-repository.js";
import { orderingM137SchemaSql } from "./schema.js";

function order() {
  const id = normalizeOrderId("ord_12345678");
  const requestKey = createBusinessOrderRequestKey(
    "session_123",
    "performance",
  );
  const source = normalizeOrderSourceReference("demo_business_123");
  const quote = createPricingQuote({
    planId: "performance",
    planName: "Performance",
    minorUnits: 49_900,
    currency: "BRL",
    pricingVersion: "plans_2026_08",
  });
  if (!id || !requestKey || !source || !quote)
    throw new Error("TEST_FIXTURE_INVALID");
  const pricing = capturePricingSnapshot(quote, "2026-08-14T19:30:00Z");
  if (!pricing) throw new Error("TEST_FIXTURE_INVALID");
  const value = createOrder({
    id,
    requestKey,
    source,
    status: "draft",
    pricing,
    createdAt: "2026-08-14T19:31:00Z",
    updatedAt: "2026-08-14T19:31:00Z",
  });
  if (!value) throw new Error("TEST_FIXTURE_INVALID");
  return value;
}

function row(value = order()) {
  return {
    order_id: value.id,
    request_key: value.requestKey,
    source_kind: value.source.kind,
    source_reference: value.source.reference,
    status: value.status,
    plan_id: value.pricing.planId,
    plan_name: value.pricing.planName,
    amount_minor: value.pricing.amount.minorUnits,
    currency: value.pricing.amount.currency,
    pricing_version: value.pricing.pricingVersion,
    pricing_captured_at: new Date(value.pricing.capturedAt),
    created_at: new Date(value.createdAt),
    updated_at: new Date(value.updatedAt),
  };
}

describe("M137 Ordering schema", () => {
  it("owns Order persistence without financial/provider tables", () => {
    expect(orderingM137SchemaSql).toContain(
      "CREATE TABLE IF NOT EXISTS ordering_orders",
    );
    expect(orderingM137SchemaSql).toContain(
      "request_key VARCHAR(220) COLLATE utf8mb4_bin NOT NULL UNIQUE",
    );
    expect(orderingM137SchemaSql).toContain(
      "amount_minor BIGINT UNSIGNED NOT NULL",
    );
    expect(orderingM137SchemaSql).toContain(
      "pricing_version VARCHAR(80) COLLATE utf8mb4_bin NOT NULL",
    );
    expect(orderingM137SchemaSql).toContain(
      "CHECK (amount_minor <= 9007199254740991)",
    );
    expect(orderingM137SchemaSql).not.toContain("financial_payments");
    expect(orderingM137SchemaSql).not.toContain("provider_token");
  });
});

describe("M137 MySqlOrderRepository", () => {
  it("uses parameterized writes and preserves immutable pricing on update", async () => {
    const initial = order();
    const updated = createOrder({
      ...initial,
      status: "pending_payment",
      updatedAt: "2026-08-14T19:35:00Z",
    });
    if (!updated) throw new Error("TEST_FIXTURE_INVALID");

    let selected = row(initial);
    const execute = vi.fn(async (sql: string, params?: readonly unknown[]) => {
      if (sql.includes("INSERT IGNORE")) return [{ affectedRows: 0 }, []];
      if (sql.includes("UPDATE ordering_orders")) {
        expect(sql).not.toContain("plan_id =");
        expect(sql).not.toContain("amount_minor =");
        expect(sql).toContain("AND status = ? AND updated_at = ?");
        selected = row(updated);
        return [{ affectedRows: 1 }, []];
      }
      if (sql.includes("WHERE order_id = ?")) return [[selected], []];
      throw new Error(`Unexpected SQL: ${sql} ${String(params?.length ?? 0)}`);
    });
    const repository = new MySqlOrderRepository({ execute } as never);

    await expect(repository.save(updated)).resolves.toMatchObject({
      id: initial.id,
      status: "pending_payment",
      pricing: {
        ...initial.pricing,
        capturedAt: "2026-08-14T19:30:00.000Z",
      },
      createdAt: "2026-08-14T19:31:00.000Z",
      updatedAt: "2026-08-14T19:35:00.000Z",
    });
    expect(
      execute.mock.calls.some(([sql]) =>
        String(sql).includes("UPDATE ordering_orders"),
      ),
    ).toBe(true);
  });

  it("does not mutate another order when the unique request key already belongs elsewhere", async () => {
    const value = order();
    const conflictingRow = {
      ...row(value),
      order_id: "ord_87654321",
    };
    const execute = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT IGNORE")) return [{ affectedRows: 0 }, []];
      if (sql.includes("WHERE order_id = ?")) return [[], []];
      if (sql.includes("WHERE request_key = ?")) return [[conflictingRow], []];
      if (sql.includes("UPDATE ordering_orders")) {
        throw new Error("UPDATE_MUST_NOT_RUN");
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const repository = new MySqlOrderRepository({ execute } as never);

    await expect(repository.save(value)).rejects.toThrow(
      "ORDERING_REQUEST_KEY_CONFLICT",
    );
    expect(
      execute.mock.calls.some(([sql]) =>
        String(sql).includes("UPDATE ordering_orders"),
      ),
    ).toBe(false);
  });

  it("rejects a lost update when the compare-and-swap predicate no longer matches", async () => {
    const initial = order();
    const updated = createOrder({
      ...initial,
      status: "pending_payment",
      updatedAt: "2026-08-14T19:35:00Z",
    });
    if (!updated) throw new Error("TEST_FIXTURE_INVALID");

    const execute = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT IGNORE")) return [{ affectedRows: 0 }, []];
      if (sql.includes("WHERE order_id = ?")) return [[row(initial)], []];
      if (sql.includes("UPDATE ordering_orders"))
        return [{ affectedRows: 0 }, []];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const repository = new MySqlOrderRepository({ execute } as never);

    await expect(repository.save(updated)).rejects.toThrow(
      "ORDERING_CONCURRENT_ORDER_MODIFICATION",
    );
  });

  it("rejects corrupted persisted pricing instead of rehydrating it", async () => {
    const corrupted = { ...row(), amount_minor: "9007199254740992" };
    const execute = vi.fn(async () => [[corrupted], []]);
    const repository = new MySqlOrderRepository({ execute } as never);

    await expect(repository.findById(order().id)).rejects.toThrow(
      "ORDERING_INVALID_PERSISTED_ORDER",
    );
  });
});

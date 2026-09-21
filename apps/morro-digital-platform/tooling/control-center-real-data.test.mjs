import { describe, expect, it } from "vitest";

import { createPaymentsApi } from "./payments-api.mjs";

function record(destinationId, index) {
  return Object.freeze({
    orderId: `ord_${destinationId}_${String(index).padStart(4, "0")}`,
    paymentId: `pay_${destinationId}_${String(index).padStart(4, "0")}`,
    destinationId,
  });
}

describe("Control Center real-data financial aggregate", () => {
  it("aggregates more than 30 payments without per-payment reads and isolates destinations", async () => {
    const records = new Map([
      [
        "morro-de-sao-paulo",
        Array.from({ length: 40 }, (_, index) =>
          record("morro-de-sao-paulo", index + 1),
        ),
      ],
      [
        "itacare",
        Array.from({ length: 45 }, (_, index) => record("itacare", index + 1)),
      ],
    ]);
    const calls = { access: 0, revenue: 0, review: 0, findById: 0 };
    const api = createPaymentsApi({
      adminRead: {
        checkoutAccess: {
          async listByDestinationId(destinationId) {
            calls.access += 1;
            return { records: records.get(destinationId) ?? [], nextCursor: null };
          },
        },
        payments: {
          findById() {
            calls.findById += 1;
            throw new Error("N_PLUS_ONE_READ_FORBIDDEN");
          },
          async aggregateConfirmedByIds(paymentIds) {
            calls.revenue += 1;
            const morro = paymentIds.every((id) =>
              id.startsWith("pay_morro-de-sao-paulo_"),
            );
            const itacare = paymentIds.every((id) =>
              id.startsWith("pay_itacare_"),
            );
            if (!morro && !itacare) throw new Error("CROSS_DESTINATION_BATCH");
            return [
              {
                currency: "BRL",
                minorUnits: String(paymentIds.length * (morro ? 100 : 200)),
                paymentCount: paymentIds.length,
              },
            ];
          },
        },
        reconciliation: {
          async listPendingReviewByPaymentIds(paymentIds) {
            calls.review += 1;
            if (paymentIds[0]?.startsWith("pay_morro-de-sao-paulo_")) {
              return {
                total: 1,
                findings: [
                  {
                    id: "rcf_morro_open_0001",
                    paymentId: paymentIds[0],
                    kind: "provider_amount_mismatch",
                    severity: "critical",
                    state: "open",
                    lastSeenAt: "2026-09-21T12:00:00.000Z",
                  },
                ],
              };
            }
            return { total: 0, findings: [] };
          },
        },
      },
      audit: () => undefined,
    });

    const result = await api.adminAggregateDestinations({
      destinationIds: ["morro-de-sao-paulo", "itacare"],
    });

    expect(result.status).toBe("found");
    const byId = new Map(
      result.data.destinations.map((item) => [item.destinationId, item]),
    );
    expect(byId.get("morro-de-sao-paulo")).toMatchObject({
      status: "READY",
      revenue: {
        status: "READY",
        currencies: [
          { currency: "BRL", minorUnits: "4000", paymentCount: 40 },
        ],
        scannedPayments: 40,
      },
      financialAttention: {
        status: "READY",
        count: 1,
        knownCount: 1,
      },
    });
    expect(byId.get("itacare")).toMatchObject({
      status: "READY",
      revenue: {
        status: "READY",
        currencies: [
          { currency: "BRL", minorUnits: "9000", paymentCount: 45 },
        ],
        scannedPayments: 45,
      },
      financialAttention: {
        status: "READY",
        count: 0,
        knownCount: 0,
      },
    });
    expect(
      byId.get("morro-de-sao-paulo").financialAttention.items[0].destinationId,
    ).toBe("morro-de-sao-paulo");
    expect(calls).toEqual({
      access: 2,
      revenue: 2,
      review: 2,
      findById: 0,
    });
  });

  it("distinguishes authoritative zero from unavailable owner", async () => {
    const empty = createPaymentsApi({
      adminRead: {
        checkoutAccess: {
          async listByDestinationId() {
            return { records: [], nextCursor: null };
          },
        },
        payments: {
          async aggregateConfirmedByIds() {
            throw new Error("EMPTY_DATASET_MUST_NOT_QUERY_FINANCIAL");
          },
        },
        reconciliation: {
          async listPendingReviewByPaymentIds() {
            throw new Error("EMPTY_DATASET_MUST_NOT_QUERY_RECONCILIATION");
          },
        },
      },
      audit: () => undefined,
    });
    const emptyResult = await empty.adminAggregateDestinations({
      destinationId: "itacare",
    });
    expect(emptyResult).toMatchObject({
      status: "found",
      data: {
        destinations: [
          {
            destinationId: "itacare",
            status: "READY",
            revenue: { status: "READY", currencies: [], scannedPayments: 0 },
            financialAttention: {
              status: "READY",
              count: 0,
              knownCount: 0,
            },
          },
        ],
      },
    });

    const unavailable = createPaymentsApi({
      adminRead: {
        checkoutAccess: {},
        payments: {},
        reconciliation: {},
      },
      audit: () => undefined,
    });
    await expect(
      unavailable.adminAggregateDestinations({ destinationId: "itacare" }),
    ).resolves.toEqual({ status: "unavailable", data: null });
  });

  it("fails closed when an owner returns a cross-destination row", async () => {
    const scoped = createPaymentsApi({
      adminRead: {
        checkoutAccess: {
          async listByDestinationId() {
            return {
              records: [
                {
                  orderId: "ord_wrong_0001",
                  paymentId: "pay_wrong_0001",
                  destinationId: "itacare",
                },
              ],
              nextCursor: null,
            };
          },
        },
        payments: {
          async aggregateConfirmedByIds() {
            throw new Error("WRONG_SCOPE_MUST_NOT_REACH_FINANCIAL");
          },
        },
        reconciliation: {
          async listPendingReviewByPaymentIds() {
            throw new Error("WRONG_SCOPE_MUST_NOT_REACH_RECONCILIATION");
          },
        },
      },
      audit: () => undefined,
    });
    const result = await scoped.adminAggregateDestinations({
      destinationId: "morro-de-sao-paulo",
    });
    expect(result).toMatchObject({
      status: "found",
      data: {
        destinations: [
          {
            destinationId: "morro-de-sao-paulo",
            status: "UNAVAILABLE",
            revenue: { status: "UNAVAILABLE", currencies: null },
            financialAttention: { status: "UNAVAILABLE", count: null },
          },
        ],
      },
    });
  });

  it("bounds large datasets by owner pages instead of one query per payment", async () => {
    let page = 0;
    const calls = { access: 0, revenue: 0, review: 0 };
    const api = createPaymentsApi({
      adminRead: {
        checkoutAccess: {
          async listByDestinationId(destinationId) {
            calls.access += 1;
            const start = page * 250;
            const records = Array.from({ length: 250 }, (_, offset) =>
              record(destinationId, start + offset + 1),
            );
            page += 1;
            return {
              records,
              nextCursor:
                page <= 20 ? records[records.length - 1].orderId : null,
            };
          },
        },
        payments: {
          async aggregateConfirmedByIds(paymentIds) {
            calls.revenue += 1;
            return [
              {
                currency: "BRL",
                minorUnits: String(paymentIds.length),
                paymentCount: paymentIds.length,
              },
            ];
          },
        },
        reconciliation: {
          async listPendingReviewByPaymentIds() {
            calls.review += 1;
            return { total: 0, findings: [] };
          },
        },
      },
      audit: () => undefined,
    });

    const result = await api.adminAggregateDestinations({
      destinationId: "morro-de-sao-paulo",
    });
    expect(result.data.destinations[0]).toMatchObject({
      status: "PARTIAL",
      revenue: {
        status: "PARTIAL",
        currencies: [
          { currency: "BRL", minorUnits: "5000", paymentCount: 5000 },
        ],
        scannedPayments: 5000,
        complete: false,
      },
      financialAttention: {
        status: "PARTIAL",
        count: null,
        knownCount: 0,
        complete: false,
      },
    });
    expect(calls).toEqual({ access: 20, revenue: 20, review: 20 });
    expect(calls.revenue).toBeLessThan(5000);
  });
});

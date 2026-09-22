import { describe, expect, it, vi } from "vitest";

import {
  createDestinationAdminAdapter,
  createFinancialAdminAdapter,
} from "./admin-domain-adapters.mjs";

function responseCapture() {
  return {
    statusCode: 0,
    body: "",
    headers: new Map(),
    setHeader(name, value) {
      this.headers.set(String(name).toLowerCase(), String(value));
    },
    end(value = "") {
      this.body = String(value);
    },
  };
}

function request() {
  return {
    method: "GET",
    headers: {},
    socket: { remoteAddress: "203.0.113.20" },
    morroCorrelationId: "corr_real_data_adapter",
  };
}

function paymentsBoundary(overrides = {}) {
  return {
    handle: vi.fn(),
    adminFindOrder: vi.fn(),
    adminFindPayment: vi.fn(),
    adminResolvePaymentTenant: vi.fn(),
    adminResolveFindingTenant: vi.fn(),
    adminFindLedger: vi.fn(),
    ...overrides,
  };
}

describe("Control Center real-data owner adapters", () => {
  it("delegates destination aggregates to the Payments owner boundary", async () => {
    const adminAggregateDestinations = vi.fn(async (input) => ({
      status: "found",
      data: {
        destinations: input.destinationIds.map((destinationId) => ({
          destinationId,
          status: "READY",
          revenue: {
            status: "READY",
            currencies: [],
            scannedPayments: 0,
            complete: true,
          },
          financialAttention: {
            status: "READY",
            count: 0,
            knownCount: 0,
            items: [],
            complete: true,
          },
        })),
      },
    }));
    const adapter = createFinancialAdminAdapter(
      paymentsBoundary({ adminAggregateDestinations }),
    );

    await expect(
      adapter.aggregateDestinations({
        destinationIds: ["morro-de-sao-paulo", "itacare"],
      }),
    ).resolves.toMatchObject({
      status: "found",
      data: {
        destinations: [
          { destinationId: "morro-de-sao-paulo" },
          { destinationId: "itacare" },
        ],
      },
    });

    const response = responseCapture();
    const url = new URL(
      "http://localhost/api/admin/v1/financial/destinations/aggregate?destinationId=morro-de-sao-paulo&destinationId=itacare",
    );
    await adapter.handle({ request: request(), response, requestUrl: url });
    expect(response.statusCode).toBe(200);
    expect(adminAggregateDestinations).toHaveBeenLastCalledWith({
      destinationIds: ["morro-de-sao-paulo", "itacare"],
      from: null,
      to: null,
    });
  });

  it("preserves unavailable instead of emitting a zero aggregate", async () => {
    const adapter = createFinancialAdminAdapter(paymentsBoundary());
    await expect(
      adapter.aggregateDestinations({
        destinationIds: ["morro-de-sao-paulo"],
      }),
    ).resolves.toEqual({ status: "unavailable", data: null });

    const response = responseCapture();
    const url = new URL(
      "http://localhost/api/admin/v1/financial/destinations/aggregate?destinationId=morro-de-sao-paulo",
    );
    await adapter.handle({ request: request(), response, requestUrl: url });
    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toEqual({
      error: "FINANCIAL_ADMIN_AGGREGATE_UNAVAILABLE",
    });
  });

  it("lists destinations strictly from the canonical Destination owner", async () => {
    const service = {
      async list() {
        return [
          { id: "morro-de-sao-paulo", branding: { name: "Morro" } },
          { id: "itacare", branding: { name: "Itacare" } },
        ];
      },
    };
    const adapter = createDestinationAdminAdapter({ service });
    await expect(adapter.listOwnerDestinations()).resolves.toEqual({
      status: "found",
      data: [
        { id: "morro-de-sao-paulo", branding: { name: "Morro" } },
        { id: "itacare", branding: { name: "Itacare" } },
      ],
    });

    const unavailable = createDestinationAdminAdapter(null);
    await expect(unavailable.listOwnerDestinations()).resolves.toEqual({
      status: "unavailable",
      data: null,
    });
  });
});

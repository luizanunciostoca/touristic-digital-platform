import { describe, expect, it } from "vitest";

import {
  createTicketingApi,
  sanitizeTicketingFinancialFailure,
} from "./ticketing-api.mjs";

function authApi() {
  return {
    resolveSession: async () => null,
    authorizeMutation: () => ({ allowed: false }),
  };
}

describe("ticketing startup configuration", () => {
  it("starts in a safe disabled state when the feature flag is omitted", async () => {
    const api = createTicketingApi({
      authApi: authApi(),
      getEnvironmentValue: () => "",
      audit: () => {},
    });

    await expect(api.start()).resolves.toBe(true);
    await api.stop();
  });

  it("rejects an invalid feature flag instead of silently disabling Ticketing", async () => {
    const api = createTicketingApi({
      authApi: authApi(),
      getEnvironmentValue: (key) =>
        key === "TICKETING_FEATURE_ENABLED" ? "TRUE" : "",
      audit: () => {},
    });

    await expect(api.start()).resolves.toBe(false);
  });

  it("fails closed when Ticketing is enabled without mandatory dependencies", async () => {
    const api = createTicketingApi({
      authApi: authApi(),
      getEnvironmentValue: (key) =>
        key === "TICKETING_FEATURE_ENABLED" ? "true" : "",
      audit: () => {},
    });

    await expect(api.start()).resolves.toBe(false);
  });

  it("delegates Control Center admin projections to the injected Ticketing owner service", async () => {
    const adminService = {
      listInventory: async () => [{ offer: { id: "tin_admin_0001" } }],
      readInventory: async () => ({
        projection: { offer: { id: "tin_admin_0001" } },
      }),
      listReservations: async () => [{ reservation: { id: "trv_admin_0001" } }],
      readReservation: async () => ({
        reservation: { id: "trv_admin_0001" },
        events: [],
      }),
      cancelHeldReservation: async () => ({
        previousState: { status: "held" },
        newState: { status: "cancelled" },
        replayed: false,
      }),
    };
    const transportCalls = [];
    const api = createTicketingApi({
      authApi: authApi(),
      publicTransport: {
        handle: async (request) => {
          transportCalls.push(request);
          if (request.pathname.endsWith("/disable")) {
            return {
              status: 200,
              headers: {},
              body: {
                data: {
                  id: "mpi_admin_000000000000000000000000",
                  businessId: "business-admin-0001",
                  enabled: false,
                },
              },
            };
          }
          if (request.pathname.includes("/operator/businesses/")) {
            return {
              status: 201,
              headers: {},
              body: {
                data: {
                  id: "mpi_admin_000000000000000000000000",
                  businessId: "business-admin-0001",
                  enabled: true,
                },
              },
            };
          }
          return { status: 404, headers: {}, body: {} };
        },
      },
      adminService,
      audit: () => {},
    });

    await expect(
      api.adminListInventory({ query: "admin" }),
    ).resolves.toMatchObject({
      status: "found",
      data: [{ offer: { id: "tin_admin_0001" } }],
    });
    await expect(
      api.adminReadReservation("trv_admin_0001"),
    ).resolves.toMatchObject({
      status: "found",
      data: { reservation: { id: "trv_admin_0001" } },
    });
    await expect(
      api.adminCancelHeldReservation({
        reservationId: "trv_admin_0001",
        cancelledAt: "2026-09-21T12:00:00.000Z",
        actorReference: "platform_owner",
      }),
    ).resolves.toMatchObject({
      status: "updated",
      data: { newState: { status: "cancelled" } },
    });

    const ownerRequest = {
      headers: {
        host: "localhost",
        origin: "http://localhost",
        "x-csrf-token": "csrf",
      },
      morroCorrelationId: "corr_admin_inventory_0001",
    };
    await expect(
      api.adminCreateBusinessOffer({
        request: ownerRequest,
        businessId: "business-admin-0001",
        requestKey: "offer_admin_0001",
        offer: { productKind: "tour" },
      }),
    ).resolves.toMatchObject({
      status: "created",
      data: { businessId: "business-admin-0001", enabled: true },
    });
    await expect(
      api.adminDisableBusinessOffer({
        request: ownerRequest,
        businessId: "business-admin-0001",
        inventoryId: "mpi_admin_000000000000000000000000",
      }),
    ).resolves.toMatchObject({
      status: "updated",
      data: { businessId: "business-admin-0001", enabled: false },
    });
    expect(transportCalls).toHaveLength(2);
    expect(transportCalls[0]).toMatchObject({
      method: "POST",
      body: { productKind: "tour" },
    });
    expect(transportCalls[0].headers["idempotency-key"]).toBe(
      "offer_admin_0001",
    );
    expect(transportCalls[1].pathname).toContain(
      "/mpi_admin_000000000000000000000000/disable",
    );
  });
});

const diagnosticStages = [
  "cursor_load",
  "feed_list_after",
  "fulfillment_handle",
  "refund_handle",
  "cursor_save",
];
const diagnosticCodes = [
  "ER_NO_SUCH_TABLE",
  "ER_BAD_FIELD_ERROR",
  "ER_TABLEACCESS_DENIED_ERROR",
  "ER_DBACCESS_DENIED_ERROR",
  "ER_ACCESS_DENIED_ERROR",
  "ER_BAD_DB_ERROR",
  "ER_PARSE_ERROR",
  "ER_WRONG_ARGUMENTS",
  "ER_LOCK_DEADLOCK",
  "ER_LOCK_WAIT_TIMEOUT",
  "ER_DUP_ENTRY",
  "ER_BAD_NULL_ERROR",
  "ER_DATA_TOO_LONG",
  "ER_TRUNCATED_WRONG_VALUE",
  "ER_NO_DEFAULT_FOR_FIELD",
  "PROTOCOL_CONNECTION_LOST",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "TICKETING_FINANCIAL_CURSOR_INVALID",
  "FINANCIAL_INVALID_DB_TIMESTAMP",
  "FINANCIAL_INVALID_PERSISTED_PAYMENT_RESULT",
  "UNKNOWN_FAILURE",
];
describe("ticketing financial audit diagnostics", () => {
  for (const stage of diagnosticStages) {
    it.each(diagnosticCodes)(
      "preserves only the allowed code %s at " + stage,
      (diagnosticCode) => {
        const safe = sanitizeTicketingFinancialFailure({
          stage,
          diagnosticCode,
          message: "SENSITIVE_SENTINEL",
          sql: "SENSITIVE_SENTINEL",
          cause: new Error("SENSITIVE_SENTINEL"),
        });
        expect(safe).toEqual({ stage, code: diagnosticCode });
        expect(Object.isFrozen(safe)).toBe(true);
        expect(JSON.stringify(safe)).not.toContain("SENSITIVE_SENTINEL");
      },
    );
  }
  it.each([
    null,
    undefined,
    42,
    "SENSITIVE_SENTINEL",
    { stage: "SENSITIVE_SENTINEL", diagnosticCode: "SENSITIVE_SENTINEL" },
    {
      stage: {
        toString() {
          throw new Error("SENSITIVE_SENTINEL");
        },
      },
      diagnosticCode: Symbol("SENSITIVE_SENTINEL"),
    },
  ])("redacts invalid diagnostic values %#", (value) => {
    expect(sanitizeTicketingFinancialFailure(value)).toEqual({
      stage: "unclassified",
      code: "UNKNOWN_FAILURE",
    });
  });
  it.each(["stage", "diagnosticCode"])(
    "reads mutable %s only once",
    (property) => {
      let reads = 0;
      const source = {
        stage: "feed_list_after",
        diagnosticCode: "ER_WRONG_ARGUMENTS",
      };
      Object.defineProperty(source, property, {
        get() {
          reads++;
          return reads === 1
            ? property === "stage"
              ? "feed_list_after"
              : "ER_WRONG_ARGUMENTS"
            : "SENSITIVE_SENTINEL";
        },
      });
      expect(sanitizeTicketingFinancialFailure(source)).toEqual({
        stage: "feed_list_after",
        code: "ER_WRONG_ARGUMENTS",
      });
      expect(reads).toBe(1);
    },
  );
  it.each(["stage", "diagnosticCode"])(
    "redacts throwing %s accessors",
    (property) => {
      const source = {};
      Object.defineProperty(source, property, {
        get() {
          throw new Error("SENSITIVE_SENTINEL");
        },
      });
      expect(sanitizeTicketingFinancialFailure(source)).toEqual({
        stage: "unclassified",
        code: "UNKNOWN_FAILURE",
      });
    },
  );
  it("redacts a revoked diagnostic proxy", () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(sanitizeTicketingFinancialFailure(proxy)).toEqual({
      stage: "unclassified",
      code: "UNKNOWN_FAILURE",
    });
  });
});

import { describe, expect, it } from "vitest";

import {
  createTicketingApi,
  sanitizeTicketingFinancialFailure,
  sanitizeTicketingStartupFailure,
  isStagingOrderingSchemaReadbackService,
  verifyStagingOrderingTicketingSchema,
  createTicketingStartupFailureTracker,
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

describe("staging Ticketing startup diagnostic classification", () => {
  it.each([
    ["financial_payment_probe", "ER_NO_SUCH_TABLE"],
    ["ticketing_schema", "ER_DUP_KEYNAME"],
    ["ordering_schema", "ER_TABLEACCESS_DENIED_ERROR"],
    ["financial_result_probe", "ECONNREFUSED"],
  ])(
    "preserves only allowlisted startup stage %s and code %s",
    (stage, code) => {
      const diagnosis = sanitizeTicketingStartupFailure(
        {
          code,
          message: "PRIVATE_SQL_CREDENTIAL_SENTINEL",
          sql: "PRIVATE_SQL_CREDENTIAL_SENTINEL",
        },
        stage,
      );
      expect(diagnosis).toEqual({ stage, code });
      expect(Object.isFrozen(diagnosis)).toBe(true);
      expect(JSON.stringify(diagnosis)).not.toContain(
        "PRIVATE_SQL_CREDENTIAL_SENTINEL",
      );
    },
  );
  it("redacts untrusted text, invalid stages and hostile error accessors", () => {
    const sentinel = "PRIVATE_SQL_CREDENTIAL_SENTINEL";
    const values = [
      { code: sentinel, message: sentinel, password: sentinel },
      {
        get code() {
          throw Error(sentinel);
        },
      },
      new Error(sentinel),
    ];
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    values.push(proxy);
    for (const value of values) {
      const diagnosis = sanitizeTicketingStartupFailure(value, sentinel);
      expect(diagnosis).toEqual({
        stage: "unclassified",
        code: "UNKNOWN_FAILURE",
      });
      expect(JSON.stringify(diagnosis)).not.toContain(sentinel);
    }
  });
  it("records guarded failure diagnostics without requiring dynamic server modules", async () => {
    const audits = [];
    const api = createTicketingApi({
      authApi: authApi(),
      getEnvironmentValue: (key) =>
        key === "TICKETING_FEATURE_ENABLED"
          ? "TRUE"
          : "PRIVATE_SECRET_SENTINEL",
      audit: (record) => audits.push(record),
    });
    await expect(api.start()).resolves.toBe(false);
    expect(audits).toContainEqual(
      expect.objectContaining({
        action: "ticketing.runtime",
        result: "failure",
        reason: "configuration_or_persistence_unavailable",
        startupStage: "preflight",
        diagnosticCode: "TICKETING_FEATURE_ENABLED_INVALID",
      }),
    );
    expect(JSON.stringify(audits)).not.toContain("PRIVATE_SECRET_SENTINEL");
  });
  it("categorizes trusted missing-signing-secret without revealing error contents", () => {
    expect(
      sanitizeTicketingStartupFailure(
        new Error("TICKETING_SIGNING_SECRET_REQUIRED"),
        "credential_validation",
      ),
    ).toEqual({
      stage: "credential_validation",
      code: "TICKETING_SIGNING_SECRET_REQUIRED",
    });
  });
});

describe("concurrent startup rejection provenance", () => {
  it.each([
    ["financial_payment_probe", "financial_result_probe"],
    ["financial_result_probe", "financial_payment_probe"],
  ])(
    "binds the first rejection to its original %s stage before later %s fails",
    async (firstStage, secondStage) => {
      const tracker = createTicketingStartupFailureTracker();
      const first = Object.assign(new Error("SQL_SECRET_SENTINEL"), {
        code: "ER_NO_SUCH_TABLE",
      });
      const second = Object.assign(new Error("SQL_SECRET_SENTINEL"), {
        code: "ER_ACCESS_DENIED_ERROR",
      });
      await expect(
        Promise.all([
          tracker.track(Promise.reject(first), firstStage),
          tracker.track(Promise.reject(second), secondStage),
        ]),
      ).rejects.toBe(first);
      expect(tracker.firstFailureStage).toBe(firstStage);
      const diagnosis = sanitizeTicketingStartupFailure(
        first,
        tracker.firstFailureStage,
      );
      expect(diagnosis).toEqual({
        stage: firstStage,
        code: "ER_NO_SUCH_TABLE",
      });
      expect(JSON.stringify(diagnosis)).not.toContain("SQL_SECRET_SENTINEL");
    },
  );
  it("tracks first failure even when a later rejection settles after it", async () => {
    const tracker = createTicketingStartupFailureTracker();
    const earlier = Promise.reject(new Error("early"));
    const later = Promise.reject(new Error("later"));
    await Promise.allSettled([
      tracker.track(earlier, "ticketing_schema"),
      tracker.track(later, "ordering_schema"),
    ]);
    expect(tracker.firstFailureStage).toBe("ticketing_schema");
  });
});

describe("staging Ordering schema readback without runtime DDL", () => {
  const expectedSource =
    "enum('business_onboarding','ticketing_reservation','restaurant_reservation')";
  const requiredColumns = [
    ["reservation_reference", "varchar(120)"],
    ["order_id", "varchar(120)"],
    ["product_reference", "varchar(120)"],
    ["quantity", "smallint unsigned"],
    ["amount_minor", "bigint unsigned"],
    ["currency", "char(3)"],
    ["pricing_version", "varchar(80)"],
    ["bound_at", "datetime(3)"],
  ];
  function fakeReadback({
    database = "morro_ordering_staging",
    user = "morro_ordering",
    sourceKind = expectedSource,
    omitColumn = null,
    foreignKey = true,
  } = {}) {
    const calls = [];
    const columns = [
      {
        table_name: "ordering_orders",
        column_name: "source_kind",
        column_type: sourceKind,
      },
      ...requiredColumns
        .filter(([name]) => name !== omitColumn)
        .map(([name, type]) => ({
          table_name: "ordering_ticketing_reservation_bindings",
          column_name: name,
          column_type: type,
        })),
    ];
    const keys = foreignKey
      ? [
          {
            constraint_name: "fk_ordering_ticketing_order",
            column_name: "order_id",
            referenced_table: "ordering_orders",
            referenced_column: "order_id",
          },
        ]
      : [];
    const pool = {
      async query(sql) {
        calls.push(sql);
        if (sql.includes("SELECT DATABASE() AS database_name")) {
          return [[{ database_name: database, user_name: user }]];
        }
        if (sql.includes("information_schema.COLUMNS")) return [columns];
        if (sql.includes("information_schema.KEY_COLUMN_USAGE")) return [keys];
        if (sql.includes("LIMIT 0")) return [[]];
        throw new Error("UNEXPECTED_SQL_QUERY");
      },
    };
    return { pool, calls };
  }
  it("selects readback only for the dedicated staging service", () => {
    expect(
      isStagingOrderingSchemaReadbackService("morro-digital-v2-staging"),
    ).toBe(true);
    for (const value of [
      "",
      "morro-digital-v2-production",
      "morro-digital-v2-staging-extra",
      null,
    ]) {
      expect(isStagingOrderingSchemaReadbackService(value)).toBe(false);
    }
  });
  it("proves owned schema, required columns, key and never runs DDL", async () => {
    const { pool, calls } = fakeReadback();
    await expect(
      verifyStagingOrderingTicketingSchema(pool),
    ).resolves.toMatchObject({
      contract: "STAGING-TICKETING-ORDERING-READBACK",
      status: "pass",
      database: "morro_ordering_staging",
      user: "morro_ordering",
      foreignKeyVerified: true,
      requiredBindingColumns: 8,
    });
    expect(calls).toHaveLength(5);
    expect(calls.every((sql) => sql.trim().startsWith("SELECT "))).toBe(true);
    expect(calls.join(" ")).not.toMatch(
      /\b(?:ALTER|CREATE|DROP|DELETE|UPDATE|INSERT)\b/u,
    );
  });
  it.each([
    { database: "wrong_target", user: "morro_ordering" },
    { database: "morro_ordering_staging", user: "other_user" },
  ])("rejects unknown schema identity %#", async (identity) => {
    await expect(
      verifyStagingOrderingTicketingSchema(fakeReadback(identity).pool),
    ).rejects.toThrow("STAGING_ORDERING_DB_IDENTITY_MISMATCH");
  });
  it("rejects an unrecognized source_kind enum", async () => {
    await expect(
      verifyStagingOrderingTicketingSchema(
        fakeReadback({ sourceKind: "enum('business_onboarding')" }).pool,
      ),
    ).rejects.toThrow("STAGING_ORDERING_SOURCE_KIND_DRIFT");
  });
  it("rejects missing binding columns", async () => {
    await expect(
      verifyStagingOrderingTicketingSchema(
        fakeReadback({ omitColumn: "amount_minor" }).pool,
      ),
    ).rejects.toThrow("STAGING_ORDERING_SCHEMA_INCOMPLETE");
  });
  it("rejects a missing or mismatched ordering foreign key", async () => {
    await expect(
      verifyStagingOrderingTicketingSchema(
        fakeReadback({ foreignKey: false }).pool,
      ),
    ).rejects.toThrow("STAGING_ORDERING_FOREIGN_KEY_DRIFT");
  });
  it("requires an authenticated query-capable pool", async () => {
    await expect(verifyStagingOrderingTicketingSchema(null)).rejects.toThrow(
      "STAGING_ORDERING_READBACK_POOL_INVALID",
    );
  });
  it("classifies structural drift without exposing SQL or credentials", () => {
    const result = sanitizeTicketingStartupFailure(
      new Error("STAGING_ORDERING_SCHEMA_INCOMPLETE"),
      "ordering_schema",
    );
    expect(result).toEqual({
      stage: "ordering_schema",
      code: "STAGING_ORDERING_SCHEMA_INCOMPLETE",
    });
    expect(JSON.stringify(result)).not.toMatch(/password|token|mysql:|sql:/iu);
  });
});

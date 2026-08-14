import { describe, expect, it } from "vitest";

import {
  createCheckoutAccessRecord,
  sameCheckoutAccessAuthority,
} from "./checkout-access.js";
import { orderingM139SchemaSql } from "./schema.js";

function record(overrides: Record<string, unknown> = {}) {
  return createCheckoutAccessRecord({
    orderId: "ord_access_12345678",
    paymentId: "pay_access_12345678",
    requestFingerprint: "a".repeat(64),
    tokenHash: "b".repeat(64),
    context: {
      requesterKind: "authenticated",
      actorSubject: "user-123",
      destinationId: "morro",
      tenantId: "business-123",
    },
    correlationId: "corr_m139_12345678",
    createdAt: "2026-08-14T22:00:00Z",
    expiresAt: "2026-08-14T23:00:00Z",
    ...overrides,
  });
}

describe("M139 durable checkout access contract", () => {
  it("creates a canonical immutable access record without storing the public token", () => {
    const value = record();

    expect(value).toMatchObject({
      orderId: "ord_access_12345678",
      paymentId: "pay_access_12345678",
      requestFingerprint: "a".repeat(64),
      tokenHash: "b".repeat(64),
      requesterKind: "authenticated",
      destinationId: "morro",
      tenantId: "business-123",
      createdAt: "2026-08-14T22:00:00.000Z",
      expiresAt: "2026-08-14T23:00:00.000Z",
    });
    expect(value).not.toHaveProperty("token");
    expect(Object.isFrozen(value)).toBe(true);
  });

  it("rejects malformed hashes, correlation and non-forward expiry", () => {
    expect(record({ tokenHash: "short" })).toBeNull();
    expect(record({ correlationId: "bad" })).toBeNull();
    expect(
      record({ expiresAt: "2026-08-14T21:59:59Z" }),
    ).toBeNull();
  });

  it("treats retry correlation/timestamps as metadata while binding authority fields", () => {
    const first = record();
    const retry = record({
      correlationId: "corr_m139_retry_123",
      createdAt: "2026-08-14T22:00:01Z",
      expiresAt: "2026-08-14T23:00:01Z",
    });
    const divergent = record({
      requestFingerprint: "c".repeat(64),
    });
    if (!first || !retry || !divergent) {
      throw new Error("FIXTURE_INVALID");
    }

    expect(sameCheckoutAccessAuthority(first, retry)).toBe(true);
    expect(sameCheckoutAccessAuthority(first, divergent)).toBe(false);
  });

  it("freezes binary hashes, exact identities, expiry and Order ownership in SQL", () => {
    expect(orderingM139SchemaSql).toContain(
      "request_fingerprint BINARY(32) NOT NULL",
    );
    expect(orderingM139SchemaSql).toContain(
      "token_hash BINARY(32) NOT NULL UNIQUE",
    );
    expect(orderingM139SchemaSql).toContain(
      "FOREIGN KEY (order_id)",
    );
    expect(orderingM139SchemaSql).not.toContain("public_token");
  });
});

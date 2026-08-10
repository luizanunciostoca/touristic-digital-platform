import { describe, expect, it } from "vitest";

import {
  authRoles,
  authorizeBusinessAccess,
  hasBusinessScope,
  isAuthRole,
  isAuthSessionActive,
  isReadOnlyAuthRole,
  normalizeAuthEmail,
  normalizeAuthSessionIdentity,
  normalizeBusinessId,
  normalizeBusinessScopes,
  type AuthSessionIdentity,
} from "./index.js";

const activeSession: AuthSessionIdentity = Object.freeze({
  subject: "user-1",
  email: "owner@example.com",
  role: "owner",
  businessIds: Object.freeze(["toca-do-morcego"]),
  issuedAt: 1_700_000_000,
  expiresAt: 1_700_028_800,
  sessionId: "session-1",
});

const activeNow = 1_700_000_100;

describe("M47 auth core", () => {
  it("freezes the audited V1 role vocabulary", () => {
    expect(authRoles).toEqual(["owner", "manager", "viewer", "admin"]);
    expect(isAuthRole("viewer")).toBe(true);
    expect(isAuthRole("superuser")).toBe(false);
  });

  it("normalizes email without accepting malformed addresses", () => {
    expect(normalizeAuthEmail(" OWNER@Example.COM ")).toBe(
      "owner@example.com",
    );
    expect(normalizeAuthEmail("owner-at-example")).toBeNull();
  });

  it("preserves the V1 business id grammar", () => {
    expect(normalizeBusinessId(" Toca_Do-Morcego ")).toBe(
      "toca_do-morcego",
    );
    expect(normalizeBusinessId("a")).toBeNull();
    expect(normalizeBusinessId("empresa com espaço")).toBeNull();
  });

  it("deduplicates and rejects invalid business scopes", () => {
    expect(
      normalizeBusinessScopes([
        "toca-do-morcego",
        "TOCA-DO-MORCEGO",
        "hotel-1",
        "inválido",
      ]),
    ).toEqual(["toca-do-morcego", "hotel-1"]);
  });

  it("normalizes a bounded immutable session projection", () => {
    const normalized = normalizeAuthSessionIdentity({
      subject: " user-1 ",
      email: " OWNER@EXAMPLE.COM ",
      role: "manager",
      businessIds: ["TOCA-DO-MORCEGO", "toca-do-morcego"],
      issuedAt: 1_700_000_000.9,
      expiresAt: 1_700_028_800.7,
      sessionId: " session-1 ",
    });

    expect(normalized).toEqual({
      subject: "user-1",
      email: "owner@example.com",
      role: "manager",
      businessIds: ["toca-do-morcego"],
      issuedAt: 1_700_000_000,
      expiresAt: 1_700_028_800,
      sessionId: "session-1",
    });
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(normalized && Object.isFrozen(normalized.businessIds)).toBe(true);
  });

  it("requires business scopes for non-admin identities", () => {
    expect(
      normalizeAuthSessionIdentity({
        subject: "user-1",
        email: "owner@example.com",
        role: "owner",
        businessIds: [],
        issuedAt: 10,
        expiresAt: 20,
        sessionId: "session-1",
      }),
    ).toBeNull();

    expect(
      normalizeAuthSessionIdentity({
        subject: "admin-1",
        email: "admin@example.com",
        role: "admin",
        businessIds: [],
        issuedAt: 10,
        expiresAt: 20,
        sessionId: "session-admin",
      }),
    ).not.toBeNull();
  });

  it("rejects malformed or non-positive session windows", () => {
    expect(
      normalizeAuthSessionIdentity({
        subject: "user-1",
        email: "owner@example.com",
        role: "owner",
        businessIds: ["business-1"],
        issuedAt: 20,
        expiresAt: 20,
        sessionId: "session-1",
      }),
    ).toBeNull();
  });

  it("treats expiry as an exclusive upper boundary", () => {
    expect(isAuthSessionActive(activeSession, activeSession.expiresAt - 1)).toBe(
      true,
    );
    expect(isAuthSessionActive(activeSession, activeSession.expiresAt)).toBe(
      false,
    );
  });

  it("preserves viewer as the only read-only V1 role", () => {
    expect(isReadOnlyAuthRole("viewer")).toBe(true);
    expect(isReadOnlyAuthRole("owner")).toBe(false);
    expect(isReadOnlyAuthRole("manager")).toBe(false);
    expect(isReadOnlyAuthRole("admin")).toBe(false);
  });

  it("allows an admin to access any syntactically valid business id", () => {
    const admin = Object.freeze({
      ...activeSession,
      role: "admin" as const,
      businessIds: Object.freeze([]),
    });

    expect(hasBusinessScope(admin, "another-business")).toBe(true);
    expect(hasBusinessScope(admin, "invalid business")).toBe(false);
  });

  it("requires authentication before evaluating tenant input", () => {
    expect(
      authorizeBusinessAccess(null, "invalid business", {
        nowEpochSeconds: activeNow,
      }),
    ).toEqual({
      allowed: false,
      reason: "authentication_required",
      businessId: null,
    });
  });

  it("fails expired sessions before tenant authorization", () => {
    expect(
      authorizeBusinessAccess(activeSession, "toca-do-morcego", {
        nowEpochSeconds: activeSession.expiresAt,
      }),
    ).toEqual({
      allowed: false,
      reason: "session_expired",
      businessId: null,
    });
  });

  it("distinguishes invalid business ids from tenant mismatch", () => {
    expect(
      authorizeBusinessAccess(activeSession, "invalid business", {
        nowEpochSeconds: activeNow,
      }).reason,
    ).toBe("invalid_business_id");

    expect(
      authorizeBusinessAccess(activeSession, "hotel-1", {
        nowEpochSeconds: activeNow,
      }),
    ).toEqual({
      allowed: false,
      reason: "business_access_denied",
      businessId: "hotel-1",
    });
  });

  it("allows scoped reads and non-viewer mutations", () => {
    expect(
      authorizeBusinessAccess(activeSession, "TOCA-DO-MORCEGO", {
        nowEpochSeconds: activeNow,
      }),
    ).toEqual({
      allowed: true,
      reason: "allowed",
      businessId: "toca-do-morcego",
    });

    expect(
      authorizeBusinessAccess(activeSession, "toca-do-morcego", {
        mutation: true,
        nowEpochSeconds: activeNow,
      }).allowed,
    ).toBe(true);
  });

  it("allows viewer reads but rejects viewer mutations", () => {
    const viewer = Object.freeze({
      ...activeSession,
      role: "viewer" as const,
    });

    expect(
      authorizeBusinessAccess(viewer, "toca-do-morcego", {
        nowEpochSeconds: activeNow,
      }).allowed,
    ).toBe(true);

    expect(
      authorizeBusinessAccess(viewer, "toca-do-morcego", {
        mutation: true,
        nowEpochSeconds: activeNow,
      }),
    ).toEqual({
      allowed: false,
      reason: "read_only_role",
      businessId: "toca-do-morcego",
    });
  });
});

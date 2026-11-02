import { describe, expect, it } from "vitest";

import type { AuthRole, AuthSessionIdentity } from "@touristic/auth";

import { authorizeCrmAccess } from "./authorization.js";

const now = 2_000;

const roleExpectations = [
  ["PLATFORM_OWNER", "allowed", "allowed"],
  ["PLATFORM_ADMIN", "allowed", "allowed"],
  ["SUPPORT", "allowed", "read_only_role"],
  ["AUDITOR", "allowed", "read_only_role"],
  ["BUSINESS_OWNER", "allowed", "allowed"],
  ["BUSINESS_MANAGER", "allowed", "allowed"],
  ["BUSINESS_VIEWER", "allowed", "read_only_role"],
  ["AFFILIATE", "capability_denied", "capability_denied"],
  ["owner", "allowed", "allowed"],
  ["manager", "allowed", "allowed"],
  ["viewer", "allowed", "read_only_role"],
  ["admin", "allowed", "allowed"],
] as const;

function session(role: AuthRole, expiresAt = 3_000): AuthSessionIdentity {
  return {
    subject: `crm-${role}`,
    email: `${role}@example.com`,
    role,
    businessIds: role === "admin" ? [] : ["crm-placeholder"],
    issuedAt: 1_000,
    expiresAt,
    sessionId: `session-${role}`,
  };
}

describe("CRM M69 authorization policy", () => {
  it.each(roleExpectations)(
    "%s reads require the canonical crm.read capability",
    (role, readReason) => {
      expect(
        authorizeCrmAccess(session(role), { nowEpochSeconds: now }),
      ).toEqual({ allowed: readReason === "allowed", reason: readReason });
    },
  );

  it.each(roleExpectations)(
    "%s mutations preserve read-only denial before crm.manage",
    (role, _readReason, mutationReason) => {
      expect(
        authorizeCrmAccess(session(role), {
          mutation: true,
          nowEpochSeconds: now,
        }),
      ).toEqual({
        allowed: mutationReason === "allowed",
        reason: mutationReason,
      });
    },
  );

  it.each([false, true])(
    "checks authentication and expiry before capability denial (mutation=%s)",
    (mutation) => {
      const options = { mutation, nowEpochSeconds: now };
      expect(authorizeCrmAccess(null, options)).toEqual({
        allowed: false,
        reason: "authentication_required",
      });
      expect(authorizeCrmAccess(session("AFFILIATE", now), options)).toEqual({
        allowed: false,
        reason: "session_expired",
      });
    },
  );

  it("fails closed when authentication is missing", () => {
    expect(authorizeCrmAccess(null, { nowEpochSeconds: now })).toEqual({
      allowed: false,
      reason: "authentication_required",
    });
  });

  it("rejects expired sessions", () => {
    expect(
      authorizeCrmAccess(session("admin", now), { nowEpochSeconds: now }),
    ).toEqual({ allowed: false, reason: "session_expired" });
  });

  it.each(["owner", "manager", "viewer", "admin"] as const)(
    "allows authenticated %s sessions to read CRM state",
    (role) => {
      expect(
        authorizeCrmAccess(session(role), { nowEpochSeconds: now }),
      ).toEqual({ allowed: true, reason: "allowed" });
    },
  );

  it("denies viewer mutations", () => {
    expect(
      authorizeCrmAccess(session("viewer"), {
        mutation: true,
        nowEpochSeconds: now,
      }),
    ).toEqual({ allowed: false, reason: "read_only_role" });
  });

  it.each(["owner", "manager", "admin"] as const)(
    "allows authenticated %s sessions to mutate CRM state",
    (role) => {
      expect(
        authorizeCrmAccess(session(role), {
          mutation: true,
          nowEpochSeconds: now,
        }),
      ).toEqual({ allowed: true, reason: "allowed" });
    },
  );
});

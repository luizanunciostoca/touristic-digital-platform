import { describe, expect, it } from "vitest";

import type { AuthRole, AuthSessionIdentity } from "@touristic/auth";

import { authorizeCrmAccess } from "./authorization.js";

const now = 2_000;

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

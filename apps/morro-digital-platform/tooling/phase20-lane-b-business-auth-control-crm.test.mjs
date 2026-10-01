import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  authorizeBusinessAccess,
  authorizeCapability,
  hasAuthCapability,
} from "@touristic/auth";
import { authorizeCrmAccess } from "@touristic/crm/authorization";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const now = 2_000_000_000;

function session(role, businessIds = ["biz-a"], overrides = {}) {
  return Object.freeze({
    subject: `lane-b-${String(role).toLowerCase()}`,
    email: `${String(role).toLowerCase()}@lane-b.example.invalid`,
    role,
    businessIds: Object.freeze([...businessIds]),
    issuedAt: now - 1_000,
    expiresAt: now + 1_000,
    sessionId: `lane-b-session-${String(role).toLowerCase()}`,
    ...overrides,
  });
}

describe("Phase 20 Lane B semantic authority boundaries", () => {
  it("fails closed for anonymous, stale and cross-business Business access", () => {
    const owner = session("BUSINESS_OWNER");
    const stale = session("BUSINESS_OWNER", ["biz-a"], { expiresAt: now - 1 });

    expect(
      authorizeBusinessAccess(null, "biz-a", { nowEpochSeconds: now }).reason,
    ).toBe("authentication_required");
    expect(
      authorizeBusinessAccess(stale, "biz-a", { nowEpochSeconds: now }).reason,
    ).toBe("session_expired");
    expect(
      authorizeBusinessAccess(owner, "biz-b", { nowEpochSeconds: now }).reason,
    ).toBe("business_access_denied");
    expect(
      authorizeBusinessAccess(owner, "biz-a", { nowEpochSeconds: now }).allowed,
    ).toBe(true);
  });

  it("separates Business and platform capabilities without minting authority", () => {
    const owner = session("BUSINESS_OWNER");
    const manager = session("BUSINESS_MANAGER");
    const viewer = session("BUSINESS_VIEWER");

    expect(
      authorizeBusinessAccess(viewer, "biz-a", {
        mutation: true,
        nowEpochSeconds: now,
      }).reason,
    ).toBe("read_only_role");
    expect(
      authorizeCapability(manager, "content.manage", {
        businessId: "biz-a",
        mutation: true,
        nowEpochSeconds: now,
      }).reason,
    ).toBe("capability_denied");
    expect(
      authorizeCapability(owner, "content.manage", {
        businessId: "biz-a",
        mutation: true,
        nowEpochSeconds: now,
      }).allowed,
    ).toBe(true);

    expect(hasAuthCapability("BUSINESS_OWNER", "users.manage")).toBe(false);
    expect(hasAuthCapability("PLATFORM_ADMIN", "users.manage")).toBe(true);
    expect(hasAuthCapability("PLATFORM_ADMIN", "system.manage")).toBe(false);
    expect(hasAuthCapability("PLATFORM_OWNER", "system.manage")).toBe(true);
    expect(hasAuthCapability("SUPPORT", "support.impersonate")).toBe(true);
    expect(hasAuthCapability("BUSINESS_OWNER", "support.impersonate")).toBe(false);
  });

  it("keeps CRM behind Auth-owned crm.read/crm.manage capabilities", () => {
    const affiliate = session("AFFILIATE", []);
    const businessOwner = session("BUSINESS_OWNER");
    const viewer = session("BUSINESS_VIEWER");

    expect(authorizeCrmAccess(affiliate, { nowEpochSeconds: now })).toEqual({
      allowed: false,
      reason: "capability_denied",
    });
    expect(
      authorizeCrmAccess(affiliate, {
        mutation: true,
        nowEpochSeconds: now,
      }),
    ).toEqual({ allowed: false, reason: "capability_denied" });
    expect(authorizeCrmAccess(businessOwner, { nowEpochSeconds: now })).toEqual({
      allowed: true,
      reason: "allowed",
    });
    expect(
      authorizeCrmAccess(businessOwner, {
        mutation: true,
        nowEpochSeconds: now,
      }),
    ).toEqual({ allowed: true, reason: "allowed" });
    expect(
      authorizeCrmAccess(viewer, {
        mutation: true,
        nowEpochSeconds: now,
      }).reason,
    ).toBe("read_only_role");
  });

  it("keeps revocation, same-origin, CSRF and tenant authorization server-owned", async () => {
    const source = await readFile(
      path.join(root, "apps/morro-digital-platform/tooling/auth-api.mjs"),
      "utf8",
    );

    expect(source).toContain("securityState.isRevoked(verified.sessionId)");
    expect(source).toContain("authorizeBusinessAccess(active, businessIdInput");
    expect(source).toContain("verifyCsrfToken(");
    expect(source).toContain("originAllowed(request)");
  });

  it("keeps Control Center as a capability-gated adapter consumer, not a domain owner", async () => {
    const [adminSource, browserSource] = await Promise.all([
      readFile(
        path.join(root, "apps/morro-digital-platform/tooling/admin-api.mjs"),
        "utf8",
      ),
      readFile(
        path.join(root, "apps/control-center/public/control-center.js"),
        "utf8",
      ),
    ]);

    expect(adminSource).toContain("DOMAIN_ADMIN_CONTRACT_NOT_REGISTERED");
    expect(adminSource).toContain("NO_DIRECT_TABLE_BYPASS");
    expect(adminSource).toContain(
      'crm: Object.freeze({ read: "crm.read", mutate: "crm.manage" })',
    );
    expect(browserSource).toContain("createDashboardAuthClient");
    expect(browserSource).toContain("auth.secureFetch(`/api/admin/v1");
    expect(browserSource).not.toContain("createSessionToken");
    expect(browserSource).not.toContain("DASHBOARD_AUTH_SECRET");
  });

  it("keeps Assistant outside IAM authority minting", async () => {
    const source = await readFile(
      path.join(root, "apps/morro-digital-platform/tooling/assistant-api.mjs"),
      "utf8",
    );

    for (const forbidden of [
      "@touristic/auth-server",
      "createSessionToken",
      "DASHBOARD_AUTH_SECRET",
      "users.manage",
      "support.impersonate",
      "crm.manage",
      "system.manage",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});

import { describe, expect, it } from "vitest";

import {
  createSessionToken,
  hashPassword,
  sessionCookieName,
} from "@touristic/auth-server";

import { createAuthApi } from "./auth-api.mjs";

const secret = "auth-admin-policy-test-secret-000000000000000000";
const passwordHash = hashPassword(
  "auth admin policy fixture",
  Buffer.alloc(16, 9),
);

function environment() {
  const users = [
    {
      id: "platform-owner",
      email: "owner@example.com",
      passwordHash,
      role: "PLATFORM_OWNER",
      businessIds: [],
    },
    {
      id: "business-owner",
      email: "business@example.com",
      passwordHash,
      role: "BUSINESS_OWNER",
      businessIds: ["toca-do-morcego"],
    },
  ];
  return (key) => {
    if (key === "DASHBOARD_AUTH_SECRET") return secret;
    if (key === "DASHBOARD_USERS_JSON") return JSON.stringify(users);
    if (key === "NODE_ENV") return "development";
    return "";
  };
}

function requestFor(principal) {
  const token = createSessionToken(principal, secret, { ttlSeconds: 3_600 });
  if (!token) throw new Error("AUTH_ADMIN_POLICY_TEST_TOKEN_FAILED");
  return {
    method: "GET",
    headers: {
      cookie: `${sessionCookieName}=${encodeURIComponent(token)}`,
      host: "localhost",
    },
  };
}

describe("Auth durable administrative principal policy", () => {
  it("applies a role override to existing signed sessions and fails closed when blocked", async () => {
    const api = createAuthApi({ getEnvironmentValue: environment() });
    await api.start();

    const request = requestFor({
      subject: "business-owner",
      email: "business@example.com",
      role: "BUSINESS_OWNER",
      businessIds: ["toca-do-morcego"],
    });

    await expect(api.resolveSession(request)).resolves.toMatchObject({
      subject: "business-owner",
      role: "BUSINESS_OWNER",
    });

    const roleChanged = await api.updateUserRole(
      "business-owner",
      "SUPPORT",
      "platform-owner",
    );
    expect(roleChanged).toMatchObject({
      previousState: { role: "BUSINESS_OWNER", status: "active" },
      newState: {
        role: "SUPPORT",
        canonicalRole: "SUPPORT",
        status: "active",
      },
    });
    await expect(api.resolveSession(request)).resolves.toMatchObject({
      subject: "business-owner",
      role: "SUPPORT",
    });

    const blocked = await api.updateUserStatus(
      "business-owner",
      "blocked",
      "platform-owner",
    );
    expect(blocked).toMatchObject({
      previousState: { status: "active", role: "SUPPORT" },
      newState: { status: "blocked", role: "SUPPORT" },
    });
    await expect(api.resolveSession(request)).resolves.toBeNull();

    await api.updateUserStatus(
      "business-owner",
      "active",
      "platform-owner",
    );
    await expect(api.resolveSession(request)).resolves.toMatchObject({
      subject: "business-owner",
      role: "SUPPORT",
    });

    await api.stop();
  });

  it("protects bootstrap owners and prevents self-lockout or self-role mutation", async () => {
    const api = createAuthApi({ getEnvironmentValue: environment() });
    await api.start();

    await expect(
      api.updateUserStatus(
        "platform-owner",
        "blocked",
        "another-platform-admin",
      ),
    ).rejects.toThrow("AUTH_BOOTSTRAP_OWNER_PROTECTED");

    await expect(
      api.updateUserStatus("business-owner", "blocked", "business-owner"),
    ).rejects.toThrow("AUTH_SELF_BLOCK_DENIED");

    await expect(
      api.updateUserRole("business-owner", "SUPPORT", "business-owner"),
    ).rejects.toThrow("AUTH_SELF_ROLE_CHANGE_DENIED");

    await expect(
      api.updateUserRole("business-owner", "NOT_A_ROLE", "platform-owner"),
    ).rejects.toThrow("AUTH_PRINCIPAL_ROLE_INVALID");

    await api.stop();
  });

  it("projects configured and effective authority separately", async () => {
    const api = createAuthApi({ getEnvironmentValue: environment() });
    await api.start();

    await api.updateUserRole("business-owner", "SUPPORT", "platform-owner");
    const user = await api.findAdminUser("business-owner");

    expect(user).toMatchObject({
      configuredRole: "BUSINESS_OWNER",
      configuredCanonicalRole: "BUSINESS_OWNER",
      role: "SUPPORT",
      canonicalRole: "SUPPORT",
      status: "active",
    });
    expect(user.capabilities).toContain("users.read");
    expect(user.capabilities).not.toContain("users.manage");

    await api.stop();
  });
});

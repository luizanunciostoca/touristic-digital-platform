import { describe, expect, it } from "vitest";

import {
  createSessionToken,
  hashPassword,
  sessionCookieName,
} from "@touristic/auth-server";

import { createAuthApi } from "./auth-api.mjs";

const secret = "support-delegation-test-secret-0000000000000000";
const passwordHash = hashPassword(
  "support delegation fixture",
  Buffer.alloc(16, 7),
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
  const token = createSessionToken(principal, secret, {
    ttlSeconds: 3_600,
  });
  if (!token) throw new Error("AUTH_DELEGATION_TEST_TOKEN_FAILED");
  return {
    method: "GET",
    headers: {
      cookie: `${sessionCookieName}=${encodeURIComponent(token)}`,
      host: "localhost",
    },
  };
}

describe("Auth request-scoped support delegation", () => {
  it("projects the effective user only inside the delegated operation", async () => {
    const api = createAuthApi({ getEnvironmentValue: environment() });
    await api.start();

    const request = requestFor({
      subject: "platform-owner",
      email: "owner@example.com",
      role: "PLATFORM_OWNER",
      businessIds: [],
    });

    const actor = await api.resolveSession(request);
    expect(actor).toMatchObject({
      subject: "platform-owner",
      role: "PLATFORM_OWNER",
      businessIds: [],
    });

    await api.withDelegatedSession(
      request,
      "business-owner",
      async (delegated) => {
        expect(delegated).toMatchObject({
          subject: "business-owner",
          role: "BUSINESS_OWNER",
          businessIds: ["toca-do-morcego"],
          sessionId: actor.sessionId,
        });
        await expect(api.resolveSession(request)).resolves.toMatchObject({
          subject: "business-owner",
          role: "BUSINESS_OWNER",
          businessIds: ["toca-do-morcego"],
        });
      },
    );

    await expect(api.resolveSession(request)).resolves.toMatchObject({
      subject: "platform-owner",
      role: "PLATFORM_OWNER",
      businessIds: [],
    });

    await api.stop();
  });

  it("rejects platform targets and non-platform actors", async () => {
    const api = createAuthApi({ getEnvironmentValue: environment() });
    await api.start();

    const ownerRequest = requestFor({
      subject: "platform-owner",
      email: "owner@example.com",
      role: "PLATFORM_OWNER",
      businessIds: [],
    });
    await expect(
      api.withDelegatedSession(
        ownerRequest,
        "platform-owner",
        async () => undefined,
      ),
    ).rejects.toThrow("AUTH_DELEGATION_TARGET_INVALID");

    const businessRequest = requestFor({
      subject: "business-owner",
      email: "business@example.com",
      role: "BUSINESS_OWNER",
      businessIds: ["toca-do-morcego"],
    });
    await expect(
      api.withDelegatedSession(
        businessRequest,
        "business-owner",
        async () => undefined,
      ),
    ).rejects.toThrow("AUTH_DELEGATION_NOT_AUTHORIZED");

    await api.stop();
  });
});

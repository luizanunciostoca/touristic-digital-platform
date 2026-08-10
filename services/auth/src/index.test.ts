import { describe, expect, it } from "vitest";

import {
  createSessionToken,
  csrfTokenForSession,
  isSameOriginAllowed,
  parseCookies,
  safeDashboardReturnPath,
  serializeClearedSessionCookie,
  serializeSessionCookie,
  sessionCookieName,
  verifyCsrfToken,
  verifySessionToken,
} from "./index.js";

const secret = "0123456789abcdef0123456789abcdef";
const now = 1_700_000_000;
const principal = {
  subject: "user-1",
  email: "owner@example.com",
  role: "owner" as const,
  businessIds: ["toca-do-morcego"],
};

describe("M48 auth server security primitives", () => {
  it("creates and verifies a V1-compatible signed bounded session", () => {
    const token = createSessionToken(principal, secret, {
      nowEpochSeconds: now,
      ttlSeconds: 600,
      sessionId: "session-1",
    });

    expect(token).toBeTruthy();
    const session = verifySessionToken(token, secret, now + 1);
    expect(session).toEqual({
      subject: "user-1",
      email: "owner@example.com",
      role: "owner",
      businessIds: ["toca-do-morcego"],
      issuedAt: now,
      expiresAt: now + 600,
      sessionId: "session-1",
    });
  });

  it("fails closed for undersized secrets", () => {
    expect(createSessionToken(principal, "short", { nowEpochSeconds: now })).toBeNull();
    expect(verifySessionToken("invalid", "short", now)).toBeNull();
  });

  it("rejects tampered and expired sessions", () => {
    const token = createSessionToken(principal, secret, {
      nowEpochSeconds: now,
      ttlSeconds: 300,
      sessionId: "session-1",
    });
    expect(token).toBeTruthy();
    expect(verifySessionToken(`${token}x`, secret, now + 1)).toBeNull();
    expect(verifySessionToken(token, secret, now + 300)).toBeNull();
  });

  it("derives and verifies CSRF from the session identifier", () => {
    const token = createSessionToken(principal, secret, {
      nowEpochSeconds: now,
      sessionId: "session-csrf",
    });
    const session = verifySessionToken(token, secret, now + 1);
    expect(session).not.toBeNull();
    if (!session) return;

    const csrf = csrfTokenForSession(session, secret);
    expect(csrf).toBeTruthy();
    expect(verifyCsrfToken(csrf, session, secret)).toBe(true);
    expect(verifyCsrfToken("wrong", session, secret)).toBe(false);
  });

  it("serializes HttpOnly SameSite=Strict session cookies", () => {
    const cookie = serializeSessionCookie("abc.def", {
      maxAgeSeconds: 600,
      secure: true,
    });
    expect(cookie).toContain(`${sessionCookieName}=abc.def`);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Max-Age=600");
    expect(cookie).toContain("Secure");
  });

  it("serializes an immediate cookie clear", () => {
    expect(serializeClearedSessionCookie(true)).toBe(
      `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure`,
    );
  });

  it("parses encoded cookies without throwing on malformed encoding", () => {
    expect(parseCookies("a=1; token=hello%20world")).toEqual({
      a: "1",
      token: "hello world",
    });
    expect(parseCookies("bad=%E0%A4%A")).toEqual({ bad: "%E0%A4%A" });
  });

  it("accepts explicit same-origin Origin and Referer values", () => {
    const expectedOrigin = "https://morro.example";
    expect(
      isSameOriginAllowed({ expectedOrigin, origin: expectedOrigin, production: true }),
    ).toBe(true);
    expect(
      isSameOriginAllowed({
        expectedOrigin,
        referer: `${expectedOrigin}/dashboard/`,
        production: true,
      }),
    ).toBe(true);
  });

  it("rejects cross-origin requests and missing production origin evidence", () => {
    const expectedOrigin = "https://morro.example";
    expect(
      isSameOriginAllowed({
        expectedOrigin,
        origin: "https://evil.example",
        production: true,
      }),
    ).toBe(false);
    expect(isSameOriginAllowed({ expectedOrigin, production: true })).toBe(false);
    expect(isSameOriginAllowed({ expectedOrigin, production: false })).toBe(true);
  });

  it("keeps dashboard return paths local and rejects open redirects", () => {
    expect(safeDashboardReturnPath("/dashboard/metrics.html?x=1")).toBe(
      "/dashboard/metrics.html?x=1",
    );
    expect(safeDashboardReturnPath("https://evil.example/")).toBe(
      "/dashboard/index-v3-improved.html",
    );
    expect(safeDashboardReturnPath("//evil.example/dashboard/")).toBe(
      "/dashboard/index-v3-improved.html",
    );
    expect(safeDashboardReturnPath("/dashboard/\\evil")).toBe(
      "/dashboard/index-v3-improved.html",
    );
  });
});

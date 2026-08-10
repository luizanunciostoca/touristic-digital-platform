import { describe, expect, it } from "vitest";

import { normalizeAuthSessionIdentity } from "@touristic/auth";

import { createAuthRevocationStore } from "./revocation.js";

function session() {
  const value = normalizeAuthSessionIdentity({
    subject: "user-1",
    email: "owner@example.com",
    role: "owner",
    businessIds: ["toca-do-morcego"],
    issuedAt: 1_700_000_000,
    expiresAt: 1_700_000_600,
    sessionId: "session-1",
  });
  if (!value) throw new Error("fixture session must be valid");
  return value;
}

describe("M48 auth revocation", () => {
  it("revokes a session until its expiry boundary", () => {
    const store = createAuthRevocationStore();
    store.revoke(session());

    expect(store.isRevoked("session-1", 1_700_000_001)).toBe(true);
    expect(store.isRevoked("session-1", 1_700_000_600)).toBe(false);
    expect(store.size()).toBe(0);
  });

  it("cleans only expired revocations", () => {
    const store = createAuthRevocationStore();
    const first = session();
    const second = normalizeAuthSessionIdentity({
      ...first,
      sessionId: "session-2",
      expiresAt: 1_700_001_000,
    });
    if (!second) throw new Error("fixture session must be valid");

    store.revoke(first);
    store.revoke(second);
    expect(store.cleanup(1_700_000_700)).toBe(1);
    expect(store.isRevoked("session-1", 1_700_000_700)).toBe(false);
    expect(store.isRevoked("session-2", 1_700_000_700)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import { createInMemoryAuthSecurityState } from "./security-state.js";

describe("Auth security state", () => {
  it("enforces the login limit across a fixed runtime authority", async () => {
    const state = createInMemoryAuthSecurityState();
    await state.initialize();
    const policy = { windowMs: 1_000, limit: 2 };

    await expect(state.consumeLoginAttempt("ip-a", policy, 100)).resolves.toBe(
      true,
    );
    await expect(state.consumeLoginAttempt("ip-a", policy, 200)).resolves.toBe(
      true,
    );
    await expect(state.consumeLoginAttempt("ip-a", policy, 300)).resolves.toBe(
      false,
    );
    await expect(
      state.consumeLoginAttempt("ip-a", policy, 1_101),
    ).resolves.toBe(true);
  });

  it("keeps rate-limit keys isolated", async () => {
    const state = createInMemoryAuthSecurityState();
    const policy = { windowMs: 10_000, limit: 1 };

    await expect(state.consumeLoginAttempt("ip-a", policy, 100)).resolves.toBe(
      true,
    );
    await expect(state.consumeLoginAttempt("ip-a", policy, 200)).resolves.toBe(
      false,
    );
    await expect(state.consumeLoginAttempt("ip-b", policy, 200)).resolves.toBe(
      true,
    );
  });

  it("revokes a session until its expiry boundary", async () => {
    const state = createInMemoryAuthSecurityState();
    await state.revoke({ sessionId: "session-1", expiresAt: 20 });

    await expect(state.isRevoked("session-1", 19)).resolves.toBe(true);
    await expect(state.isRevoked("session-1", 20)).resolves.toBe(false);
  });
});

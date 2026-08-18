import { describe, expect, it, vi } from "vitest";

import {
  authSecuritySchemaStatements,
  createInMemoryAuthSecurityState,
  createSqlAuthSecurityState,
  type AuthSqlConnection,
  type AuthSqlPool,
} from "./security-state.js";

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

  it("initializes the durable schema idempotently before SQL authority is used", async () => {
    const query = vi.fn().mockResolvedValue([[], []]);
    const execute = vi.fn().mockResolvedValue([[], []]);
    const end = vi.fn().mockResolvedValue(undefined);
    const pool = {
      query,
      execute,
      getConnection: vi.fn(),
      end,
    } as unknown as AuthSqlPool;
    const state = createSqlAuthSecurityState(pool);

    await state.initialize();
    await state.initialize();

    expect(query).toHaveBeenCalledTimes(authSecuritySchemaStatements.length);
    for (const statement of authSecuritySchemaStatements) {
      expect(query).toHaveBeenCalledWith(statement);
    }
    await state.close();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("serializes durable login attempts under a row lock and commits the decision", async () => {
    const beginTransaction = vi.fn().mockResolvedValue(undefined);
    const commit = vi.fn().mockResolvedValue(undefined);
    const rollback = vi.fn().mockResolvedValue(undefined);
    const release = vi.fn();
    const connectionExecute = vi
      .fn()
      .mockResolvedValueOnce([{}, []])
      .mockResolvedValueOnce([
        [{ window_started_at: 100, attempts: 1 }],
        [],
      ])
      .mockResolvedValueOnce([{}, []]);
    const connection = {
      beginTransaction,
      execute: connectionExecute,
      commit,
      rollback,
      release,
    } as unknown as AuthSqlConnection;
    const pool = {
      query: vi.fn().mockResolvedValue([[], []]),
      execute: vi.fn().mockResolvedValue([[], []]),
      getConnection: vi.fn().mockResolvedValue(connection),
      end: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuthSqlPool;
    const state = createSqlAuthSecurityState(pool, { closePool: false });

    await expect(
      state.consumeLoginAttempt(
        "203.0.113.10",
        { windowMs: 1_000, limit: 2 },
        200,
      ),
    ).resolves.toBe(true);

    expect(beginTransaction).toHaveBeenCalledTimes(1);
    expect(connectionExecute.mock.calls[1]?.[0]).toContain("FOR UPDATE");
    expect(connectionExecute.mock.calls[2]?.[1]).toEqual([
      100,
      2,
      200,
      expect.any(String),
    ]);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(rollback).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("rolls back and releases the durable transaction on authority failure", async () => {
    const connection = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      execute: vi
        .fn()
        .mockResolvedValueOnce([{}, []])
        .mockRejectedValueOnce(new Error("database unavailable")),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    } as unknown as AuthSqlConnection;
    const pool = {
      query: vi.fn().mockResolvedValue([[], []]),
      execute: vi.fn().mockResolvedValue([[], []]),
      getConnection: vi.fn().mockResolvedValue(connection),
      end: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuthSqlPool;
    const state = createSqlAuthSecurityState(pool, { closePool: false });

    await expect(
      state.consumeLoginAttempt(
        "203.0.113.10",
        { windowMs: 1_000, limit: 2 },
        200,
      ),
    ).rejects.toThrow("database unavailable");

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
});

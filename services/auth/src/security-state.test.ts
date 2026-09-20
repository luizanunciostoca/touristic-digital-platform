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

  it("registers only an opaque session handle and revokes it idempotently", async () => {
    const state = createInMemoryAuthSecurityState();
    await state.registerSession({
      sessionId: "raw-session-jti-must-not-leak",
      subject: "user-1",
      issuedAt: 10,
      expiresAt: 100,
    });

    const listed = await state.listSessions("user-1", 20);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      subject: "user-1",
      issuedAt: 10,
      expiresAt: 100,
      revokedAt: null,
      active: true,
    });
    expect(listed[0]?.handle).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(listed)).not.toContain(
      "raw-session-jti-must-not-leak",
    );

    const handle = listed[0]?.handle ?? "";
    await expect(
      state.revokeSessionHandle("different-user", handle, 30),
    ).resolves.toEqual({ found: false, alreadyRevoked: false });

    await expect(
      state.revokeSessionHandle("user-1", handle, 30),
    ).resolves.toEqual({ found: true, alreadyRevoked: false });
    await expect(
      state.revokeSessionHandle("user-1", handle, 31),
    ).resolves.toEqual({ found: true, alreadyRevoked: true });
    await expect(
      state.isRevoked("raw-session-jti-must-not-leak", 31),
    ).resolves.toBe(true);

    const after = await state.listSessions("user-1", 31);
    expect(after[0]).toMatchObject({
      active: false,
      revokedAt: 30,
    });
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
      .mockResolvedValueOnce([[{ window_started_at: 100, attempts: 1 }], []])
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

  it("revokes a registered SQL session by subject-bound opaque handle", async () => {
    const handle = "b".repeat(64);
    const beginTransaction = vi.fn().mockResolvedValue(undefined);
    const commit = vi.fn().mockResolvedValue(undefined);
    const rollback = vi.fn().mockResolvedValue(undefined);
    const release = vi.fn();
    const connectionExecute = vi
      .fn()
      .mockResolvedValueOnce([
        [
          {
            session_key: handle,
            actor_subject: "user-1",
            issued_at: 10,
            expires_at: 100,
            revoked_at: null,
          },
        ],
        [],
      ])
      .mockResolvedValueOnce([{}, []])
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
      state.revokeSessionHandle("user-1", handle, 30),
    ).resolves.toEqual({ found: true, alreadyRevoked: false });

    expect(connectionExecute.mock.calls[0]?.[0]).toContain("FOR UPDATE");
    expect(connectionExecute.mock.calls[0]?.[1]).toEqual([handle, "user-1"]);
    expect(connectionExecute.mock.calls[1]?.[1]).toEqual([handle, 100, 30]);
    expect(connectionExecute.mock.calls[2]?.[1]).toEqual([
      30,
      handle,
      "user-1",
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

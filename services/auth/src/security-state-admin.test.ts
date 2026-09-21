import { describe, expect, it, vi } from "vitest";

import {
  createInMemoryAuthSecurityState,
  createSqlAuthSecurityState,
  type AuthSqlPool,
} from "./security-state.js";

describe("Auth principal administrative state", () => {
  it("persists block and role override semantics in the in-memory authority", async () => {
    const state = createInMemoryAuthSecurityState();
    await state.initialize();

    await expect(
      state.setPrincipalAdminState({
        subject: "business-owner-1",
        status: "blocked",
        roleOverride: "SUPPORT",
        updatedAt: 100,
        updatedBy: "platform-owner",
      }),
    ).resolves.toEqual({
      subject: "business-owner-1",
      status: "blocked",
      roleOverride: "SUPPORT",
      updatedAt: 100,
      updatedBy: "platform-owner",
    });

    await expect(
      state.getPrincipalAdminState("business-owner-1"),
    ).resolves.toEqual({
      subject: "business-owner-1",
      status: "blocked",
      roleOverride: "SUPPORT",
      updatedAt: 100,
      updatedBy: "platform-owner",
    });

    await state.setPrincipalAdminState({
      subject: "business-owner-1",
      status: "active",
      roleOverride: null,
      updatedAt: 110,
      updatedBy: "platform-owner",
    });

    await expect(
      state.getPrincipalAdminState("business-owner-1"),
    ).resolves.toMatchObject({
      status: "active",
      roleOverride: null,
      updatedAt: 110,
    });
  });

  it("writes and reads the durable SQL principal policy without storing credentials", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([{}, []])
      .mockResolvedValueOnce([
        [
          {
            actor_subject: "business-owner-1",
            status: "blocked",
            role_override: "SUPPORT",
            updated_at: 100,
            updated_by: "platform-owner",
          },
        ],
        [],
      ]);
    const pool = {
      query: vi.fn().mockResolvedValue([[], []]),
      execute,
      getConnection: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuthSqlPool;
    const state = createSqlAuthSecurityState(pool, { closePool: false });

    await state.setPrincipalAdminState({
      subject: "business-owner-1",
      status: "blocked",
      roleOverride: "SUPPORT",
      updatedAt: 100,
      updatedBy: "platform-owner",
    });
    await expect(
      state.getPrincipalAdminState("business-owner-1"),
    ).resolves.toEqual({
      subject: "business-owner-1",
      status: "blocked",
      roleOverride: "SUPPORT",
      updatedAt: 100,
      updatedBy: "platform-owner",
    });

    expect(execute.mock.calls[0]?.[0]).toContain(
      "INSERT INTO auth_principal_admin_state",
    );
    expect(execute.mock.calls[0]?.[1]).toEqual([
      "business-owner-1",
      "blocked",
      "SUPPORT",
      100,
      "platform-owner",
    ]);
    expect(execute.mock.calls[1]?.[0]).toContain(
      "FROM auth_principal_admin_state",
    );
    expect(JSON.stringify(execute.mock.calls)).not.toContain("password");
  });
});

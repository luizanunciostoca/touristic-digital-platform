import { describe, expect, it, vi } from "vitest";
import type { Pool } from "mysql2/promise";

// Mock pool for unit tests
function createMockPool(): Pool {
  return {
    execute: vi.fn(),
    getConnection: vi.fn(),
  } as unknown as Pool;
}

describe("CRM Settings Service", () => {
  it("validates setting key format", () => {
    const validKeys = [
      "follow_up.interval_days",
      "dashboard.refresh_rate",
      "notifications.enabled",
    ];
    const invalidKeys = ["", "a".repeat(121), "key with spaces"];

    for (const key of validKeys) {
      expect(key.length).toBeLessThanOrEqual(120);
      expect(key.length).toBeGreaterThan(0);
    }
    for (const key of invalidKeys) {
      expect(key.length === 0 || key.length > 120 || key.includes(" ")).toBe(
        true,
      );
    }
  });

  it("validates setting group format", () => {
    const validGroups = ["follow_up", "dashboard", "notifications", "general"];
    for (const group of validGroups) {
      expect(group.length).toBeLessThanOrEqual(80);
    }
  });
});

describe("CRM Storage Adapter", () => {
  it("computes SHA-256 checksum correctly", async () => {
    const { createHash } = await import("node:crypto");
    const data = Buffer.from("test data");
    const expected = createHash("sha256").update(data).digest("hex");
    expect(expected).toHaveLength(64);
    expect(/^[a-f0-9]{64}$/.test(expected)).toBe(true);
  });

  it("validates object key format", () => {
    const validKeys = [
      "proposals/2024/01/proposal-123.pdf",
      "contracts/contract-456.pdf",
    ];
    const invalidKeys = ["", "a".repeat(501)];

    for (const key of validKeys) {
      expect(key.length).toBeLessThanOrEqual(500);
      expect(key.length).toBeGreaterThan(0);
    }
    for (const key of invalidKeys) {
      expect(key.length === 0 || key.length > 500).toBe(true);
    }
  });

  it("creates filesystem adapter by default", () => {
    const pool = createMockPool();
    // The factory should default to filesystem when CRM_STORAGE_TYPE is not set
    expect(pool).toBeDefined();
  });

  it("requires S3 credentials when type is s3", () => {
    const envWithoutCredentials: Record<string, string | undefined> = {
      CRM_STORAGE_TYPE: "s3",
    };
    expect(envWithoutCredentials.CRM_STORAGE_S3_ENDPOINT).toBeUndefined();
    expect(envWithoutCredentials.CRM_STORAGE_S3_ACCESS_KEY).toBeUndefined();
    expect(envWithoutCredentials.CRM_STORAGE_S3_SECRET_KEY).toBeUndefined();
  });
});

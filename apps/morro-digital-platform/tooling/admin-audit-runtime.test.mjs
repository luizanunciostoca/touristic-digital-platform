import { describe, expect, it, vi } from "vitest";

import { createAdminAuditRuntime } from "./admin-audit-runtime.mjs";

describe("Control Center audit runtime", () => {
  it("uses bounded runtime projection outside production when no database is configured", async () => {
    const runtime = createAdminAuditRuntime({
      getEnvironmentValue(key) {
        return key === "NODE_ENV" ? "development" : "";
      },
    });

    expect(await runtime.start()).toBe(true);
    expect(runtime.durability()).toBe("runtime-projection-only");
    expect(runtime.readinessCheck()).toMatchObject({
      status: "warn",
      critical: false,
    });

    await runtime.append({
      action: "test.read",
      result: "success",
    });
    expect(await runtime.list(10)).toHaveLength(1);

    await runtime.stop();
  });

  it("fails closed in production without durable audit persistence", async () => {
    const runtime = createAdminAuditRuntime({
      getEnvironmentValue(key) {
        return key === "NODE_ENV" ? "production" : "";
      },
    });

    expect(await runtime.start()).toBe(false);
    expect(runtime.readinessCheck()).toMatchObject({
      status: "fail",
      critical: true,
      detail: "CONTROL_CENTER_AUDIT_DATABASE_URL_REQUIRED",
    });
    await expect(
      runtime.append({ action: "test.mutation", result: "attempt" }),
    ).rejects.toThrow("CONTROL_CENTER_AUDIT_DURABILITY_REQUIRED");
  });

  it("uses the MySQL-backed store when a database is configured", async () => {
    const append = vi.fn().mockResolvedValue(undefined);
    const list = vi.fn().mockResolvedValue([{ id: "1" }]);
    const end = vi.fn().mockResolvedValue(undefined);
    const applyControlCenterAuditSchema = vi.fn().mockResolvedValue(undefined);
    const pool = { end };

    class Store {
      append = append;
      list = list;
    }

    const runtime = createAdminAuditRuntime({
      getEnvironmentValue(key) {
        if (key === "NODE_ENV") return "production";
        if (key === "CONTROL_CENTER_AUDIT_DATABASE_URL") {
          return "mysql://audit.invalid/control_center";
        }
        return "";
      },
      async loadRuntime() {
        return {
          createAnalyticsMySqlPool() {
            return pool;
          },
          applyControlCenterAuditSchema,
          MySqlControlCenterAuditStore: Store,
        };
      },
    });

    expect(await runtime.start()).toBe(true);
    expect(runtime.durability()).toBe("mysql-append-only");
    expect(runtime.readinessCheck()).toMatchObject({
      status: "pass",
      critical: true,
    });

    await runtime.append({ action: "test.mutation", result: "success" });
    expect(append).toHaveBeenCalledTimes(1);
    expect(await runtime.list(20)).toEqual([{ id: "1" }]);

    await runtime.stop();
    expect(end).toHaveBeenCalledTimes(1);
  });
});

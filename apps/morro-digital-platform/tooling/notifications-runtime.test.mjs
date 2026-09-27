import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { createNotificationsRuntime } from "./notifications-runtime.mjs";

function platform() {
  return { emit: vi.fn() };
}

describe("notifications runtime composition", () => {
  it("maps production Node exports to emitted JavaScript artifacts", async () => {
    const domainManifest = JSON.parse(
      await readFile(
        new URL("../../../packages/notifications/package.json", import.meta.url),
        "utf8",
      ),
    );
    const serverManifest = JSON.parse(
      await readFile(
        new URL("../../../services/notifications/package.json", import.meta.url),
        "utf8",
      ),
    );

    expect(domainManifest.exports["."].node).toBe("./dist/index.js");
    expect(domainManifest.exports["./event-integration"].node).toBe(
      "./dist/event-integration.js",
    );
    expect(domainManifest.exports["./browser-permission"].node).toBe(
      "./dist/browser-permission.js",
    );
    expect(serverManifest.exports["."].node).toBe("./dist/index.js");
    expect(Object.keys(serverManifest.exports["."]).indexOf("node")).toBeLessThan(
      Object.keys(serverManifest.exports["."]).indexOf("default"),
    );
  });

  it("stays safely disabled without touching persistence", async () => {
    const loadRuntime = vi.fn();
    const runtime = createNotificationsRuntime({
      getEnvironmentValue: () => "",
      platformOperations: platform(),
      loadRuntime,
    });

    await expect(runtime.start()).resolves.toBe(true);
    expect(runtime.readinessCheck()).toEqual({
      status: "pass",
      critical: false,
      detail: "notifications-disabled",
    });
    expect(loadRuntime).not.toHaveBeenCalled();
    await expect(
      runtime.enqueueEvent({ tenantId: "tenant-1", event: {} }),
    ).resolves.toBe("unavailable");
  });

  it("starts schema, durable state and scheduler when explicitly enabled", async () => {
    const pool = { end: vi.fn(async () => undefined) };
    const repository = {
      enqueue: vi.fn(async () => "enqueued"),
    };
    const preferences = {
      set: vi.fn(async () => undefined),
      list: vi.fn(async () => []),
      isAllowed: vi.fn(async () => false),
    };
    const idempotency = {
      claim: vi.fn(async () => true),
      release: vi.fn(async () => undefined),
    };
    const host = {
      start: vi.fn(),
      stop: vi.fn(async () => undefined),
    };
    const dispatcher = { dispatch: vi.fn() };
    const createNotificationJobFromEvent = vi.fn(() => ({
      request: { id: "notification:event-1" },
      deliverAt: "2026-09-27T05:00:00.000Z",
      sourceEventId: "event-1",
    }));
    const server = {
      createNotificationsMySqlPool: vi.fn(() => pool),
      applyNotificationsSchema: vi.fn(async () => undefined),
      MySqlNotificationOutboxRepository: vi.fn(function () {
        return repository;
      }),
      MySqlNotificationPreferenceStore: vi.fn(function () {
        return preferences;
      }),
      MySqlNotificationIdempotencyStore: vi.fn(function () {
        return idempotency;
      }),
      createMySqlNotificationOutboxRuntime: vi.fn(() => host),
    };
    const domain = {
      createNotificationDispatcher: vi.fn(() => dispatcher),
    };
    const events = { createNotificationJobFromEvent };
    const loadRuntime = vi.fn(async () => ({ server, domain, events }));

    const runtime = createNotificationsRuntime({
      getEnvironmentValue(key) {
        if (key === "NOTIFICATIONS_FEATURE_ENABLED") return "true";
        if (key === "NOTIFICATIONS_DATABASE_URL") {
          return "mysql://user:password@db.invalid/morro_notifications";
        }
        return "";
      },
      platformOperations: platform(),
      loadRuntime,
    });

    await expect(runtime.start()).resolves.toBe(true);
    expect(server.applyNotificationsSchema).toHaveBeenCalledWith(pool);
    expect(domain.createNotificationDispatcher).toHaveBeenCalledWith({
      preferences,
      idempotency,
      providers: [],
    });
    expect(host.start).toHaveBeenCalledTimes(1);
    expect(runtime.readinessCheck()).toEqual({
      status: "pass",
      critical: true,
      detail: "notifications-runtime-ready",
    });

    await expect(
      runtime.enqueueEvent({
        tenantId: "tenant-1",
        event: { type: "ticket_issued" },
      }),
    ).resolves.toBe("enqueued");
    expect(repository.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        job: expect.objectContaining({ sourceEventId: "event-1" }),
      }),
    );

    await runtime.stop();
    expect(host.stop).toHaveBeenCalledTimes(1);
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it("fails closed when enabled persistence cannot start", async () => {
    const runtime = createNotificationsRuntime({
      getEnvironmentValue(key) {
        return key === "NOTIFICATIONS_FEATURE_ENABLED" ? "true" : "";
      },
      platformOperations: platform(),
      loadRuntime: vi.fn(),
    });

    await expect(runtime.start()).resolves.toBe(false);
    expect(runtime.readinessCheck()).toEqual({
      status: "fail",
      critical: true,
      detail: "NOTIFICATIONS_RUNTIME_UNAVAILABLE",
    });
  });
});

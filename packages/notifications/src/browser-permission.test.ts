import { describe, expect, it, vi } from "vitest";

import type { NotificationPreferenceQuery } from "./index.js";
import {
  createBrowserAwareNotificationPreferences,
  createBrowserNotificationPermissionPort,
} from "./browser-permission.js";

const pushQuery: NotificationPreferenceQuery = {
  destinationId: "morro-de-sao-paulo",
  recipientReference: "user:user-001",
  topic: "ticket",
  channel: "push",
};

describe("browser notification permission", () => {
  it("fails closed when the browser API is unavailable", async () => {
    const permission = createBrowserNotificationPermissionPort(null);

    expect(permission.current()).toBe("unsupported");
    await expect(permission.request()).resolves.toBe("unsupported");
  });

  it("reads permission without requesting it implicitly", () => {
    const requestPermission = vi.fn(async () => "granted" as const);
    const permission = createBrowserNotificationPermissionPort({
      permission: "default",
      requestPermission,
    });

    expect(permission.current()).toBe("default");
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("requests permission only through the explicit request operation", async () => {
    const requestPermission = vi.fn(async () => "granted" as const);
    const permission = createBrowserNotificationPermissionPort({
      permission: "default",
      requestPermission,
    });

    await expect(permission.request()).resolves.toBe("granted");
    expect(requestPermission).toHaveBeenCalledOnce();
  });
});

describe("browser-aware notification preferences", () => {
  it("requires both product preference and browser permission for push", async () => {
    const base = {
      isAllowed: vi.fn(async () => true),
    };
    const permission = createBrowserNotificationPermissionPort({
      permission: "default",
      requestPermission: vi.fn(async () => "granted" as const),
    });
    const preferences = createBrowserAwareNotificationPreferences({
      base,
      permission,
    });

    await expect(preferences.isAllowed(pushQuery)).resolves.toBe(false);
    expect(base.isAllowed).toHaveBeenCalledWith(pushQuery);
  });

  it("allows push only when permission is already granted", async () => {
    const preferences = createBrowserAwareNotificationPreferences({
      base: { isAllowed: async () => true },
      permission: createBrowserNotificationPermissionPort({
        permission: "granted",
        requestPermission: vi.fn(async () => "granted" as const),
      }),
    });

    await expect(preferences.isAllowed(pushQuery)).resolves.toBe(true);
  });

  it("does not apply browser permission to email or sms", async () => {
    const permission = createBrowserNotificationPermissionPort(null);
    const preferences = createBrowserAwareNotificationPreferences({
      base: { isAllowed: async () => true },
      permission,
    });

    await expect(
      preferences.isAllowed({ ...pushQuery, channel: "email" }),
    ).resolves.toBe(true);
    await expect(
      preferences.isAllowed({ ...pushQuery, channel: "sms" }),
    ).resolves.toBe(true);
  });

  it("preserves explicit product opt-out even when browser permission is granted", async () => {
    const preferences = createBrowserAwareNotificationPreferences({
      base: { isAllowed: async () => false },
      permission: createBrowserNotificationPermissionPort({
        permission: "granted",
        requestPermission: vi.fn(async () => "granted" as const),
      }),
    });

    await expect(preferences.isAllowed(pushQuery)).resolves.toBe(false);
  });
});

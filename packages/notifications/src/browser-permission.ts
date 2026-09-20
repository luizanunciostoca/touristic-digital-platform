import type {
  NotificationPreferencePort,
  NotificationPreferenceQuery,
} from "./index.js";

export type BrowserNotificationPermissionState =
  NotificationPermission | "unsupported";

export interface BrowserNotificationPermissionApi {
  readonly permission: NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
}

export interface BrowserNotificationPermissionPort {
  current(): BrowserNotificationPermissionState;
  request(): Promise<BrowserNotificationPermissionState>;
}

export interface BrowserAwareNotificationPreferenceOptions {
  readonly base: NotificationPreferencePort;
  readonly permission: BrowserNotificationPermissionPort;
}

function normalizePermission(
  value: unknown,
): BrowserNotificationPermissionState {
  return value === "granted" || value === "denied" || value === "default"
    ? value
    : "unsupported";
}

export function createBrowserNotificationPermissionPort(
  api: BrowserNotificationPermissionApi | null | undefined,
): BrowserNotificationPermissionPort {
  return Object.freeze({
    current(): BrowserNotificationPermissionState {
      if (!api) return "unsupported";
      return normalizePermission(api.permission);
    },

    async request(): Promise<BrowserNotificationPermissionState> {
      if (!api) return "unsupported";

      try {
        return normalizePermission(await api.requestPermission());
      } catch {
        return "unsupported";
      }
    },
  });
}

export function createBrowserAwareNotificationPreferences(
  options: BrowserAwareNotificationPreferenceOptions,
): NotificationPreferencePort {
  return Object.freeze({
    async isAllowed(query: NotificationPreferenceQuery): Promise<boolean> {
      const preferenceAllowed = await options.base.isAllowed(query);
      if (!preferenceAllowed) return false;

      if (query.channel !== "push") return true;
      return options.permission.current() === "granted";
    },
  });
}

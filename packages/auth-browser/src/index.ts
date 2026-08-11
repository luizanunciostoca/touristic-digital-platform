import type { AuthRole } from "@touristic/auth";

const protectedPrefixes = Object.freeze([
  "/api/dashboard",
  "/api/offers",
  "/api/business",
]);
const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
const csrfStorageKey = "md_dashboard_csrf";

export interface DashboardSessionResponse {
  readonly authenticated: true;
  readonly csrfToken: string;
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly role: AuthRole;
    readonly businessIds: readonly string[];
  };
}

export interface BrowserStoragePort {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
}

export interface BrowserLocationPort {
  readonly origin: string;
  readonly pathname: string;
  readonly search: string;
  readonly replace: (url: string) => void;
}

export interface DashboardAuthClientOptions {
  readonly fetchFn: typeof fetch;
  readonly storage: BrowserStoragePort;
  readonly location: BrowserLocationPort;
  readonly demoMode?: boolean;
}

export interface DashboardAuthClient {
  readonly getSession: (
    force?: boolean,
  ) => Promise<DashboardSessionResponse | null>;
  readonly secureFetch: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
  readonly logout: () => Promise<boolean>;
}

function requestUrl(input: RequestInfo | URL, origin: string): URL | null {
  try {
    const value =
      typeof input === "string" || input instanceof URL ? input : input.url;
    return new URL(value, origin);
  } catch {
    return null;
  }
}

function isProtectedRequest(input: RequestInfo | URL, origin: string): boolean {
  const url = requestUrl(input, origin);
  return Boolean(
    url &&
    url.origin === origin &&
    protectedPrefixes.some((prefix) => url.pathname.startsWith(prefix)),
  );
}

function isLoginRequest(input: RequestInfo | URL, origin: string): boolean {
  return requestUrl(input, origin)?.pathname === "/api/dashboard/auth/login";
}

function safeLoginUrl(location: BrowserLocationPort): string {
  const current = `${location.pathname}${location.search}`;
  const returnPath = current.startsWith("/dashboard/")
    ? current
    : "/dashboard/index-v3-improved.html";
  return `/dashboard/login.html?return=${encodeURIComponent(returnPath)}`;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.method.toUpperCase();
  }
  return "GET";
}

function requestHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  if (init?.headers) return new Headers(init.headers);
  if (typeof Request !== "undefined" && input instanceof Request) {
    return new Headers(input.headers);
  }
  return new Headers();
}

export function createDashboardAuthClient(
  options: DashboardAuthClientOptions,
): DashboardAuthClient {
  const { fetchFn, storage, location, demoMode = false } = options;
  let sessionPromise: Promise<DashboardSessionResponse | null> | null = null;
  let csrfToken = storage.getItem(csrfStorageKey) ?? "";

  async function getSession(
    force = false,
  ): Promise<DashboardSessionResponse | null> {
    if (demoMode) return null;
    if (!force && sessionPromise) return sessionPromise;

    sessionPromise = fetchFn("/api/dashboard/auth/session", {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("AUTH_REQUIRED");
        const data = (await response.json()) as DashboardSessionResponse;
        csrfToken = typeof data.csrfToken === "string" ? data.csrfToken : "";
        if (csrfToken) storage.setItem(csrfStorageKey, csrfToken);
        return data;
      })
      .catch((error: unknown) => {
        sessionPromise = null;
        csrfToken = "";
        storage.removeItem(csrfStorageKey);
        throw error;
      });

    return sessionPromise;
  }

  async function secureFetch(
    input: RequestInfo | URL,
    init: RequestInit = {},
    retry = true,
  ): Promise<Response> {
    if (
      !isProtectedRequest(input, location.origin) ||
      isLoginRequest(input, location.origin)
    ) {
      return fetchFn(input, init);
    }

    const method = requestMethod(input, init);
    const headers = requestHeaders(input, init);
    const requestInit: RequestInit = {
      ...init,
      method,
      headers,
      credentials: "same-origin",
    };

    if (!safeMethods.has(method) && !demoMode) {
      if (!csrfToken) await getSession();
      headers.set("X-CSRF-Token", csrfToken);
    }

    const response = await fetchFn(input, requestInit);
    if (response.status === 401 && !demoMode) {
      storage.removeItem(csrfStorageKey);
      csrfToken = "";
      location.replace(safeLoginUrl(location));
      return response;
    }

    if (
      response.status === 403 &&
      retry &&
      !safeMethods.has(method) &&
      !demoMode
    ) {
      const body = (await response
        .clone()
        .json()
        .catch(() => ({}))) as { error?: unknown };
      if (body.error === "INVALID_CSRF") {
        sessionPromise = null;
        await getSession(true);
        return secureFetch(input, init, false);
      }
    }

    return response;
  }

  async function logout(): Promise<boolean> {
    if (!csrfToken && !demoMode) await getSession();
    const response = await secureFetch("/api/dashboard/auth/logout", {
      method: "POST",
    });
    storage.removeItem(csrfStorageKey);
    csrfToken = "";
    if (response.ok) location.replace("/dashboard/login.html");
    return response.ok;
  }

  return Object.freeze({ getSession, secureFetch, logout });
}

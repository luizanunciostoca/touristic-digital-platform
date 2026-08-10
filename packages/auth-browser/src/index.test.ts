import { describe, expect, it, vi } from "vitest";

import { createDashboardAuthClient } from "./index.js";

function storageFixture(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    port: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    },
    values,
  };
}

function locationFixture(pathname = "/dashboard/index.html", search = "") {
  const replace = vi.fn();
  return {
    port: {
      origin: "https://morro.example",
      pathname,
      search,
      replace,
    },
    replace,
  };
}

function sessionResponse(csrfToken = "csrf-1") {
  return new Response(
    JSON.stringify({
      authenticated: true,
      csrfToken,
      user: {
        id: "user-1",
        email: "owner@example.com",
        role: "owner",
        businessIds: ["toca-do-morcego"],
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("M48 browser auth adapter", () => {
  it("loads and caches the browser-safe session projection", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(sessionResponse());
    const storage = storageFixture();
    const location = locationFixture();
    const client = createDashboardAuthClient({
      fetchFn,
      storage: storage.port,
      location: location.port,
    });

    const first = await client.getSession();
    const second = await client.getSession();

    expect(first?.user.email).toBe("owner@example.com");
    expect(second).toBe(first);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(storage.values.get("md_dashboard_csrf")).toBe("csrf-1");
  });

  it("attaches same-origin credentials and CSRF to protected mutations", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const storage = storageFixture({ md_dashboard_csrf: "csrf-existing" });
    const location = locationFixture();
    const client = createDashboardAuthClient({
      fetchFn,
      storage: storage.port,
      location: location.port,
    });

    await client.secureFetch("/api/dashboard/offers", { method: "POST" });

    const [, init] = fetchFn.mock.calls[0] ?? [];
    expect(init?.credentials).toBe("same-origin");
    expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe("csrf-existing");
  });

  it("does not intercept unprotected or login requests", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const storage = storageFixture();
    const location = locationFixture();
    const client = createDashboardAuthClient({
      fetchFn,
      storage: storage.port,
      location: location.port,
    });

    await client.secureFetch("/api/weather");
    await client.secureFetch("/api/dashboard/auth/login", { method: "POST" });

    expect(fetchFn).toHaveBeenNthCalledWith(1, "/api/weather", {});
    expect(fetchFn).toHaveBeenNthCalledWith(2, "/api/dashboard/auth/login", {
      method: "POST",
    });
  });

  it("redirects 401 to a dashboard-scoped return path", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 }));
    const storage = storageFixture({ md_dashboard_csrf: "csrf-existing" });
    const location = locationFixture("/dashboard/metrics.html", "?tab=1");
    const client = createDashboardAuthClient({
      fetchFn,
      storage: storage.port,
      location: location.port,
    });

    await client.secureFetch("/api/dashboard/metrics");

    expect(storage.values.has("md_dashboard_csrf")).toBe(false);
    expect(location.replace).toHaveBeenCalledWith(
      "/dashboard/login.html?return=%2Fdashboard%2Fmetrics.html%3Ftab%3D1",
    );
  });

  it("refreshes CSRF and retries an unsafe request exactly once", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "INVALID_CSRF" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(sessionResponse("csrf-refreshed"))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const storage = storageFixture({ md_dashboard_csrf: "csrf-stale" });
    const location = locationFixture();
    const client = createDashboardAuthClient({
      fetchFn,
      storage: storage.port,
      location: location.port,
    });

    const response = await client.secureFetch("/api/dashboard/offers", {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    const [, retryInit] = fetchFn.mock.calls[2] ?? [];
    expect(new Headers(retryInit?.headers).get("X-CSRF-Token")).toBe(
      "csrf-refreshed",
    );
  });

  it("logs out through the protected mutation and clears browser CSRF state", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const storage = storageFixture({ md_dashboard_csrf: "csrf-existing" });
    const location = locationFixture();
    const client = createDashboardAuthClient({
      fetchFn,
      storage: storage.port,
      location: location.port,
    });

    expect(await client.logout()).toBe(true);
    expect(storage.values.has("md_dashboard_csrf")).toBe(false);
    expect(location.replace).toHaveBeenCalledWith("/dashboard/login.html");
  });
});

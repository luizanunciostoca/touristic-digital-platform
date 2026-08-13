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
  it("logs in through the same-origin Auth boundary and caches the safe session projection", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(sessionResponse("csrf-login"));
    const storage = storageFixture();
    const location = locationFixture("/dashboard/login.html");
    const client = createDashboardAuthClient({
      fetchFn,
      storage: storage.port,
      location: location.port,
    });

    const session = await client.login({
      email: "owner@example.com",
      password: "secret",
    });
    const cached = await client.getSession();

    expect(session.user.email).toBe("owner@example.com");
    expect(cached).toBe(session);
    expect(storage.values.get("md_dashboard_csrf")).toBe("csrf-login");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith("/api/dashboard/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "owner@example.com", password: "secret" }),
    });
  });

  it("fails login without retaining stale browser CSRF state", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ message: "E-mail ou senha inválidos." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const storage = storageFixture({ md_dashboard_csrf: "stale" });
    const location = locationFixture("/dashboard/login.html");
    const client = createDashboardAuthClient({
      fetchFn,
      storage: storage.port,
      location: location.port,
    });

    await expect(
      client.login({ email: "owner@example.com", password: "wrong" }),
    ).rejects.toThrow("E-mail ou senha inválidos.");
    expect(storage.values.has("md_dashboard_csrf")).toBe(false);
  });

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
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 200 }));
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
    expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe(
      "csrf-existing",
    );
  });

  it("protects CRM mutations with same-origin credentials and CSRF", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 200 }));
    const storage = storageFixture({ md_dashboard_csrf: "csrf-crm" });
    const location = locationFixture("/apps/admin-crm/public/index.html");
    const client = createDashboardAuthClient({
      fetchFn,
      storage: storage.port,
      location: location.port,
    });

    await client.secureFetch("/api/crm/leads/lead-1", { method: "PATCH" });

    const [, init] = fetchFn.mock.calls[0] ?? [];
    expect(init?.credentials).toBe("same-origin");
    expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe("csrf-crm");
  });

  it("does not intercept unprotected or login requests", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 200 }));
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
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 401 }));
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

  it("preserves the CRM shell return path after a protected 401", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 401 }));
    const storage = storageFixture({ md_dashboard_csrf: "csrf-existing" });
    const location = locationFixture(
      "/apps/admin-crm/public/index.html",
      "?view=leads",
    );
    const client = createDashboardAuthClient({
      fetchFn,
      storage: storage.port,
      location: location.port,
    });

    await client.secureFetch("/api/crm/leads");

    expect(storage.values.has("md_dashboard_csrf")).toBe(false);
    expect(location.replace).toHaveBeenCalledWith(
      "/dashboard/login.html?return=%2Fapps%2Fadmin-crm%2Fpublic%2Findex.html%3Fview%3Dleads",
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

  it("refreshes CSRF and retries a CRM mutation exactly once", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "INVALID_CSRF" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(sessionResponse("csrf-crm-refreshed"))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const storage = storageFixture({ md_dashboard_csrf: "csrf-crm-stale" });
    const location = locationFixture("/apps/admin-crm/public/index.html");
    const client = createDashboardAuthClient({
      fetchFn,
      storage: storage.port,
      location: location.port,
    });

    const response = await client.secureFetch("/api/crm/trials/trial-1/cancel", {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    const [, retryInit] = fetchFn.mock.calls[2] ?? [];
    expect(new Headers(retryInit?.headers).get("X-CSRF-Token")).toBe(
      "csrf-crm-refreshed",
    );
  });

  it("logs out through the protected mutation and clears browser CSRF state", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 200 }));
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

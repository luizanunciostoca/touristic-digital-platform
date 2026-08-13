import { describe, expect, it, vi } from "vitest";

import { createDashboardAuthClient } from "./index.js";

function storageFixture(csrfToken: string) {
  const values = new Map([["md_dashboard_csrf", csrfToken]]);
  return {
    port: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    },
    values,
  };
}

function locationFixture(search = "") {
  const replace = vi.fn();
  return {
    port: {
      origin: "https://morro.example",
      pathname: "/apps/admin-crm/public/index.html",
      search,
      replace,
    },
    replace,
  };
}

function sessionResponse(csrfToken: string) {
  return new Response(
    JSON.stringify({
      authenticated: true,
      csrfToken,
      user: {
        id: "user-1",
        email: "owner@example.com",
        role: "owner",
        businessIds: [],
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("M105 CRM browser auth transport", () => {
  it("protects CRM mutations with same-origin credentials and CSRF", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 200 }));
    const storage = storageFixture("csrf-crm");
    const location = locationFixture();
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

  it("preserves the CRM shell return path after a protected 401", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 401 }));
    const storage = storageFixture("csrf-crm");
    const location = locationFixture("?view=leads");
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

  it("refreshes CSRF and retries a CRM mutation exactly once", async () => {
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
    const storage = storageFixture("csrf-stale");
    const location = locationFixture();
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
      "csrf-refreshed",
    );
  });
});

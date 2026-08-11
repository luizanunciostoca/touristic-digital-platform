import { describe, expect, it, vi } from "vitest";

import { createDashboardAuthClient } from "./index.js";

function createClient(fetchFn: typeof fetch) {
  const values = new Map<string, string>([
    ["md_dashboard_csrf", "csrf-existing"],
  ]);
  return createDashboardAuthClient({
    fetchFn,
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => void values.set(key, value),
      removeItem: (key) => void values.delete(key),
    },
    location: {
      origin: "https://morro.example",
      pathname: "/dashboard/index.html",
      search: "",
      replace: vi.fn(),
    },
  });
}

describe("M51 Business API browser protection", () => {
  it("attaches same-origin credentials and CSRF to Business mutations", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 200 }));
    const client = createClient(fetchFn);

    await client.secureFetch("/api/business/toca-do-morcego/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    const [, init] = fetchFn.mock.calls[0] ?? [];
    expect(init?.credentials).toBe("same-origin");
    expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe(
      "csrf-existing",
    );
  });

  it("keeps Business reads same-origin without requiring a CSRF header", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 200 }));
    const client = createClient(fetchFn);

    await client.secureFetch("/api/business/toca-do-morcego/profile");

    const [, init] = fetchFn.mock.calls[0] ?? [];
    expect(init?.credentials).toBe("same-origin");
    expect(new Headers(init?.headers).has("X-CSRF-Token")).toBe(false);
  });
});

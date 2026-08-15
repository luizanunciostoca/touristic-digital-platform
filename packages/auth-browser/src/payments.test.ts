import { describe, expect, it, vi } from "vitest";

import { createDashboardAuthClient } from "./index.js";

describe("M149 Payments browser Auth composition", () => {
  it("attaches same-origin credentials and CSRF to Payments mutations", async () => {
    const values = new Map<string, string>([
      ["md_dashboard_csrf", "csrf-payments-m149"],
    ]);
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 201 }));
    const client = createDashboardAuthClient({
      fetchFn,
      storage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => void values.set(key, value),
        removeItem: (key) => void values.delete(key),
      },
      location: {
        origin: "https://morro.digital",
        pathname: "/apps/morro-digital-platform/public/business-onboarding.html",
        search: "",
        replace: vi.fn(),
      },
    });

    const response = await client.secureFetch("/api/payments/v1/checkouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    expect(response.status).toBe(201);
    const [, init] = fetchFn.mock.calls[0] ?? [];
    expect(init?.credentials).toBe("same-origin");
    expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe(
      "csrf-payments-m149",
    );
  });

  it("does not attach CSRF to capability-bound Payments status reads", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 200 }));
    const client = createDashboardAuthClient({
      fetchFn,
      storage: {
        getItem: () => "csrf-payments-m149",
        setItem: () => undefined,
        removeItem: () => undefined,
      },
      location: {
        origin: "https://morro.digital",
        pathname: "/apps/morro-digital-platform/public/business-onboarding.html",
        search: "",
        replace: vi.fn(),
      },
    });

    await client.secureFetch(
      "/api/payments/v1/checkouts/ord_m149_checkout_0001",
      { method: "GET" },
    );

    const [, init] = fetchFn.mock.calls[0] ?? [];
    expect(init?.credentials).toBe("same-origin");
    expect(new Headers(init?.headers).has("X-CSRF-Token")).toBe(false);
  });
});

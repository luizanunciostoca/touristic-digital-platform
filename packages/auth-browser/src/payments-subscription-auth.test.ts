import { describe, expect, it, vi } from "vitest";

import { createDashboardAuthClient } from "./index.js";

describe("payments subscription auth boundary", () => {
  it("adds same-origin credentials and CSRF to subscription mutations only", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 200 }));
    const client = createDashboardAuthClient({
      fetchFn,
      storage: {
        getItem: () => "csrf-subscription",
        setItem: () => undefined,
        removeItem: () => undefined,
      },
      location: {
        origin: "https://morro.example",
        pathname: "/dashboard/index.html",
        search: "",
        replace: () => undefined,
      },
    });

    await client.secureFetch(
      "/api/payments/v1/subscriptions/sub_auth_00000001/provider/pause",
      { method: "POST" },
    );
    await client.secureFetch("/api/payments/v1/checkout", { method: "POST" });

    const [, subscriptionInit] = fetchFn.mock.calls[0] ?? [];
    expect(subscriptionInit?.credentials).toBe("same-origin");
    expect(new Headers(subscriptionInit?.headers).get("X-CSRF-Token")).toBe(
      "csrf-subscription",
    );

    expect(fetchFn).toHaveBeenNthCalledWith(2, "/api/payments/v1/checkout", {
      method: "POST",
    });
  });
});

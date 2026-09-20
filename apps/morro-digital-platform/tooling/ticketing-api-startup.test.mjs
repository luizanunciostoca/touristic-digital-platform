import { describe, expect, it } from "vitest";

import { createTicketingApi } from "./ticketing-api.mjs";

function authApi() {
  return {
    resolveSession: async () => null,
    authorizeMutation: () => ({ allowed: false }),
  };
}

describe("ticketing startup configuration", () => {
  it("starts in a safe disabled state when the feature flag is omitted", async () => {
    const api = createTicketingApi({
      authApi: authApi(),
      getEnvironmentValue: () => "",
      audit: () => {},
    });

    await expect(api.start()).resolves.toBe(true);
    await api.stop();
  });

  it("rejects an invalid feature flag instead of silently disabling Ticketing", async () => {
    const api = createTicketingApi({
      authApi: authApi(),
      getEnvironmentValue: (key) =>
        key === "TICKETING_FEATURE_ENABLED" ? "TRUE" : "",
      audit: () => {},
    });

    await expect(api.start()).resolves.toBe(false);
  });

  it("fails closed when Ticketing is enabled without mandatory dependencies", async () => {
    const api = createTicketingApi({
      authApi: authApi(),
      getEnvironmentValue: (key) =>
        key === "TICKETING_FEATURE_ENABLED" ? "true" : "",
      audit: () => {},
    });

    await expect(api.start()).resolves.toBe(false);
  });
});

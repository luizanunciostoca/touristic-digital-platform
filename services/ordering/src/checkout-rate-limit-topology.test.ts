import { describe, expect, it } from "vitest";
import { createTopologySafeCheckoutRateLimitPort } from "./checkout-rate-limit.js";

describe("checkout rate-limit topology guard", () => {
  it("allows the in-memory limiter only for a single runtime replica", () => {
    expect(() =>
      createTopologySafeCheckoutRateLimitPort({
        runtimeReplicaCount: 1,
        distributedStoreConfigured: false,
      }),
    ).not.toThrow();
  });

  it("fails closed when multiple replicas lack a distributed store", () => {
    expect(() =>
      createTopologySafeCheckoutRateLimitPort({
        runtimeReplicaCount: 2,
        distributedStoreConfigured: false,
      }),
    ).toThrow("CHECKOUT_RATE_LIMIT_DISTRIBUTED_STORE_REQUIRED");
  });
});

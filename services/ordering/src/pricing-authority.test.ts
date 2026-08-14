import { describe, expect, it } from "vitest";

import {
  createNodeCheckoutIdentityPort,
  createOrderPricingAuthorityFromEnvironment,
  systemCheckoutClock,
} from "./index.js";

function catalog(plans: readonly Record<string, unknown>[] = [
  {
    id: "growth",
    name: "Crescimento",
    minorUnits: 49_900,
    currency: "BRL",
  },
]): string {
  return JSON.stringify({
    version: "plans_2026_08",
    plans,
  });
}

describe("M138 authoritative pricing environment", () => {
  it("resolves immutable integer minor-unit quotes from server configuration", async () => {
    const authority = createOrderPricingAuthorityFromEnvironment({
      ORDERING_PRICING_CATALOG_JSON: catalog(),
    });

    const quote = await authority.resolvePlan("growth");

    expect(quote).toEqual({
      planId: "growth",
      planName: "Crescimento",
      amount: { minorUnits: 49_900, currency: "BRL" },
      pricingVersion: "plans_2026_08",
    });
    expect(Object.isFrozen(quote)).toBe(true);
    await expect(authority.resolvePlan(" growth ")).resolves.toBeNull();
    await expect(authority.resolvePlan("Growth")).resolves.toBeNull();
  });

  it("fails closed on missing, malformed, duplicate and zero-value catalogs", () => {
    expect(() =>
      createOrderPricingAuthorityFromEnvironment({}),
    ).toThrow("ORDERING_PRICING_CATALOG_JSON is required");
    expect(() =>
      createOrderPricingAuthorityFromEnvironment({
        ORDERING_PRICING_CATALOG_JSON: "{",
      }),
    ).toThrow("ORDERING_PRICING_CATALOG_INVALID");
    expect(() =>
      createOrderPricingAuthorityFromEnvironment({
        ORDERING_PRICING_CATALOG_JSON: catalog([
          {
            id: "growth",
            name: "Crescimento",
            minorUnits: 49_900,
            currency: "BRL",
          },
          {
            id: "growth",
            name: "Duplicado",
            minorUnits: 59_900,
            currency: "BRL",
          },
        ]),
      }),
    ).toThrow("ORDERING_PRICING_CATALOG_INVALID");
    expect(() =>
      createOrderPricingAuthorityFromEnvironment({
        ORDERING_PRICING_CATALOG_JSON: catalog([
          {
            id: "free",
            name: "Grátis",
            minorUnits: 0,
            currency: "BRL",
          },
        ]),
      }),
    ).toThrow("ORDERING_PRICING_CATALOG_INVALID");
  });

  it("rejects decimal, unsafe and normalization-dependent configured prices", () => {
    for (const plan of [
      {
        id: "growth",
        name: "Crescimento",
        minorUnits: 49.9,
        currency: "BRL",
      },
      {
        id: "growth",
        name: "Crescimento",
        minorUnits: Number.MAX_SAFE_INTEGER + 1,
        currency: "BRL",
      },
      {
        id: " growth ",
        name: "Crescimento",
        minorUnits: 49_900,
        currency: "BRL",
      },
    ]) {
      expect(() =>
        createOrderPricingAuthorityFromEnvironment({
          ORDERING_PRICING_CATALOG_JSON: catalog([plan]),
        }),
      ).toThrow("ORDERING_PRICING_CATALOG_INVALID");
    }
  });
});

describe("M138 server-owned checkout runtime", () => {
  it("allocates cryptographically random typed-shape identities", () => {
    const identities = createNodeCheckoutIdentityPort();
    const firstOrder = identities.allocateOrderId();
    const secondOrder = identities.allocateOrderId();
    const payment = identities.allocatePaymentId();

    expect(firstOrder).toMatch(/^ord_[A-Za-z0-9_-]{8,}$/u);
    expect(secondOrder).toMatch(/^ord_[A-Za-z0-9_-]{8,}$/u);
    expect(payment).toMatch(/^pay_[A-Za-z0-9_-]{8,}$/u);
    expect(secondOrder).not.toBe(firstOrder);
  });

  it("exposes only a UTC ISO clock without provider configuration", () => {
    const now = systemCheckoutClock.now();

    expect(now).toMatch(/Z$/u);
    expect(Number.isFinite(Date.parse(String(now)))).toBe(true);
    expect(systemCheckoutClock).not.toHaveProperty("providerToken");
  });
});

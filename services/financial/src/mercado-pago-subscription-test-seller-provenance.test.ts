import { describe, expect, it } from "vitest";

import { createMercadoPagoSubscriptionProviderFromEnvironment } from "./mercado-pago-subscription-credentials-provider.js";

const testSellerToken =
  "APP_USR-test-seller-app-token-fixture-123456789012345678901234567890";
const testSellerUserId = "9999999999";
const testSellerApplicationId = "8888888888888888";

function environment(overrides: Record<string, string> = {}) {
  return {
    PAYMENTS_PROVIDER_MODE: "mercado_pago",
    MERCADO_PAGO_CHECKOUT_MODE: "test",
    MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED: "true",
    MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN: testSellerToken,
    RENDER_SERVICE_NAME: "morro-digital-v2-staging",
    ...overrides,
  };
}

describe("Mercado Pago TEST seller application credential provenance", () => {
  it("rejects APP_USR in TEST mode without explicit test-seller provenance", () => {
    expect(() =>
      createMercadoPagoSubscriptionProviderFromEnvironment(environment()),
    ).toThrow("MERCADO_PAGO_SUBSCRIPTIONS_TEST_SELLER_APP_PROVENANCE_REQUIRED");
  });

  it("rejects APP_USR TEST-seller provenance outside the dedicated V2 staging service", () => {
    expect(() =>
      createMercadoPagoSubscriptionProviderFromEnvironment(
        environment({
          MERCADO_PAGO_SUBSCRIPTIONS_CREDENTIAL_ORIGIN: "test_seller_account",
          MERCADO_PAGO_SUBSCRIPTIONS_TEST_SELLER_USER_ID: testSellerUserId,
          MERCADO_PAGO_SUBSCRIPTIONS_TEST_SELLER_APPLICATION_ID:
            testSellerApplicationId,
          RENDER_SERVICE_NAME: "morro-digital-production",
        }),
      ),
    ).toThrow("MERCADO_PAGO_SUBSCRIPTIONS_TEST_SELLER_APP_PROVENANCE_REQUIRED");
  });

  it("accepts APP_USR in TEST mode only with explicit test-seller account and application identity", () => {
    expect(() =>
      createMercadoPagoSubscriptionProviderFromEnvironment(
        environment({
          MERCADO_PAGO_SUBSCRIPTIONS_CREDENTIAL_ORIGIN: "test_seller_account",
          MERCADO_PAGO_SUBSCRIPTIONS_TEST_SELLER_USER_ID: testSellerUserId,
          MERCADO_PAGO_SUBSCRIPTIONS_TEST_SELLER_APPLICATION_ID:
            testSellerApplicationId,
        }),
      ),
    ).not.toThrow();
  });

  it("rejects malformed non-secret seller identifiers", () => {
    expect(() =>
      createMercadoPagoSubscriptionProviderFromEnvironment(
        environment({
          MERCADO_PAGO_SUBSCRIPTIONS_CREDENTIAL_ORIGIN: "test_seller_account",
          MERCADO_PAGO_SUBSCRIPTIONS_TEST_SELLER_USER_ID: "TESTUSER123",
          MERCADO_PAGO_SUBSCRIPTIONS_TEST_SELLER_APPLICATION_ID: "app_123",
        }),
      ),
    ).toThrow("MERCADO_PAGO_SUBSCRIPTIONS_TEST_SELLER_APP_PROVENANCE_REQUIRED");
  });
});

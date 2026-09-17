import assert from "node:assert/strict";
import test from "node:test";

import { validateMercadoPagoProductionCutover } from "./payments-production-cutover-guard.mjs";

function productionEnvironment(overrides = {}) {
  return {
    NODE_ENV: "production",
    MERCADO_PAGO_CHECKOUT_MODE: "production",
    MERCADO_PAGO_PRODUCTION_AUTHORIZATION_ID: "FINAUTH-ISSUE-33-20260917",
    MERCADO_PAGO_ACCESS_TOKEN:
      "APP_USR-production-access-token-fixture-not-a-real-secret",
    VITE_MERCADO_PAGO_PUBLIC_KEY:
      "APP_USR-production-public-key-fixture-1234567890",
    PAYMENTS_WEBHOOK_URL:
      "https://morro.digital/api/payments/v1/webhooks/sandbox",
    PAYMENTS_SUBSCRIPTIONS_ENABLED: "false",
    MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED: "false",
    ...overrides,
  };
}

test("keeps TEST mode outside the financial authorization gate", () => {
  assert.deepEqual(
    validateMercadoPagoProductionCutover({
      MERCADO_PAGO_CHECKOUT_MODE: "test",
      PAYMENTS_SUBSCRIPTIONS_ENABLED: "false",
    }),
    {
      mode: "test",
      productionAuthorized: false,
      subscriptionsEnabled: false,
    },
  );
});

test("fails closed when production mode lacks explicit financial authorization", () => {
  assert.throws(
    () =>
      validateMercadoPagoProductionCutover(
        productionEnvironment({
          MERCADO_PAGO_PRODUCTION_AUTHORIZATION_ID: "",
        }),
      ),
    /MERCADO_PAGO_PRODUCTION_AUTHORIZATION_ID_REQUIRED/u,
  );
});

test("rejects TEST confirmation and TEST credentials in production mode", () => {
  assert.throws(
    () =>
      validateMercadoPagoProductionCutover(
        productionEnvironment({
          MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED: "true",
        }),
      ),
    /MERCADO_PAGO_PRODUCTION_REJECTS_TEST_CONFIRMATION/u,
  );

  assert.throws(
    () =>
      validateMercadoPagoProductionCutover(
        productionEnvironment({
          MERCADO_PAGO_ACCESS_TOKEN:
            "TEST-production-must-never-use-this-fixture-credential",
        }),
      ),
    /MERCADO_PAGO_ACCESS_TOKEN_PRODUCTION_CREDENTIAL_REQUIRED/u,
  );
});

test("requires complete dedicated production subscription configuration when enabled", () => {
  assert.throws(
    () =>
      validateMercadoPagoProductionCutover(
        productionEnvironment({
          PAYMENTS_SUBSCRIPTIONS_ENABLED: "true",
        }),
      ),
    /MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN_REQUIRED/u,
  );

  assert.deepEqual(
    validateMercadoPagoProductionCutover(
      productionEnvironment({
        PAYMENTS_SUBSCRIPTIONS_ENABLED: "true",
        MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN:
          "APP_USR-subscriptions-production-token-fixture-not-secret",
        MERCADO_PAGO_SUBSCRIPTIONS_PUBLIC_KEY:
          "APP_USR-subscriptions-production-public-key-1234567890",
        PAYMENTS_SUBSCRIPTION_BACK_URL: "https://morro.digital/assinaturas",
      }),
    ),
    {
      mode: "production",
      productionAuthorized: true,
      authorizationId: "FINAUTH-ISSUE-33-20260917",
      subscriptionsEnabled: true,
    },
  );
});

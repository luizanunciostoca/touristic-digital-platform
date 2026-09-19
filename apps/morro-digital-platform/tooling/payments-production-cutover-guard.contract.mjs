import assert from "node:assert/strict";

// Exact-head production-cutover contract remains TEST-safe until explicit financial authorization.
import test from "node:test";

import {
  validateMercadoPagoProductionCutover,
} from "./payments-production-cutover-guard.mjs";

function testEnvironment(overrides = {}) {
  return {
    MERCADO_PAGO_CHECKOUT_MODE: "test",
    MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED: "true",
    VITE_MERCADO_PAGO_PUBLIC_KEY:
      "fixture-test-public-credential-1234567890",
    PAYMENTS_SUBSCRIPTIONS_ENABLED: "false",
    ...overrides,
  };
}

function productionEnvironment(overrides = {}) {
  return {
    NODE_ENV: "production",
    MERCADO_PAGO_CHECKOUT_MODE: "production",
    MERCADO_PAGO_PRODUCTION_AUTHORIZATION_ID: "FINAUTH-ISSUE-33-20260917",
    MERCADO_PAGO_PRODUCTION_CREDENTIALS_CONFIRMED: "true",
    MERCADO_PAGO_ACCESS_TOKEN:
      "fixture-production-server-credential-value-1234567890",
    VITE_MERCADO_PAGO_PUBLIC_KEY:
      "fixture-production-public-credential-1234567890",
    PAYMENTS_WEBHOOK_URL:
      "https://morro.digital/api/payments/v1/webhooks/sandbox",
    PAYMENTS_SUBSCRIPTIONS_ENABLED: "false",
    MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED: "false",
    ...overrides,
  };
}

test("keeps TEST mode outside the financial authorization gate", () => {
  assert.deepEqual(validateMercadoPagoProductionCutover(testEnvironment()), {
    mode: "test",
    productionAuthorized: false,
    productionCredentialsConfirmed: false,
    subscriptionsEnabled: false,
  });
});

test("requires browser Public Key in TEST mode", () => {
  assert.throws(
    () =>
      validateMercadoPagoProductionCutover(
        testEnvironment({ VITE_MERCADO_PAGO_PUBLIC_KEY: "" }),
      ),
    /VITE_MERCADO_PAGO_PUBLIC_KEY_REQUIRED/u,
  );
});

test(
  "fails closed when TEST credentials are not explicitly confirmed",
  () => {
    assert.throws(
      () =>
        validateMercadoPagoProductionCutover(
          testEnvironment({
            MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED: "false",
          }),
        ),
      /MERCADO_PAGO_TEST_CREDENTIALS_NOT_CONFIRMED/u,
    );
  },
);

test(
  "validates and normalizes subscriptions configuration in TEST mode",
  () => {
    assert.deepEqual(
      validateMercadoPagoProductionCutover(
        testEnvironment({ PAYMENTS_SUBSCRIPTIONS_ENABLED: "FALSE" }),
      ),
      {
        mode: "test",
        productionAuthorized: false,
        productionCredentialsConfirmed: false,
        subscriptionsEnabled: false,
      },
    );

    assert.throws(
      () =>
        validateMercadoPagoProductionCutover(
          testEnvironment({ PAYMENTS_SUBSCRIPTIONS_ENABLED: "yes" }),
        ),
      /PAYMENTS_SUBSCRIPTIONS_ENABLED_INVALID/u,
    );
  },
);

test(
  "requires complete dedicated subscription binding in TEST mode when enabled",
  () => {
    assert.throws(
      () =>
        validateMercadoPagoProductionCutover(
          testEnvironment({ PAYMENTS_SUBSCRIPTIONS_ENABLED: "true" }),
        ),
      /MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN_REQUIRED/u,
    );

    assert.deepEqual(
      validateMercadoPagoProductionCutover(
        testEnvironment({
          PAYMENTS_SUBSCRIPTIONS_ENABLED: "true",
          MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN:
            "fixture-test-subscriptions-server-credential-1234567890",
          MERCADO_PAGO_SUBSCRIPTIONS_PUBLIC_KEY:
            "fixture-test-subscriptions-public-credential-1234567890",
          PAYMENTS_SUBSCRIPTION_BACK_URL:
            "https://morro-digital-v2-staging.onrender.com/",
        }),
      ),
      {
        mode: "test",
        productionAuthorized: false,
        productionCredentialsConfirmed: false,
        subscriptionsEnabled: true,
      },
    );
  },
);

test(
  "fails closed when production mode lacks explicit financial authorization",
  () => {
    assert.throws(
      () =>
        validateMercadoPagoProductionCutover(
          productionEnvironment({
            MERCADO_PAGO_PRODUCTION_AUTHORIZATION_ID: "",
          }),
        ),
      /MERCADO_PAGO_PRODUCTION_AUTHORIZATION_ID_REQUIRED/u,
    );
  },
);

test("requires NODE_ENV=production for a production cutover", () => {
  assert.throws(
    () =>
      validateMercadoPagoProductionCutover(
        productionEnvironment({
          NODE_ENV: "staging",
        }),
      ),
    /MERCADO_PAGO_PRODUCTION_REQUIRES_NODE_ENV_PRODUCTION/u,
  );
});

test(
  "requires explicit confirmation that production credentials were selected",
  () => {
    assert.throws(
      () =>
        validateMercadoPagoProductionCutover(
          productionEnvironment({
            MERCADO_PAGO_PRODUCTION_CREDENTIALS_CONFIRMED: "false",
          }),
        ),
      /MERCADO_PAGO_PRODUCTION_CREDENTIALS_NOT_CONFIRMED/u,
    );
  },
);

test("rejects TEST credential confirmation in production mode", () => {
  assert.throws(
    () =>
      validateMercadoPagoProductionCutover(
        productionEnvironment({
          MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED: "true",
        }),
      ),
    /MERCADO_PAGO_PRODUCTION_REJECTS_TEST_CONFIRMATION/u,
  );
});

test(
  "requires complete dedicated production subscription configuration when enabled",
  () => {
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
            "fixture-subscriptions-server-credential-value-1234567890",
          MERCADO_PAGO_SUBSCRIPTIONS_PUBLIC_KEY:
            "fixture-subscriptions-public-credential-1234567890",
          PAYMENTS_SUBSCRIPTION_BACK_URL: "https://morro.digital/assinaturas",
        }),
      ),
      {
        mode: "production",
        productionAuthorized: true,
        productionCredentialsConfirmed: true,
        authorizationId: "FINAUTH-ISSUE-33-20260917",
        subscriptionsEnabled: true,
      },
    );
  },
);

import assert from "node:assert/strict";
import test from "node:test";

import {
  createStagingPaymentsProviderAcceptanceConfiguration,
  runStagingPaymentsProviderAcceptance,
} from "./payments-provider-acceptance-runner.mjs";

const sha = "a".repeat(40);
const subscriptionId = "sub_12345678-abcd-4567-8901-123456789abc";
const paymentId = "pay_12345678-abcd-4567-8901-123456789abc";

function fixture(overrides = {}) {
  return {
    STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_AUTORUN: "true",
    RENDER_SERVICE_NAME: "morro-digital-v2-staging",
    MERCADO_PAGO_CHECKOUT_MODE: "test",
    MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED: "true",
    STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_EXPECTED_SHA: sha,
    RENDER_GIT_COMMIT: sha,
    STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_SUBSCRIPTION_ID: subscriptionId,
    STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_PAYMENT_ID: paymentId,
    STAGING_PAYMENTS_ACCEPTANCE_PASSWORD: "temporary acceptance password 2026",
    VITE_MERCADO_PAGO_PUBLIC_KEY: "TEST-public-key-value-for-contract-only",
    DASHBOARD_AUTH_ORIGIN: "https://morro-digital-v2-staging.onrender.com",
    PORT: "10000",
    ...overrides,
  };
}

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

function providerProjection(providerStatus) {
  return {
    data: {
      subscriptionId,
      providerSubscriptionReference: "preapproval_test_123",
      providerStatus,
      subscriptionStatus:
        providerStatus === "cancelled" ? "cancel_at_period_end" : "active",
      plan: {
        id: "provider_acceptance_test",
        name: "Provider Acceptance Test",
        amount: { minorUnits: 1000, currency: "BRL" },
        pricingVersion: "provider-acceptance-v1",
      },
      frequency: 1,
      frequencyType: "months",
      replayed: false,
    },
  };
}

test("is disabled unless explicitly enabled", () => {
  assert.deepEqual(createStagingPaymentsProviderAcceptanceConfiguration({}), {
    enabled: false,
  });
});

test("fails closed outside the dedicated staging service and exact SHA", () => {
  assert.throws(
    () =>
      createStagingPaymentsProviderAcceptanceConfiguration(
        fixture({ RENDER_SERVICE_NAME: "morro-digital-production" }),
      ),
    /STAGING_PROVIDER_ACCEPTANCE_SERVICE_DENIED/u,
  );
  assert.throws(
    () =>
      createStagingPaymentsProviderAcceptanceConfiguration(
        fixture({ RENDER_GIT_COMMIT: "b".repeat(40) }),
      ),
    /STAGING_PROVIDER_ACCEPTANCE_SHA_MISMATCH/u,
  );
});

test("rejects non-test provider mode and invalid resources", () => {
  assert.throws(
    () =>
      createStagingPaymentsProviderAcceptanceConfiguration(
        fixture({ MERCADO_PAGO_CHECKOUT_MODE: "production" }),
      ),
    /STAGING_PROVIDER_ACCEPTANCE_TEST_MODE_REQUIRED/u,
  );
  assert.throws(
    () =>
      createStagingPaymentsProviderAcceptanceConfiguration(
        fixture({ STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_PAYMENT_ID: "bad" }),
      ),
    /STAGING_PROVIDER_ACCEPTANCE_RESOURCE_INVALID/u,
  );
});

test("executes the full provider acceptance lifecycle without a new checkout", async () => {
  const calls = [];
  let providerReadCount = 0;
  let loginCount = 0;
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    const method = String(init.method ?? "GET").toUpperCase();
    calls.push({ method, url: url.toString(), body: init.body ?? null });

    if (url.pathname === "/readyz") {
      return jsonResponse(
        200,
        { readiness: "ready" },
        { "X-Release-SHA": sha },
      );
    }
    if (url.pathname === "/api/dashboard/auth/login") {
      loginCount += 1;
      return jsonResponse(
        200,
        {
          authenticated: true,
          csrfToken: `csrf_${loginCount}_1234567890`,
        },
        {
          "Set-Cookie": `morro_session=session_${loginCount}; Path=/; HttpOnly`,
        },
      );
    }
    if (
      url.hostname === "api.mercadopago.com" &&
      url.pathname === "/v1/card_tokens"
    ) {
      return jsonResponse(201, {
        id: "card_token_test_1234567890",
        live_mode: false,
      });
    }
    if (
      url.pathname ===
        `/api/payments/v1/subscriptions/${subscriptionId}/provider` &&
      method === "GET"
    ) {
      providerReadCount += 1;
      if (providerReadCount === 1) {
        return jsonResponse(404, { error: "SUBSCRIPTION_PROVIDER_NOT_FOUND" });
      }
      if (providerReadCount === 2) {
        return jsonResponse(200, providerProjection("paused"));
      }
      if (providerReadCount === 3) {
        return jsonResponse(200, providerProjection("authorized"));
      }
      return jsonResponse(200, providerProjection("cancelled"));
    }
    if (
      url.pathname ===
        `/api/payments/v1/subscriptions/${subscriptionId}/provider` &&
      method === "POST"
    ) {
      return jsonResponse(201, providerProjection("authorized"));
    }
    if (url.pathname.endsWith("/provider/pause")) {
      return jsonResponse(200, providerProjection("paused"));
    }
    if (url.pathname.endsWith("/provider/resume")) {
      return jsonResponse(200, providerProjection("authorized"));
    }
    if (url.pathname.endsWith("/provider/cancel")) {
      return jsonResponse(200, providerProjection("cancelled"));
    }
    if (
      url.pathname === `/api/payments/v1/payments/${paymentId}/refunds` &&
      method === "POST"
    ) {
      return jsonResponse(200, {
        data: {
          refundId: "rfd_12345678abcdef",
          paymentId,
          status: "COMPLETED",
          replayed: false,
        },
      });
    }
    if (
      url.pathname ===
        `/api/payments/v1/reconciliation/payments/${paymentId}/runs` &&
      method === "POST"
    ) {
      return jsonResponse(201, {
        data: {
          runId: "rrn_contract_123456",
          paymentId,
          findingCount: 0,
        },
      });
    }
    throw new Error(`unexpected request ${method} ${url}`);
  };

  const result = await runStagingPaymentsProviderAcceptance({
    environment: fixture(),
    fetchImpl,
  });

  assert.deepEqual(result, {
    status: "pass",
    releaseSha: sha,
    subscriptionId,
    providerStatus: "cancelled",
    paymentId,
    refundStatus: "COMPLETED",
    reconciliationFindingCount: 0,
  });
  assert.equal(loginCount, 2);
  assert.equal(
    calls.filter(
      (call) =>
        new URL(call.url).pathname === "/api/payments/v1/checkouts" &&
        call.method === "POST",
    ).length,
    0,
  );
  assert.equal(
    calls.filter((call) => new URL(call.url).pathname === "/v1/card_tokens")
      .length,
    1,
  );
});

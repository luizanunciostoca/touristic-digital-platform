#!/usr/bin/env node

import {
  createCheckoutProviderRequest,
  createMoney,
  createPaymentIdempotencyKey,
  normalizePaymentId,
} from "@touristic/financial";
import { createMercadoPagoCheckoutProviderFromEnvironment } from "@touristic/financial-server";

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function positiveInteger(name) {
  const raw = required(name);
  if (!/^\d+$/u.test(raw)) throw new Error(`${name}_INVALID`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name}_INVALID`);
  }
  return value;
}

function firstOrigin(value) {
  const raw = value.split(",")[0]?.trim() ?? "";
  const url = new URL(raw);
  if (url.protocol !== "https:")
    throw new Error("PAYMENTS_RETURN_URL_ORIGINS_INVALID");
  return url.origin;
}

const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
const paymentId = normalizePaymentId(`pay_mp_preflight_${suffix}`);
const idempotencyKey = createPaymentIdempotencyKey(
  `ord_mp_preflight_${suffix}`,
);
const amount = createMoney(
  positiveInteger("MERCADO_PAGO_E2E_AMOUNT_MINOR_UNITS"),
  "BRL",
);
if (!paymentId || !idempotencyKey || !amount) {
  throw new Error("MERCADO_PAGO_PREFLIGHT_FIXTURE_INVALID");
}

const returnOrigin = firstOrigin(required("PAYMENTS_RETURN_URL_ORIGINS"));
const request = createCheckoutProviderRequest({
  paymentId,
  idempotencyKey,
  amount,
  description: "Morro Digital V2 provider validation",
  returnUrl: `${returnOrigin}/checkout/return`,
  webhookUrl: required("PAYMENTS_WEBHOOK_URL"),
  customer: {
    name: "Morro Digital V2 Test",
    email: required("MERCADO_PAGO_E2E_PAYER_EMAIL"),
    phone: null,
    document: null,
  },
  metadata: {
    purpose: "provider_e2e",
    paymentId,
  },
});
if (!request) throw new Error("MERCADO_PAGO_PREFLIGHT_REQUEST_INVALID");

const environment = {
  NODE_ENV: process.env.NODE_ENV,
  PAYMENTS_PROVIDER_MODE: required("PAYMENTS_PROVIDER_MODE"),
  PAYMENTS_PROVIDER_TIMEOUT_MS: process.env.PAYMENTS_PROVIDER_TIMEOUT_MS,
  PAYMENTS_PROVIDER_MAX_ATTEMPTS: process.env.PAYMENTS_PROVIDER_MAX_ATTEMPTS,
  PAYMENTS_PROVIDER_RETRY_BASE_MS: process.env.PAYMENTS_PROVIDER_RETRY_BASE_MS,
  MERCADO_PAGO_ACCESS_TOKEN: required("MERCADO_PAGO_ACCESS_TOKEN"),
  MERCADO_PAGO_WEBHOOK_SECRET: required("MERCADO_PAGO_WEBHOOK_SECRET"),
  MERCADO_PAGO_CHECKOUT_ORIGINS: required("MERCADO_PAGO_CHECKOUT_ORIGINS"),
  MERCADO_PAGO_CHECKOUT_MODE: required("MERCADO_PAGO_CHECKOUT_MODE"),
};

if (environment.PAYMENTS_PROVIDER_MODE !== "mercado_pago") {
  throw new Error("PAYMENTS_PROVIDER_MODE_MUST_BE_MERCADO_PAGO");
}
if (environment.MERCADO_PAGO_CHECKOUT_MODE !== "test") {
  throw new Error("MERCADO_PAGO_PREFLIGHT_REQUIRES_TEST_MODE");
}

const provider = createMercadoPagoCheckoutProviderFromEnvironment(environment);
const session = await provider.createCheckout(request);

const checkoutUrl = new URL(session.checkoutUrl);
process.stdout.write(
  `${JSON.stringify({
    contract: "MERCADO-PAGO-PROVIDER-PREFLIGHT",
    contractVersion: 1,
    status: "pass",
    paymentId,
    providerCheckoutId: session.providerCheckoutId,
    checkoutOrigin: checkoutUrl.origin,
    checkoutUrl: session.checkoutUrl,
    next: "Open the checkout URL with an approved Mercado Pago test user, then validate webhook/readback in the deployed V2 runtime.",
  })}\n`,
);

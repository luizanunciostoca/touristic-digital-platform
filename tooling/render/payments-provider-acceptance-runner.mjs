import { setTimeout as delay } from "node:timers/promises";

const serviceName = "morro-digital-v2-staging";
const businessId = "biz_payments_acceptance";
const adminEmail = "payments-acceptance-admin@morro.invalid";
const testSellerIdentityEndpoint = new URL(
  "https://api.mercadolibre.com/users/me",
);
// Public Mercado Pago TEST fixture only. Never replace this with real card data.
const testCard = Object.freeze({
  site_id: "MLB",
  card_number: "5480832801033311",
  expiration_month: 11,
  expiration_year: 2030,
  security_code: "123",
  cardholder: Object.freeze({
    name: "APRO",
    identification: Object.freeze({ type: "CPF", number: "12345678909" }),
  }),
});
const maxResponseBytes = 64 * 1024;
const readinessAttempts = 40;
const lifecyclePollAttempts = 4;
const readinessDelayMs = 1_500;
const lifecycleDelayMs = 12_000;

function text(value, maxLength = 512) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength
    ? normalized
    : "";
}

function required(environment, name, maxLength = 2_048) {
  const value = text(environment[name], maxLength);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function enabled(environment) {
  return (
    text(
      environment.STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_AUTORUN,
      16,
    ).toLowerCase() === "true"
  );
}

function normalizeId(value, prefix) {
  const normalized = text(value, 160);
  return normalized.startsWith(prefix) && /^[A-Za-z0-9_-]+$/u.test(normalized)
    ? normalized
    : "";
}

function normalizeTestPayerEmail(value) {
  const normalized = text(value, 200).toLowerCase();
  if (!normalized) return "";
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@testuser\.com$/u.test(normalized)
    ? normalized
    : "";
}

function numericProviderIdentifier(value) {
  const normalized =
    typeof value === "number" && Number.isSafeInteger(value) && value > 0
      ? String(value)
      : text(value, 32);
  return /^[1-9][0-9]{5,19}$/u.test(normalized) ? normalized : "";
}

function safeOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) {
      return "";
    }
    return url.origin;
  } catch {
    return "";
  }
}

export function createStagingPaymentsProviderAcceptanceConfiguration(
  environment = process.env,
) {
  if (!enabled(environment)) return Object.freeze({ enabled: false });
  if (required(environment, "RENDER_SERVICE_NAME", 160) !== serviceName) {
    throw new Error("STAGING_PROVIDER_ACCEPTANCE_SERVICE_DENIED");
  }
  if (
    text(environment.MERCADO_PAGO_CHECKOUT_MODE, 20).toLowerCase() !== "test" ||
    text(
      environment.MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED,
      16,
    ).toLowerCase() !== "true"
  ) {
    throw new Error("STAGING_PROVIDER_ACCEPTANCE_TEST_MODE_REQUIRED");
  }

  const expectedSha = required(
    environment,
    "STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_EXPECTED_SHA",
    64,
  );
  const actualSha =
    text(environment.MORRO_RELEASE_SHA, 64) ||
    text(environment.RENDER_GIT_COMMIT, 64) ||
    text(environment.GITHUB_SHA, 64);
  if (!/^[a-f0-9]{40}$/u.test(expectedSha) || actualSha !== expectedSha) {
    throw new Error("STAGING_PROVIDER_ACCEPTANCE_SHA_MISMATCH");
  }

  const subscriptionId = normalizeId(
    environment.STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_SUBSCRIPTION_ID,
    "sub_",
  );
  const paymentId = normalizeId(
    environment.STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_PAYMENT_ID,
    "pay_",
  );
  if (!subscriptionId || !paymentId) {
    throw new Error("STAGING_PROVIDER_ACCEPTANCE_RESOURCE_INVALID");
  }

  const password = required(
    environment,
    "STAGING_PAYMENTS_ACCEPTANCE_PASSWORD",
    200,
  );
  if (password.length < 20) {
    throw new Error("STAGING_PROVIDER_ACCEPTANCE_PASSWORD_INVALID");
  }

  const payerEmail = normalizeTestPayerEmail(
    environment.STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_PAYER_EMAIL,
  );
  if (!payerEmail) {
    throw new Error("STAGING_PROVIDER_ACCEPTANCE_PAYER_EMAIL_INVALID");
  }

  const publicKey = required(
    environment,
    "MERCADO_PAGO_SUBSCRIPTIONS_PUBLIC_KEY",
    512,
  );
  if (publicKey.length < 20) {
    throw new Error("STAGING_PROVIDER_ACCEPTANCE_PUBLIC_KEY_INVALID");
  }

  const sellerAccessToken = required(
    environment,
    "MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN",
    2_048,
  );
  const sellerUserId = numericProviderIdentifier(
    environment.MERCADO_PAGO_SUBSCRIPTIONS_TEST_SELLER_USER_ID,
  );
  const sellerApplicationId = numericProviderIdentifier(
    environment.MERCADO_PAGO_SUBSCRIPTIONS_TEST_SELLER_APPLICATION_ID,
  );
  const credentialOrigin = text(
    environment.MERCADO_PAGO_SUBSCRIPTIONS_CREDENTIAL_ORIGIN,
    64,
  ).toLowerCase();
  if (
    !sellerAccessToken.startsWith("APP_USR-") ||
    !sellerUserId ||
    !sellerApplicationId ||
    credentialOrigin !== "test_seller_account"
  ) {
    throw new Error(
      "STAGING_PROVIDER_ACCEPTANCE_TEST_SELLER_PROVENANCE_INVALID",
    );
  }

  const origin = safeOrigin(
    required(environment, "DASHBOARD_AUTH_ORIGIN", 2_048),
  );
  if (!origin) throw new Error("STAGING_PROVIDER_ACCEPTANCE_ORIGIN_INVALID");

  const port = Number(environment.PORT || "10000");
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("STAGING_PROVIDER_ACCEPTANCE_PORT_INVALID");
  }

  return Object.freeze({
    enabled: true,
    expectedSha,
    subscriptionId,
    paymentId,
    password,
    payerEmail,
    publicKey,
    sellerAccessToken,
    sellerUserId,
    sellerApplicationId,
    origin,
    baseUrl: `http://127.0.0.1:${port}`,
  });
}

async function boundedJson(response) {
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > maxResponseBytes) {
    throw new Error("STAGING_PROVIDER_ACCEPTANCE_RESPONSE_TOO_LARGE");
  }
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid");
    }
    return parsed;
  } catch {
    throw new Error("STAGING_PROVIDER_ACCEPTANCE_INVALID_JSON");
  }
}

function cookieFrom(response) {
  const setCookie = response.headers.get("set-cookie") || "";
  const first = setCookie.split(";", 1)[0]?.trim() ?? "";
  if (!first.includes("=")) {
    throw new Error("STAGING_PROVIDER_ACCEPTANCE_SESSION_COOKIE_MISSING");
  }
  return first;
}

function correlation(step, expectedSha) {
  return `acceptance_${step}_${expectedSha.slice(0, 12)}`;
}

function log(step, status, detail = {}) {
  process.stdout.write(
    `${JSON.stringify({
      contract: "PAYMENTS-PROVIDER-ACCEPTANCE",
      contractVersion: 1,
      step,
      status,
      ...detail,
    })}\n`,
  );
}

async function request(fetchImpl, config, session, path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  headers.set("Accept", "application/json");
  headers.set("Origin", config.origin);
  headers.set("Referer", `${config.origin}/`);
  if (session?.cookie) headers.set("Cookie", session.cookie);
  if (options.business !== false) headers.set("X-Business-ID", businessId);
  if (options.correlationId) {
    headers.set("X-Correlation-ID", options.correlationId);
  }
  if (options.mutation) {
    headers.set("Content-Type", "application/json");
    headers.set("X-CSRF-Token", session?.csrfToken ?? "");
  }
  const response = await fetchImpl(new URL(path, config.baseUrl), {
    method: options.method ?? "GET",
    headers,
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
  const payload = await boundedJson(response);
  return Object.freeze({ response, payload });
}

async function waitForReadiness(fetchImpl, config) {
  for (let attempt = 1; attempt <= readinessAttempts; attempt += 1) {
    try {
      const response = await fetchImpl(new URL("/readyz", config.baseUrl), {
        headers: { Accept: "application/json" },
      });
      const releaseSha = response.headers.get("x-release-sha") ?? "";
      if (response.ok && releaseSha === config.expectedSha) {
        log("readiness", "pass", { releaseSha });
        return;
      }
    } catch {
      // Startup polling is bounded and intentionally silent between attempts.
    }
    await delay(readinessDelayMs);
  }
  throw new Error("STAGING_PROVIDER_ACCEPTANCE_READINESS_TIMEOUT");
}

async function verifyTestSellerCredential(fetchImpl, config) {
  const response = await fetchImpl(testSellerIdentityEndpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${config.sellerAccessToken}`,
    },
  });
  const payload = await boundedJson(response);
  const userId = numericProviderIdentifier(payload.id);
  const tags = Array.isArray(payload.tags)
    ? payload.tags.map((tag) => text(tag, 80).toLowerCase()).filter(Boolean)
    : [];
  const siteId = text(payload.site_id, 16).toUpperCase();
  if (
    !response.ok ||
    userId !== config.sellerUserId ||
    !tags.includes("test_user") ||
    siteId !== testCard.site_id
  ) {
    throw new Error(
      `STAGING_PROVIDER_ACCEPTANCE_TEST_SELLER_IDENTITY_HTTP_${response.status}`,
    );
  }
  log("seller_identity", "pass", {
    sellerUserId: config.sellerUserId,
    sellerApplicationId: config.sellerApplicationId,
    testUser: true,
    siteId,
  });
}

async function login(fetchImpl, config, email) {
  const response = await fetchImpl(
    new URL("/api/dashboard/auth/login", config.baseUrl),
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: config.origin,
        Referer: `${config.origin}/`,
      },
      body: JSON.stringify({ email, password: config.password }),
    },
  );
  const payload = await boundedJson(response);
  if (!response.ok || payload.authenticated !== true) {
    throw new Error("STAGING_PROVIDER_ACCEPTANCE_LOGIN_FAILED");
  }
  const csrfToken = text(payload.csrfToken, 512);
  if (!csrfToken) throw new Error("STAGING_PROVIDER_ACCEPTANCE_CSRF_MISSING");
  return Object.freeze({ cookie: cookieFrom(response), csrfToken });
}

async function tokenize(fetchImpl, config) {
  const url = new URL("https://api.mercadopago.com/v1/card_tokens");
  url.searchParams.set("public_key", config.publicKey);
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(testCard),
  });
  const payload = await boundedJson(response);
  const token = text(payload.id, 512);
  const liveMode = payload.live_mode;
  if (!response.ok || !token || typeof liveMode !== "boolean") {
    throw new Error(
      `STAGING_PROVIDER_ACCEPTANCE_TOKENIZATION_HTTP_${response.status}`,
    );
  }
  log("tokenize", "pass", {
    provider: "mercado_pago",
    environment: "test_seller",
    credentialMode: liveMode ? "production_credentials" : "test_credentials",
    liveMode,
    officialTestCard: true,
    realCard: false,
  });
  return token;
}

function providerData(payload) {
  const data = payload?.data;
  return data && typeof data === "object" && !Array.isArray(data) ? data : null;
}

async function providerRead(fetchImpl, config, owner) {
  return request(
    fetchImpl,
    config,
    owner,
    `/api/payments/v1/subscriptions/${config.subscriptionId}/provider`,
    {
      correlationId: correlation("subscription_read", config.expectedSha),
    },
  );
}

async function ensureProviderBinding(fetchImpl, config, owner) {
  const firstRead = await providerRead(fetchImpl, config, owner);
  if (firstRead.response.ok) {
    const data = providerData(firstRead.payload);
    if (!data) throw new Error("STAGING_PROVIDER_ACCEPTANCE_BINDING_INVALID");
    log("subscription_create", "pass", {
      disposition: "existing_binding",
      providerStatus: data.providerStatus,
    });
    return data;
  }
  if (
    firstRead.response.status !== 404 ||
    firstRead.payload.error !== "SUBSCRIPTION_PROVIDER_NOT_FOUND"
  ) {
    throw new Error(
      `STAGING_PROVIDER_ACCEPTANCE_INITIAL_READ_HTTP_${firstRead.response.status}`,
    );
  }

  const cardToken = await tokenize(fetchImpl, config);
  const created = await request(
    fetchImpl,
    config,
    owner,
    `/api/payments/v1/subscriptions/${config.subscriptionId}/provider`,
    {
      method: "POST",
      mutation: true,
      correlationId: correlation("subscription_create", config.expectedSha),
      body: { cardToken },
    },
  );
  if (![200, 201].includes(created.response.status)) {
    throw new Error(
      `STAGING_PROVIDER_ACCEPTANCE_CREATE_HTTP_${created.response.status}`,
    );
  }
  const data = providerData(created.payload);
  if (!data || data.providerStatus !== "authorized") {
    throw new Error("STAGING_PROVIDER_ACCEPTANCE_CREATE_STATUS_INVALID");
  }
  log("subscription_create", "pass", {
    disposition: created.response.status === 201 ? "created" : "replayed",
    providerStatus: data.providerStatus,
  });
  return data;
}

async function transition(fetchImpl, config, owner, action, expectedStatus) {
  const result = await request(
    fetchImpl,
    config,
    owner,
    `/api/payments/v1/subscriptions/${config.subscriptionId}/provider/${action}`,
    {
      method: "POST",
      mutation: true,
      correlationId: correlation(`subscription_${action}`, config.expectedSha),
      body: {},
    },
  );
  const data = providerData(result.payload);
  if (!result.response.ok || !data || data.providerStatus !== expectedStatus) {
    throw new Error(
      `STAGING_PROVIDER_ACCEPTANCE_${action.toUpperCase()}_HTTP_${result.response.status}`,
    );
  }
  const readback = await providerRead(fetchImpl, config, owner);
  const readbackData = providerData(readback.payload);
  if (
    !readback.response.ok ||
    !readbackData ||
    readbackData.providerStatus !== expectedStatus
  ) {
    throw new Error(
      `STAGING_PROVIDER_ACCEPTANCE_${action.toUpperCase()}_READBACK_INVALID`,
    );
  }
  log(`subscription_${action}`, "pass", { providerStatus: expectedStatus });
  return readbackData;
}

async function completeSubscriptionLifecycle(fetchImpl, config, owner) {
  let current = await ensureProviderBinding(fetchImpl, config, owner);
  log("subscription_provider_identity", "pass", {
    applicationId: config.sellerApplicationId,
    collectorId: config.sellerUserId,
    authority: "mercado_pago_authoritative_readback",
  });
  if (current.providerStatus === "cancelled") {
    log("subscription_lifecycle", "pass", { disposition: "already_cancelled" });
    return current;
  }
  if (current.providerStatus === "pending") {
    throw new Error("STAGING_PROVIDER_ACCEPTANCE_SUBSCRIPTION_PENDING");
  }
  if (current.subscriptionStatus === "cancel_at_period_end") {
    if (current.providerStatus !== "authorized") {
      throw new Error(
        "STAGING_PROVIDER_ACCEPTANCE_CANCEL_RECOVERY_STATE_INVALID",
      );
    }
    current = await transition(fetchImpl, config, owner, "cancel", "cancelled");
    log("subscription_lifecycle", "pass", {
      providerStatus: "cancelled",
      disposition: "recovered_cancel_at_period_end",
    });
    return current;
  }
  if (current.providerStatus === "authorized") {
    current = await transition(fetchImpl, config, owner, "pause", "paused");
  }
  if (current.providerStatus === "paused") {
    current = await transition(
      fetchImpl,
      config,
      owner,
      "resume",
      "authorized",
    );
  }
  if (current.providerStatus !== "authorized") {
    throw new Error("STAGING_PROVIDER_ACCEPTANCE_LIFECYCLE_STATE_INVALID");
  }
  current = await transition(fetchImpl, config, owner, "cancel", "cancelled");
  log("subscription_lifecycle", "pass", { providerStatus: "cancelled" });
  return current;
}

async function requestRefund(fetchImpl, config, owner) {
  const path = `/api/payments/v1/payments/${config.paymentId}/refunds`;
  for (let attempt = 1; attempt <= lifecyclePollAttempts; attempt += 1) {
    const result = await request(fetchImpl, config, owner, path, {
      method: "POST",
      mutation: true,
      correlationId: correlation("refund", config.expectedSha),
      headers: { "Idempotency-Key": `refund:v1:${config.paymentId}` },
      body: { reason: "requested_by_business" },
    });
    const data = providerData(result.payload);
    if (!result.response.ok || !data) {
      throw new Error(
        `STAGING_PROVIDER_ACCEPTANCE_REFUND_HTTP_${result.response.status}`,
      );
    }
    if (data.status === "COMPLETED") {
      log("refund", "pass", { status: "COMPLETED", replayed: data.replayed });
      return data;
    }
    if (data.status !== "AWAITING_VERIFIED_EVENT") {
      throw new Error("STAGING_PROVIDER_ACCEPTANCE_REFUND_STATUS_INVALID");
    }
    if (attempt < lifecyclePollAttempts) await delay(lifecycleDelayMs);
  }
  throw new Error("STAGING_PROVIDER_ACCEPTANCE_REFUND_TIMEOUT");
}

async function reconcile(fetchImpl, config, admin) {
  const runId = `rrn_${config.expectedSha.slice(0, 12)}_${config.paymentId
    .slice(4, 16)
    .replaceAll("-", "_")}`;
  const result = await request(
    fetchImpl,
    config,
    admin,
    `/api/payments/v1/reconciliation/payments/${config.paymentId}/runs`,
    {
      method: "POST",
      mutation: true,
      business: false,
      correlationId: correlation("reconciliation", config.expectedSha),
      headers: { "Idempotency-Key": `reconciliation:v1:${runId}` },
      body: { runId },
    },
  );
  const data = providerData(result.payload);
  if (
    !result.response.ok ||
    !data ||
    !Number.isInteger(data.findingCount) ||
    data.findingCount !== 0
  ) {
    throw new Error(
      `STAGING_PROVIDER_ACCEPTANCE_RECONCILIATION_HTTP_${result.response.status}`,
    );
  }
  log("reconciliation", "pass", { findingCount: 0 });
  return data;
}

export async function runStagingPaymentsProviderAcceptance({
  environment = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const config =
    createStagingPaymentsProviderAcceptanceConfiguration(environment);
  if (!config.enabled) return Object.freeze({ status: "disabled" });
  if (typeof fetchImpl !== "function") {
    throw new Error("STAGING_PROVIDER_ACCEPTANCE_FETCH_UNAVAILABLE");
  }

  log("start", "running", {
    releaseSha: config.expectedSha,
    subscriptionId: config.subscriptionId,
    paymentId: config.paymentId,
  });
  await waitForReadiness(fetchImpl, config);
  await verifyTestSellerCredential(fetchImpl, config);
  const owner = await login(fetchImpl, config, config.payerEmail);
  log("owner_auth", "pass");
  const subscription = await completeSubscriptionLifecycle(
    fetchImpl,
    config,
    owner,
  );
  const refund = await requestRefund(fetchImpl, config, owner);
  const admin = await login(fetchImpl, config, adminEmail);
  log("admin_auth", "pass");
  const reconciliation = await reconcile(fetchImpl, config, admin);
  const result = Object.freeze({
    status: "pass",
    releaseSha: config.expectedSha,
    subscriptionId: config.subscriptionId,
    providerStatus: subscription.providerStatus,
    providerIdentityVerified: true,
    paymentId: config.paymentId,
    refundStatus: refund.status,
    reconciliationFindingCount: reconciliation.findingCount,
  });
  log("complete", "pass", result);
  return result;
}

function isDirectInvocation() {
  const invoked = process.argv[1]
    ? new URL(`file://${process.argv[1]}`).pathname
    : "";
  return invoked.endsWith(
    "/tooling/render/payments-provider-acceptance-runner.mjs",
  );
}

if (isDirectInvocation()) {
  runStagingPaymentsProviderAcceptance()
    .then((result) => {
      if (result.status === "disabled") log("complete", "disabled");
    })
    .catch((error) => {
      log("complete", "fail", {
        reason:
          error instanceof Error
            ? error.message.slice(0, 160)
            : "UNKNOWN_ERROR",
      });
      process.exitCode = 1;
    });
}

import type { FinancialSubscriptionProviderPort } from "@touristic/financial/subscription-provider";

import { createMercadoPagoSubscriptionProviderFromEnvironment as createBaseMercadoPagoSubscriptionProviderFromEnvironment } from "./mercado-pago-subscription-provider.js";
import type {
  MercadoPagoProviderEnvironment,
  MercadoPagoProviderOptions,
} from "./mercado-pago-provider.js";

interface MercadoPagoSubscriptionsEnvironment extends MercadoPagoProviderEnvironment {
  readonly MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN?: string;
  readonly MERCADO_PAGO_SUBSCRIPTIONS_CREDENTIAL_ORIGIN?: string;
  readonly MERCADO_PAGO_SUBSCRIPTIONS_TEST_SELLER_USER_ID?: string;
  readonly MERCADO_PAGO_SUBSCRIPTIONS_TEST_SELLER_APPLICATION_ID?: string;
  readonly RENDER_SERVICE_NAME?: string;
  readonly STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_AUTORUN?: string;
  readonly STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_SCOPE_HEADER?: string;
}

export interface MercadoPagoSubscriptionProviderOptions extends MercadoPagoProviderOptions {
  readonly resolvePayerEmail?: (
    externalReference: string,
  ) => Promise<string | null> | string | null;
}

interface TestSellerProviderIdentity {
  readonly applicationId: string;
  readonly collectorId: string;
}

const maxProviderResponseBytes = 64 * 1024;
const maxRememberedPayers = 32;

function boundedString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : "";
}

function normalizedPayerEmail(value: unknown): string {
  const normalized = boundedString(value, 200).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized) ? normalized : "";
}

function dedicatedSubscriptionsAccessToken(
  environment: MercadoPagoSubscriptionsEnvironment,
): string {
  const configured = boundedString(
    environment.MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN ??
      process.env.MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN,
    2_048,
  );
  if (configured.length < 32) {
    throw new Error("MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN is required");
  }
  return configured;
}

function configuredEnvironmentValue(
  environment: MercadoPagoSubscriptionsEnvironment,
  name:
    | "MERCADO_PAGO_CHECKOUT_MODE"
    | "MERCADO_PAGO_SUBSCRIPTIONS_CREDENTIAL_ORIGIN"
    | "MERCADO_PAGO_SUBSCRIPTIONS_TEST_SELLER_USER_ID"
    | "MERCADO_PAGO_SUBSCRIPTIONS_TEST_SELLER_APPLICATION_ID"
    | "RENDER_SERVICE_NAME",
  maxLength: number,
): string {
  return boundedString(environment[name] ?? process.env[name], maxLength);
}

function numericProviderIdentifier(value: unknown): string {
  const normalized =
    typeof value === "number" && Number.isSafeInteger(value) && value > 0
      ? String(value)
      : boundedString(value, 32);
  return /^[1-9][0-9]{5,19}$/u.test(normalized) ? normalized : "";
}

function assertTestSellerAppCredentialProvenance(
  environment: MercadoPagoSubscriptionsEnvironment,
  token: string,
): TestSellerProviderIdentity | null {
  const checkoutMode = configuredEnvironmentValue(
    environment,
    "MERCADO_PAGO_CHECKOUT_MODE",
    20,
  ).toLowerCase();
  if (checkoutMode !== "test" || !token.startsWith("APP_USR-")) return null;

  const serviceName = configuredEnvironmentValue(
    environment,
    "RENDER_SERVICE_NAME",
    160,
  );
  const credentialOrigin = configuredEnvironmentValue(
    environment,
    "MERCADO_PAGO_SUBSCRIPTIONS_CREDENTIAL_ORIGIN",
    64,
  ).toLowerCase();
  const sellerUserId = numericProviderIdentifier(
    configuredEnvironmentValue(
      environment,
      "MERCADO_PAGO_SUBSCRIPTIONS_TEST_SELLER_USER_ID",
      32,
    ),
  );
  const applicationId = numericProviderIdentifier(
    configuredEnvironmentValue(
      environment,
      "MERCADO_PAGO_SUBSCRIPTIONS_TEST_SELLER_APPLICATION_ID",
      32,
    ),
  );

  if (
    serviceName !== "morro-digital-v2-staging" ||
    credentialOrigin !== "test_seller_account" ||
    !sellerUserId ||
    !applicationId
  ) {
    throw new Error(
      "MERCADO_PAGO_SUBSCRIPTIONS_TEST_SELLER_APP_PROVENANCE_REQUIRED",
    );
  }
  return Object.freeze({
    applicationId,
    collectorId: sellerUserId,
  });
}

function subscriptionTestScopeHeaderMode(
  environment: MercadoPagoSubscriptionsEnvironment,
): "stage" | "omit" {
  const configured = boundedString(
    environment.STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_SCOPE_HEADER ??
      process.env.STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_SCOPE_HEADER,
    16,
  ).toLowerCase();
  if (!configured || configured === "stage") return "stage";
  if (configured !== "omit") {
    throw new Error(
      "STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_SCOPE_HEADER is invalid",
    );
  }

  const checkoutMode = boundedString(
    environment.MERCADO_PAGO_CHECKOUT_MODE ??
      process.env.MERCADO_PAGO_CHECKOUT_MODE,
    20,
  ).toLowerCase();
  const serviceName = boundedString(
    environment.RENDER_SERVICE_NAME ?? process.env.RENDER_SERVICE_NAME,
    160,
  );
  const acceptanceAutorun = boundedString(
    environment.STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_AUTORUN ??
      process.env.STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_AUTORUN,
    16,
  ).toLowerCase();
  if (
    checkoutMode !== "test" ||
    serviceName !== "morro-digital-v2-staging" ||
    acceptanceAutorun !== "true"
  ) {
    throw new Error(
      "STAGING_PAYMENTS_PROVIDER_ACCEPTANCE_SCOPE_HEADER_OMIT_DENIED",
    );
  }
  return "omit";
}

function requestUrl(input: RequestInfo | URL): URL | null {
  try {
    if (input instanceof URL) return input;
    if (typeof input === "string") return new URL(input);
    return new URL(input.url);
  } catch {
    return null;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function strictDecimalAmount(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/u.test(normalized)) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function requestPayerEmail(
  url: URL | null,
  init: RequestInit | undefined,
): string {
  if (
    !url ||
    url.hostname !== "api.mercadopago.com" ||
    url.pathname !== "/preapproval" ||
    String(init?.method ?? "GET").toUpperCase() !== "POST" ||
    typeof init?.body !== "string"
  ) {
    return "";
  }
  try {
    return normalizedPayerEmail(record(JSON.parse(init.body))?.payer_email);
  } catch {
    return "";
  }
}

async function responsePayload(
  response: Response,
): Promise<Record<string, unknown> | null> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > maxProviderResponseBytes
  ) {
    return null;
  }
  try {
    const body = await response.clone().text();
    if (Buffer.byteLength(body, "utf8") > maxProviderResponseBytes) return null;
    return record(JSON.parse(body));
  } catch {
    return null;
  }
}

function rememberPayerEmail(
  payerEmailByReference: Map<string, string>,
  reference: string,
  payerEmail: string,
): void {
  if (!reference || !payerEmail) return;
  payerEmailByReference.delete(reference);
  payerEmailByReference.set(reference, payerEmail);
  while (payerEmailByReference.size > maxRememberedPayers) {
    const oldest = payerEmailByReference.keys().next().value;
    if (!oldest) break;
    payerEmailByReference.delete(oldest);
  }
}

function isPreapprovalResponse(url: URL | null): boolean {
  return Boolean(
    url &&
    url.hostname === "api.mercadopago.com" &&
    (url.pathname === "/preapproval" ||
      url.pathname.startsWith("/preapproval/")),
  );
}

function authoritativeProviderIdentityMatches(
  payload: Record<string, unknown>,
  url: URL | null,
  init: RequestInit | undefined,
  expectedIdentity: TestSellerProviderIdentity | null,
): boolean {
  if (
    !expectedIdentity ||
    !url ||
    url.hostname !== "api.mercadopago.com" ||
    !url.pathname.startsWith("/preapproval/") ||
    String(init?.method ?? "GET").toUpperCase() !== "GET"
  ) {
    return true;
  }
  return (
    numericProviderIdentifier(payload.application_id) ===
      expectedIdentity.applicationId &&
    numericProviderIdentifier(payload.collector_id) ===
      expectedIdentity.collectorId
  );
}

async function normalizeSuccessfulPreapprovalResponse(
  response: Response,
  url: URL | null,
  init: RequestInit | undefined,
  options: MercadoPagoSubscriptionProviderOptions,
  expectedProviderIdentity: TestSellerProviderIdentity | null,
  payerEmailByReference: Map<string, string>,
): Promise<Response> {
  if (!response.ok || !isPreapprovalResponse(url)) return response;
  const payload = await responsePayload(response);
  if (!payload) return response;
  if (
    !authoritativeProviderIdentityMatches(
      payload,
      url,
      init,
      expectedProviderIdentity,
    )
  ) {
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.delete("content-encoding");
    return new Response("{}", {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const normalizedPayload: Record<string, unknown> = { ...payload };
  let changed = false;
  const recurring = record(payload.auto_recurring);
  if (recurring && typeof recurring.transaction_amount === "string") {
    const normalizedAmount = strictDecimalAmount(recurring.transaction_amount);
    if (normalizedAmount !== null) {
      normalizedPayload.auto_recurring = {
        ...recurring,
        transaction_amount: normalizedAmount,
      };
      changed = true;
    }
  }

  const reference = boundedString(payload.id, 180);
  const externalReference = boundedString(payload.external_reference, 120);
  const providerPayerEmail = normalizedPayerEmail(payload.payer_email);
  const providerPayerFieldPresent =
    payload.payer_email !== undefined &&
    payload.payer_email !== null &&
    !(typeof payload.payer_email === "string" && !payload.payer_email.trim());

  if (providerPayerEmail) {
    rememberPayerEmail(payerEmailByReference, reference, providerPayerEmail);
  } else if (!providerPayerFieldPresent) {
    let payerEmail = requestPayerEmail(url, init);
    if (!payerEmail && reference) {
      payerEmail = payerEmailByReference.get(reference) ?? "";
    }
    if (!payerEmail && externalReference && options.resolvePayerEmail) {
      payerEmail = normalizedPayerEmail(
        await options.resolvePayerEmail(externalReference),
      );
    }
    if (payerEmail) {
      normalizedPayload.payer_email = payerEmail;
      rememberPayerEmail(payerEmailByReference, reference, payerEmail);
      changed = true;
    }
  }

  if (!changed) return response;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return new Response(JSON.stringify(normalizedPayload), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function subscriptionProviderOptions(
  environment: MercadoPagoSubscriptionsEnvironment,
  options: MercadoPagoSubscriptionProviderOptions,
  expectedProviderIdentity: TestSellerProviderIdentity | null,
): MercadoPagoSubscriptionProviderOptions {
  const scopeMode = subscriptionTestScopeHeaderMode(environment);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("MERCADO_PAGO_FETCH_UNAVAILABLE");
  }
  const payerEmailByReference = new Map<string, string>();
  const fetchForSubscriptions: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    if (scopeMode === "omit") headers.delete("X-scope");
    const requestInit = { ...init, headers };
    const response = await fetchImpl(input, requestInit);
    return normalizeSuccessfulPreapprovalResponse(
      response,
      requestUrl(input),
      requestInit,
      options,
      expectedProviderIdentity,
      payerEmailByReference,
    );
  };
  return Object.freeze({ ...options, fetch: fetchForSubscriptions });
}

export function createMercadoPagoSubscriptionProviderFromEnvironment(
  environment: MercadoPagoSubscriptionsEnvironment,
  options: MercadoPagoSubscriptionProviderOptions = {},
): FinancialSubscriptionProviderPort {
  const token = dedicatedSubscriptionsAccessToken(environment);
  const expectedProviderIdentity = assertTestSellerAppCredentialProvenance(
    environment,
    token,
  );
  return createBaseMercadoPagoSubscriptionProviderFromEnvironment(
    Object.freeze({
      ...environment,
      MERCADO_PAGO_ACCESS_TOKEN: token,
      BUSINESS_PAYMENT_API_TOKEN: "",
    }),
    subscriptionProviderOptions(environment, options, expectedProviderIdentity),
  );
}

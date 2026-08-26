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

function boundedString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : "";
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

function numericProviderIdentifier(value: string): string {
  return /^[1-9][0-9]{5,19}$/u.test(value) ? value : "";
}

function assertTestSellerAppCredentialProvenance(
  environment: MercadoPagoSubscriptionsEnvironment,
  token: string,
): void {
  const checkoutMode = configuredEnvironmentValue(
    environment,
    "MERCADO_PAGO_CHECKOUT_MODE",
    20,
  ).toLowerCase();
  if (checkoutMode !== "test" || !token.startsWith("APP_USR-")) return;

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

function subscriptionProviderOptions(
  environment: MercadoPagoSubscriptionsEnvironment,
  options: MercadoPagoProviderOptions,
): MercadoPagoProviderOptions {
  if (subscriptionTestScopeHeaderMode(environment) === "stage") {
    return options;
  }
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("MERCADO_PAGO_FETCH_UNAVAILABLE");
  }
  const fetchWithoutStageScope: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.delete("X-scope");
    return fetchImpl(input, { ...init, headers });
  };
  return Object.freeze({ ...options, fetch: fetchWithoutStageScope });
}

export function createMercadoPagoSubscriptionProviderFromEnvironment(
  environment: MercadoPagoSubscriptionsEnvironment,
  options: MercadoPagoProviderOptions = {},
): FinancialSubscriptionProviderPort {
  const token = dedicatedSubscriptionsAccessToken(environment);
  assertTestSellerAppCredentialProvenance(environment, token);
  return createBaseMercadoPagoSubscriptionProviderFromEnvironment(
    Object.freeze({
      ...environment,
      MERCADO_PAGO_ACCESS_TOKEN: token,
      BUSINESS_PAYMENT_API_TOKEN: "",
    }),
    subscriptionProviderOptions(environment, options),
  );
}

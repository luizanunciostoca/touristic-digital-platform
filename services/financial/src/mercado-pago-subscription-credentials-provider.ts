import type { FinancialSubscriptionProviderPort } from "@touristic/financial/subscription-provider";

import { createMercadoPagoSubscriptionProviderFromEnvironment as createBaseMercadoPagoSubscriptionProviderFromEnvironment } from "./mercado-pago-subscription-provider.js";
import type {
  MercadoPagoProviderEnvironment,
  MercadoPagoProviderOptions,
} from "./mercado-pago-provider.js";

interface MercadoPagoSubscriptionsEnvironment extends MercadoPagoProviderEnvironment {
  readonly MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN?: string;
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
  return createBaseMercadoPagoSubscriptionProviderFromEnvironment(
    Object.freeze({
      ...environment,
      MERCADO_PAGO_ACCESS_TOKEN: token,
      BUSINESS_PAYMENT_API_TOKEN: "",
    }),
    subscriptionProviderOptions(environment, options),
  );
}

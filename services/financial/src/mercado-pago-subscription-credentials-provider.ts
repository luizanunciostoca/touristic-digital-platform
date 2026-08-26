import type { FinancialSubscriptionProviderPort } from "@touristic/financial/subscription-provider";

import {
  createMercadoPagoSubscriptionProviderFromEnvironment as createBaseMercadoPagoSubscriptionProviderFromEnvironment,
} from "./mercado-pago-subscription-provider.js";
import type {
  MercadoPagoProviderEnvironment,
  MercadoPagoProviderOptions,
} from "./mercado-pago-provider.js";

interface MercadoPagoSubscriptionsEnvironment extends MercadoPagoProviderEnvironment {
  readonly MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN?: string;
  readonly RENDER_SERVICE_NAME?: string;
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
    options,
  );
}

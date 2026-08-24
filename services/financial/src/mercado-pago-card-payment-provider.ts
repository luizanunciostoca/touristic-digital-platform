import {
  createCardPaymentProviderRequest,
  normalizeCardPaymentProviderReceipt,
  type CardPaymentProviderReceipt,
  type CardPaymentProviderRequest,
  type CardPaymentProviderStatus,
  type FinancialCardPaymentProviderPort,
} from "@touristic/financial/card-payment";

import {
  MercadoPagoProviderError,
  type MercadoPagoProviderEnvironment,
  type MercadoPagoProviderOptions,
} from "./mercado-pago-provider.js";
import {
  ProviderRequestUnavailableError,
  createProviderRetryPolicyFromEnvironment,
  executeBoundedProviderRequest,
} from "./provider-retry.js";

const mercadoPagoPaymentsEndpoint = new URL(
  "v1/payments",
  "https://api.mercadopago.com/",
);
const maxResponseBytes = 64 * 1024;

function boundedString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : "";
}

function accessToken(environment: MercadoPagoProviderEnvironment): string {
  const token = boundedString(
    environment.MERCADO_PAGO_ACCESS_TOKEN ??
      environment.BUSINESS_PAYMENT_API_TOKEN,
    2_048,
  );
  if (token.length < 32) {
    throw new Error("MERCADO_PAGO_ACCESS_TOKEN is required");
  }
  return token;
}

function timeoutMs(value: unknown): number {
  const raw = boundedString(value, 10);
  if (!raw) return 8_000;
  if (!/^[0-9]+$/u.test(raw)) {
    throw new Error("PAYMENTS_PROVIDER_TIMEOUT_MS is invalid");
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 500 || parsed > 15_000) {
    throw new Error("PAYMENTS_PROVIDER_TIMEOUT_MS is invalid");
  }
  return parsed;
}

function checkoutMode(value: unknown): "production" | "test" {
  const normalized = boundedString(value, 20).toLowerCase();
  if (!normalized || normalized === "production") return "production";
  if (normalized === "test") return "test";
  throw new Error("MERCADO_PAGO_CHECKOUT_MODE is invalid");
}

function requireTestCredentialsConfirmation(
  environment: MercadoPagoProviderEnvironment,
): void {
  const confirmed = boundedString(
    environment.MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED,
    16,
  ).toLowerCase();
  if (confirmed !== "true") {
    throw new MercadoPagoProviderError("MERCADO_PAGO_TEST_ACCOUNT_REQUIRED");
  }
}

function providerStatus(value: unknown): CardPaymentProviderStatus | null {
  switch (boundedString(value, 40).toLowerCase()) {
    case "approved":
      return "paid";
    case "rejected":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "refunded":
    case "charged_back":
      return "refunded";
    case "pending":
    case "in_process":
    case "authorized":
      return "pending";
    default:
      return null;
  }
}

async function boundedJson(
  response: Response,
): Promise<Record<string, unknown>> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
    throw new MercadoPagoProviderError("MERCADO_PAGO_INVALID_RESPONSE");
  }
  if (!response.body) {
    throw new MercadoPagoProviderError("MERCADO_PAGO_INVALID_RESPONSE");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      receivedBytes += chunk.value.byteLength;
      if (receivedBytes > maxResponseBytes) {
        await reader.cancel();
        throw new MercadoPagoProviderError("MERCADO_PAGO_INVALID_RESPONSE");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  try {
    const payload = JSON.parse(text) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("invalid");
    }
    return payload as Record<string, unknown>;
  } catch {
    throw new MercadoPagoProviderError("MERCADO_PAGO_INVALID_RESPONSE");
  }
}

function majorUnits(minorUnits: number): number {
  const value = minorUnits / 100;
  if (!Number.isFinite(value) || value <= 0) {
    throw new MercadoPagoProviderError("MERCADO_PAGO_INVALID_REQUEST");
  }
  return value;
}

function unavailable(error: unknown): never {
  if (error instanceof MercadoPagoProviderError) throw error;
  if (error instanceof ProviderRequestUnavailableError) {
    throw new MercadoPagoProviderError("MERCADO_PAGO_UNAVAILABLE");
  }
  throw new MercadoPagoProviderError("MERCADO_PAGO_UNAVAILABLE");
}

export function createMercadoPagoCardPaymentProviderFromEnvironment(
  environment: MercadoPagoProviderEnvironment,
  options: MercadoPagoProviderOptions = {},
): FinancialCardPaymentProviderPort {
  if (environment.PAYMENTS_PROVIDER_MODE !== "mercado_pago") {
    throw new Error("PAYMENTS_PROVIDER_MODE=mercado_pago is required");
  }

  const token = accessToken(environment);
  const mode = checkoutMode(environment.MERCADO_PAGO_CHECKOUT_MODE);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("MERCADO_PAGO_FETCH_UNAVAILABLE");
  }
  const timeout = timeoutMs(environment.PAYMENTS_PROVIDER_TIMEOUT_MS);
  const retryPolicy = createProviderRetryPolicyFromEnvironment(environment);

  return Object.freeze({
    async createCardPayment(
      input: CardPaymentProviderRequest,
    ): Promise<CardPaymentProviderReceipt> {
      const request = createCardPaymentProviderRequest(input);
      if (!request || request.amount.currency !== "BRL") {
        throw new MercadoPagoProviderError("MERCADO_PAGO_INVALID_REQUEST");
      }

      try {
        if (mode === "test") requireTestCredentialsConfirmation(environment);

        const response = await executeBoundedProviderRequest({
          fetch: fetchImpl,
          url: mercadoPagoPaymentsEndpoint,
          timeoutMs: timeout,
          policy: retryPolicy,
          init: {
            method: "POST",
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              "Idempotency-Key": request.idempotencyKey,
              "X-Idempotency-Key": request.idempotencyKey,
            },
            body: JSON.stringify({
              transaction_amount: majorUnits(request.amount.minorUnits),
              token: request.token,
              description: request.description,
              installments: request.installments,
              payment_method_id: request.paymentMethodId,
              ...(request.issuerId ? { issuer_id: request.issuerId } : {}),
              payer: { email: request.customer.email },
              external_reference: request.paymentId,
              notification_url: request.webhookUrl,
              metadata: request.metadata,
            }),
          },
        });

        if (!response.ok) {
          throw new MercadoPagoProviderError(
            response.status >= 400 && response.status < 500
              ? "MERCADO_PAGO_REJECTED"
              : "MERCADO_PAGO_UNAVAILABLE",
          );
        }

        const payload = await boundedJson(response);
        const status = providerStatus(payload.status);
        const receipt = normalizeCardPaymentProviderReceipt({
          providerPaymentReference:
            typeof payload.id === "number" ? String(payload.id) : payload.id,
          status,
        });
        if (!receipt) {
          throw new MercadoPagoProviderError("MERCADO_PAGO_INVALID_RESPONSE");
        }
        return receipt;
      } catch (error) {
        return unavailable(error);
      }
    },
  });
}

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

function boundedIdentifier(value: unknown, maxLength: number): string {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : "";
  }
  return boundedString(value, maxLength);
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

function amountMatches(value: unknown, expectedMinorUnits: number): boolean {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return false;
  const minor = Math.round(parsed * 100);
  return (
    Number.isSafeInteger(minor) &&
    Math.abs(minor / 100 - parsed) < 0.000001 &&
    minor === expectedMinorUnits
  );
}

function unavailable(error: unknown): never {
  if (error instanceof MercadoPagoProviderError) throw error;
  if (error instanceof ProviderRequestUnavailableError) {
    throw new MercadoPagoProviderError("MERCADO_PAGO_UNAVAILABLE");
  }
  throw new MercadoPagoProviderError("MERCADO_PAGO_UNAVAILABLE");
}

function paymentUrl(providerPaymentReference: string): URL {
  const reference = boundedIdentifier(providerPaymentReference, 160);
  if (!reference || !/^[A-Za-z0-9._:-]+$/u.test(reference)) {
    throw new MercadoPagoProviderError("MERCADO_PAGO_INVALID_RESPONSE");
  }
  return new URL(
    `v1/payments/${encodeURIComponent(reference)}`,
    "https://api.mercadopago.com/",
  );
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

  async function requestJson(
    url: URL,
    init: RequestInit,
  ): Promise<Record<string, unknown>> {
    try {
      if (mode === "test") requireTestCredentialsConfirmation(environment);
      const headers = new Headers(init.headers);
      headers.set("Accept", "application/json");
      headers.set("Authorization", `Bearer ${token}`);
      if (init.body) headers.set("Content-Type", "application/json");
      const response = await executeBoundedProviderRequest({
        fetch: fetchImpl,
        url,
        timeoutMs: timeout,
        policy: retryPolicy,
        init: { ...init, headers },
      });
      if (!response.ok) {
        throw new MercadoPagoProviderError(
          response.status >= 400 && response.status < 500
            ? "MERCADO_PAGO_REJECTED"
            : "MERCADO_PAGO_UNAVAILABLE",
        );
      }
      return await boundedJson(response);
    } catch (error) {
      return unavailable(error);
    }
  }

  return Object.freeze({
    async createCardPayment(
      input: CardPaymentProviderRequest,
    ): Promise<CardPaymentProviderReceipt> {
      const request = createCardPaymentProviderRequest(input);
      if (!request || request.amount.currency !== "BRL") {
        throw new MercadoPagoProviderError("MERCADO_PAGO_INVALID_REQUEST");
      }

      const created = await requestJson(mercadoPagoPaymentsEndpoint, {
        method: "POST",
        headers: {
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
      });

      const providerPaymentReference = boundedIdentifier(created.id, 160);
      if (!providerPaymentReference) {
        throw new MercadoPagoProviderError("MERCADO_PAGO_INVALID_RESPONSE");
      }
      const readback = await requestJson(paymentUrl(providerPaymentReference), {
        method: "GET",
      });
      const readbackReference = boundedIdentifier(readback.id, 160);
      const status = providerStatus(readback.status);
      const externalReference = boundedString(readback.external_reference, 120);
      const currency = boundedString(readback.currency_id, 3).toUpperCase();
      if (
        readbackReference !== providerPaymentReference ||
        externalReference !== request.paymentId ||
        currency !== request.amount.currency ||
        !amountMatches(
          readback.transaction_amount,
          request.amount.minorUnits,
        ) ||
        !status
      ) {
        throw new MercadoPagoProviderError("MERCADO_PAGO_INVALID_RESPONSE");
      }

      const receipt = normalizeCardPaymentProviderReceipt({
        providerPaymentReference,
        status,
      });
      if (!receipt) {
        throw new MercadoPagoProviderError("MERCADO_PAGO_INVALID_RESPONSE");
      }
      return receipt;
    },
  });
}

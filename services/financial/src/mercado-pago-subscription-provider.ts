import {
  normalizeProviderSubscriptionRequest,
  normalizeProviderSubscriptionSnapshot,
  type FinancialSubscriptionProviderPort,
  type ProviderSubscriptionRequest,
  type ProviderSubscriptionSnapshot,
  type ProviderSubscriptionStatus,
} from "@touristic/financial/subscription-provider";
import { createMoney } from "@touristic/financial";

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

const mercadoPagoPreapprovalEndpoint = new URL(
  "preapproval",
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

function majorUnits(minorUnits: number): number {
  const value = minorUnits / 100;
  if (!Number.isFinite(value) || value <= 0) {
    throw new MercadoPagoProviderError("MERCADO_PAGO_INVALID_REQUEST");
  }
  return value;
}

function minorUnits(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  const minor = Math.round(value * 100);
  return Number.isSafeInteger(minor) && Math.abs(minor / 100 - value) < 0.000001
    ? minor
    : null;
}

function providerStatus(value: unknown): ProviderSubscriptionStatus | null {
  switch (boundedString(value, 40).toLowerCase()) {
    case "pending":
      return "pending";
    case "authorized":
      return "authorized";
    case "paused":
      return "paused";
    case "cancelled":
    case "canceled":
      return "cancelled";
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

function emitProviderDiagnostic(
  event: Readonly<{
    method: string;
    pathname: string;
    reason: string;
    httpStatus?: number;
  }>,
): void {
  try {
    process.stderr.write(
      `[payments-subscription-provider] ${JSON.stringify({
        method: boundedString(event.method, 8).toUpperCase(),
        pathname: boundedString(event.pathname, 240),
        result: "failure",
        reason: boundedString(event.reason, 80),
        ...(Number.isInteger(event.httpStatus)
          ? { httpStatus: event.httpStatus }
          : {}),
      })}\n`,
    );
  } catch {
    // Diagnostics must never become provider authority.
  }
}

function unavailable(error: unknown): never {
  if (error instanceof MercadoPagoProviderError) throw error;
  if (error instanceof ProviderRequestUnavailableError) {
    throw new MercadoPagoProviderError("MERCADO_PAGO_UNAVAILABLE");
  }
  throw new MercadoPagoProviderError("MERCADO_PAGO_UNAVAILABLE");
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function providerReference(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  return boundedString(value, 180);
}

function snapshotFromPayload(
  payload: Record<string, unknown>,
): ProviderSubscriptionSnapshot {
  const recurring = record(payload.auto_recurring);
  const amountMinor = minorUnits(recurring?.transaction_amount);
  const amount = createMoney(amountMinor, recurring?.currency_id);
  const snapshot = normalizeProviderSubscriptionSnapshot({
    providerSubscriptionReference: providerReference(payload.id),
    externalReference: payload.external_reference,
    status: providerStatus(payload.status),
    amount,
    frequency: recurring?.frequency,
    frequencyType: recurring?.frequency_type,
    payerEmail: payload.payer_email,
  });
  if (!snapshot) {
    throw new MercadoPagoProviderError("MERCADO_PAGO_INVALID_RESPONSE");
  }
  return snapshot;
}

function subscriptionUrl(reference: string): URL {
  const normalized = boundedString(reference, 180);
  if (!normalized || !/^[A-Za-z0-9._:-]+$/u.test(normalized)) {
    throw new MercadoPagoProviderError("MERCADO_PAGO_INVALID_REQUEST");
  }
  return new URL(
    `preapproval/${encodeURIComponent(normalized)}`,
    "https://api.mercadopago.com/",
  );
}

export function createMercadoPagoSubscriptionProviderFromEnvironment(
  environment: MercadoPagoProviderEnvironment,
  options: MercadoPagoProviderOptions = {},
): FinancialSubscriptionProviderPort {
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
      if (mode === "test") headers.set("X-scope", "stage");
      if (init.body) headers.set("Content-Type", "application/json");
      const response = await executeBoundedProviderRequest({
        fetch: fetchImpl,
        url,
        timeoutMs: timeout,
        policy: retryPolicy,
        init: { ...init, headers },
      });
      if (!response.ok) {
        const reason =
          response.status >= 400 && response.status < 500
            ? "MERCADO_PAGO_REJECTED"
            : "MERCADO_PAGO_UNAVAILABLE";
        emitProviderDiagnostic({
          method: init.method ?? "GET",
          pathname: url.pathname,
          reason,
          httpStatus: response.status,
        });
        throw new MercadoPagoProviderError(reason);
      }
      return await boundedJson(response);
    } catch (error) {
      if (error instanceof ProviderRequestUnavailableError) {
        emitProviderDiagnostic({
          method: init.method ?? "GET",
          pathname: url.pathname,
          reason: "PROVIDER_REQUEST_UNAVAILABLE",
          ...(error.httpStatus === null
            ? {}
            : { httpStatus: error.httpStatus }),
        });
      } else if (
        error instanceof MercadoPagoProviderError &&
        error.code === "MERCADO_PAGO_TEST_ACCOUNT_REQUIRED"
      ) {
        emitProviderDiagnostic({
          method: init.method ?? "GET",
          pathname: url.pathname,
          reason: error.code,
        });
      }
      return unavailable(error);
    }
  }

  async function authoritativeReadback(
    reference: string,
  ): Promise<ProviderSubscriptionSnapshot> {
    const url = subscriptionUrl(reference);
    try {
      const payload = await requestJson(url, {
        method: "GET",
      });
      const snapshot = snapshotFromPayload(payload);
      if (snapshot.providerSubscriptionReference !== reference) {
        throw new MercadoPagoProviderError("MERCADO_PAGO_INVALID_RESPONSE");
      }
      return snapshot;
    } catch (error) {
      if (
        error instanceof MercadoPagoProviderError &&
        error.code === "MERCADO_PAGO_INVALID_RESPONSE"
      ) {
        emitProviderDiagnostic({
          method: "GET",
          pathname: url.pathname,
          reason: "MERCADO_PAGO_INVALID_RESPONSE",
        });
      }
      throw error;
    }
  }

  async function updateStatus(
    reference: string,
    status: "paused" | "authorized" | "canceled",
  ): Promise<ProviderSubscriptionSnapshot> {
    await requestJson(subscriptionUrl(reference), {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
    const snapshot = await authoritativeReadback(reference);
    const expected = status === "canceled" ? "cancelled" : status;
    if (snapshot.status !== expected) {
      emitProviderDiagnostic({
        method: "GET",
        pathname: subscriptionUrl(reference).pathname,
        reason: "MERCADO_PAGO_STATUS_READBACK_MISMATCH",
      });
      throw new MercadoPagoProviderError("MERCADO_PAGO_INVALID_RESPONSE");
    }
    return snapshot;
  }

  return Object.freeze({
    async createSubscription(
      input: ProviderSubscriptionRequest,
    ): Promise<ProviderSubscriptionSnapshot> {
      const request = normalizeProviderSubscriptionRequest(input);
      if (!request || request.amount.currency !== "BRL") {
        throw new MercadoPagoProviderError("MERCADO_PAGO_INVALID_REQUEST");
      }

      const created = await requestJson(mercadoPagoPreapprovalEndpoint, {
        method: "POST",
        headers: {
          "Idempotency-Key": request.idempotencyKey,
          "X-Idempotency-Key": request.idempotencyKey,
        },
        body: JSON.stringify({
          reason: request.reason,
          external_reference: request.subscriptionId,
          payer_email: request.payerEmail,
          card_token_id: request.cardToken,
          auto_recurring: {
            frequency: request.frequency,
            frequency_type: request.frequencyType,
            transaction_amount: majorUnits(request.amount.minorUnits),
            currency_id: request.amount.currency,
          },
          back_url: request.backUrl,
          status: "authorized",
        }),
      });
      const reference = providerReference(created.id);
      if (!reference) {
        emitProviderDiagnostic({
          method: "POST",
          pathname: mercadoPagoPreapprovalEndpoint.pathname,
          reason: "MERCADO_PAGO_CREATE_REFERENCE_MISSING",
        });
        throw new MercadoPagoProviderError("MERCADO_PAGO_INVALID_RESPONSE");
      }
      const snapshot = await authoritativeReadback(reference);
      if (
        snapshot.externalReference !== request.subscriptionId ||
        snapshot.status !== "authorized" ||
        snapshot.amount.minorUnits !== request.amount.minorUnits ||
        snapshot.amount.currency !== request.amount.currency ||
        snapshot.frequency !== request.frequency ||
        snapshot.frequencyType !== request.frequencyType ||
        snapshot.payerEmail !== request.payerEmail
      ) {
        emitProviderDiagnostic({
          method: "GET",
          pathname: subscriptionUrl(reference).pathname,
          reason: "MERCADO_PAGO_CREATE_READBACK_MISMATCH",
        });
        throw new MercadoPagoProviderError("MERCADO_PAGO_INVALID_RESPONSE");
      }
      return snapshot;
    },

    readSubscription(reference: string): Promise<ProviderSubscriptionSnapshot> {
      return authoritativeReadback(reference);
    },

    pauseSubscription(
      reference: string,
    ): Promise<ProviderSubscriptionSnapshot> {
      return updateStatus(reference, "paused");
    },

    resumeSubscription(
      reference: string,
    ): Promise<ProviderSubscriptionSnapshot> {
      return updateStatus(reference, "authorized");
    },

    cancelSubscription(
      reference: string,
    ): Promise<ProviderSubscriptionSnapshot> {
      return updateStatus(reference, "canceled");
    },
  });
}

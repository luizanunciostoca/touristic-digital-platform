import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  createCheckoutProviderRequest,
  createRefundProviderCommand,
  normalizeCheckoutProviderSession,
  normalizeReconciliationProviderSnapshot,
  normalizeRefundProviderReceipt,
  normalizeVerifiedProviderPaymentEvent,
  type CheckoutProviderRequest,
  type CheckoutProviderSession,
  type FinancialCheckoutProviderPort,
  type FinancialReconciliationProviderPort,
  type FinancialRefundProviderPort,
  type FinancialWebhookVerifierPort,
  type ReconciliationProviderSnapshot,
  type RefundProviderCommand,
  type RefundProviderReceipt,
  type VerifiedProviderPaymentEvent,
} from "@touristic/financial";

import {
  ProviderRequestUnavailableError,
  createProviderRetryPolicyFromEnvironment,
  executeBoundedProviderRequest,
} from "./provider-retry.js";

export interface MercadoPagoProviderEnvironment {
  readonly NODE_ENV?: string;
  readonly PAYMENTS_PROVIDER_MODE?: string;
  readonly PAYMENTS_PROVIDER_TIMEOUT_MS?: string;
  readonly PAYMENTS_PROVIDER_MAX_ATTEMPTS?: string;
  readonly PAYMENTS_PROVIDER_RETRY_BASE_MS?: string;
  readonly PAYMENTS_WEBHOOK_TOLERANCE_SECONDS?: string;
  readonly MERCADO_PAGO_ACCESS_TOKEN?: string;
  readonly MERCADO_PAGO_WEBHOOK_SECRET?: string;
  readonly MERCADO_PAGO_CHECKOUT_ORIGINS?: string;
  readonly MERCADO_PAGO_CHECKOUT_MODE?: string;
  readonly MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED?: string;
  readonly BUSINESS_PAYMENT_API_TOKEN?: string;
  readonly BUSINESS_PAYMENT_WEBHOOK_SECRET?: string;
}

export interface MercadoPagoProviderOptions {
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
}

export type MercadoPagoProviderErrorCode =
  | "MERCADO_PAGO_INVALID_REQUEST"
  | "MERCADO_PAGO_REJECTED"
  | "MERCADO_PAGO_UNAVAILABLE"
  | "MERCADO_PAGO_INVALID_RESPONSE"
  | "MERCADO_PAGO_TEST_ACCOUNT_REQUIRED";

export class MercadoPagoProviderError extends Error {
  readonly code: MercadoPagoProviderErrorCode;

  constructor(code: MercadoPagoProviderErrorCode) {
    super(code);
    this.name = "MercadoPagoProviderError";
    this.code = code;
  }
}

const mercadoPagoApiBaseUrl = new URL("https://api.mercadopago.com/");
const maxResponseBytes = 64 * 1024;
const signaturePattern = /^[A-Fa-f0-9]{64}$/u;

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

function webhookSecret(environment: MercadoPagoProviderEnvironment): string {
  const secret = boundedString(
    environment.MERCADO_PAGO_WEBHOOK_SECRET ??
      environment.BUSINESS_PAYMENT_WEBHOOK_SECRET,
    2_048,
  );
  if (secret.length < 16) {
    throw new Error("MERCADO_PAGO_WEBHOOK_SECRET is required");
  }
  return secret;
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

function checkoutOrigins(value: unknown): ReadonlySet<string> {
  const raw = boundedString(value, 4_096);
  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0 || entries.length > 20) {
    throw new Error("MERCADO_PAGO_CHECKOUT_ORIGINS is required");
  }
  const origins = new Set<string>();
  for (const entry of entries) {
    let url: URL;
    try {
      url = new URL(entry);
    } catch {
      throw new Error("MERCADO_PAGO_CHECKOUT_ORIGINS is invalid");
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    ) {
      throw new Error("MERCADO_PAGO_CHECKOUT_ORIGINS is invalid");
    }
    origins.add(url.origin);
  }
  return origins;
}

function checkoutMode(value: unknown): "production" | "test" {
  const normalized = boundedString(value, 20).toLowerCase();
  if (!normalized || normalized === "production") return "production";
  if (normalized === "test") return "test";
  throw new Error("MERCADO_PAGO_CHECKOUT_MODE is invalid");
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
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid");
    }
    return parsed as Record<string, unknown>;
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

function providerStatus(
  value: unknown,
): "pending" | "paid" | "failed" | "cancelled" | "expired" | "refunded" | null {
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

function isoTimestamp(value: unknown): string {
  const raw = boundedString(value, 80);
  const parsed = raw ? Date.parse(raw) : Number.NaN;
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function unavailable(error: unknown): never {
  if (error instanceof MercadoPagoProviderError) throw error;
  if (error instanceof ProviderRequestUnavailableError) {
    throw new MercadoPagoProviderError("MERCADO_PAGO_UNAVAILABLE");
  }
  throw new MercadoPagoProviderError("MERCADO_PAGO_UNAVAILABLE");
}

function fetchProvider(options: MercadoPagoProviderOptions): typeof fetch {
  const provider = options.fetch ?? globalThis.fetch;
  if (typeof provider !== "function") {
    throw new Error("MERCADO_PAGO_FETCH_UNAVAILABLE");
  }
  return provider;
}

function requireMercadoPagoTestCredentialsConfirmation(
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

export function createMercadoPagoCheckoutProviderFromEnvironment(
  environment: MercadoPagoProviderEnvironment,
  options: MercadoPagoProviderOptions = {},
): FinancialCheckoutProviderPort {
  if (environment.PAYMENTS_PROVIDER_MODE !== "mercado_pago") {
    throw new Error("PAYMENTS_PROVIDER_MODE=mercado_pago is required");
  }
  const token = accessToken(environment);
  const origins = checkoutOrigins(environment.MERCADO_PAGO_CHECKOUT_ORIGINS);
  const mode = checkoutMode(environment.MERCADO_PAGO_CHECKOUT_MODE);
  const fetchImpl = fetchProvider(options);
  const timeout = timeoutMs(environment.PAYMENTS_PROVIDER_TIMEOUT_MS);
  const endpoint = new URL("checkout/preferences", mercadoPagoApiBaseUrl);

  return Object.freeze({
    async createCheckout(
      input: CheckoutProviderRequest,
    ): Promise<CheckoutProviderSession> {
      const request = createCheckoutProviderRequest(input);
      if (!request || request.amount.currency !== "BRL") {
        throw new MercadoPagoProviderError("MERCADO_PAGO_INVALID_REQUEST");
      }
      try {
        if (mode === "test") {
          requireMercadoPagoTestCredentialsConfirmation(environment);
        }
        const response = await executeBoundedProviderRequest({
          fetch: fetchImpl,
          url: endpoint,
          timeoutMs: timeout,
          policy: Object.freeze({ maxAttempts: 1, baseDelayMs: 0 }),
          init: {
            method: "POST",
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              "X-Idempotency-Key": request.idempotencyKey,
            },
            body: JSON.stringify({
              items: [
                {
                  id: request.paymentId,
                  title: request.description,
                  description: request.description,
                  currency_id: "BRL",
                  quantity: 1,
                  unit_price: majorUnits(request.amount.minorUnits),
                },
              ],
              payer: { email: request.customer.email },
              back_urls: {
                success: request.returnUrl,
                pending: request.returnUrl,
                failure: request.returnUrl,
              },
              auto_return: "approved",
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
        const checkoutUrl = boundedString(payload.init_point, 2_048);
        const checkoutId = boundedString(payload.id, 180);
        if (!checkoutId || !checkoutUrl) {
          throw new MercadoPagoProviderError("MERCADO_PAGO_INVALID_RESPONSE");
        }
        let checkoutOrigin = "";
        try {
          checkoutOrigin = new URL(checkoutUrl).origin;
        } catch {
          checkoutOrigin = "";
        }
        if (!origins.has(checkoutOrigin)) {
          throw new MercadoPagoProviderError("MERCADO_PAGO_INVALID_RESPONSE");
        }
        const session = normalizeCheckoutProviderSession({
          providerCheckoutId: checkoutId,
          checkoutUrl,
          providerReference: null,
        });
        if (!session) {
          throw new MercadoPagoProviderError("MERCADO_PAGO_INVALID_RESPONSE");
        }
        return session;
      } catch (error) {
        return unavailable(error);
      }
    },
  });
}

export function createMercadoPagoRefundProviderFromEnvironment(
  environment: MercadoPagoProviderEnvironment,
  options: MercadoPagoProviderOptions = {},
): FinancialRefundProviderPort {
  if (environment.PAYMENTS_PROVIDER_MODE !== "mercado_pago") {
    throw new Error("PAYMENTS_PROVIDER_MODE=mercado_pago is required");
  }
  const token = accessToken(environment);
  const fetchImpl = fetchProvider(options);
  const timeout = timeoutMs(environment.PAYMENTS_PROVIDER_TIMEOUT_MS);
  const policy = createProviderRetryPolicyFromEnvironment(environment);

  return Object.freeze({
    async requestRefund(
      input: RefundProviderCommand,
    ): Promise<RefundProviderReceipt> {
      const request = createRefundProviderCommand(input);
      if (!request || request.amount.currency !== "BRL") {
        throw new MercadoPagoProviderError("MERCADO_PAGO_INVALID_REQUEST");
      }
      const endpoint = new URL(
        `v1/payments/${encodeURIComponent(request.providerPaymentReference)}/refunds`,
        mercadoPagoApiBaseUrl,
      );
      try {
        const response = await executeBoundedProviderRequest({
          fetch: fetchImpl,
          url: endpoint,
          timeoutMs: timeout,
          policy,
          init: {
            method: "POST",
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              "X-Idempotency-Key": request.idempotencyKey,
            },
            body: JSON.stringify({
              amount: majorUnits(request.amount.minorUnits),
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
        const receipt = normalizeRefundProviderReceipt({
          accepted: true,
          providerRefundReference: boundedIdentifier(payload.id, 180),
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

async function readMercadoPagoPayment(
  environment: MercadoPagoProviderEnvironment,
  paymentReference: string,
  options: MercadoPagoProviderOptions,
): Promise<Record<string, unknown> | null> {
  const token = accessToken(environment);
  const fetchImpl = fetchProvider(options);
  const endpoint = new URL(
    `v1/payments/${encodeURIComponent(paymentReference)}`,
    mercadoPagoApiBaseUrl,
  );
  const response = await executeBoundedProviderRequest({
    fetch: fetchImpl,
    url: endpoint,
    timeoutMs: timeoutMs(environment.PAYMENTS_PROVIDER_TIMEOUT_MS),
    policy: createProviderRetryPolicyFromEnvironment(environment),
    init: {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new MercadoPagoProviderError(
      response.status >= 400 && response.status < 500
        ? "MERCADO_PAGO_REJECTED"
        : "MERCADO_PAGO_UNAVAILABLE",
    );
  }
  return boundedJson(response);
}

export function createMercadoPagoReconciliationProviderFromEnvironment(
  environment: MercadoPagoProviderEnvironment,
  options: MercadoPagoProviderOptions = {},
): FinancialReconciliationProviderPort {
  if (environment.PAYMENTS_PROVIDER_MODE !== "mercado_pago") {
    throw new Error("PAYMENTS_PROVIDER_MODE=mercado_pago is required");
  }
  accessToken(environment);
  return Object.freeze({
    async readPayment(
      input: Parameters<FinancialReconciliationProviderPort["readPayment"]>[0],
    ): Promise<ReconciliationProviderSnapshot | null> {
      try {
        const payload = await readMercadoPagoPayment(
          environment,
          input.providerPaymentReference,
          options,
        );
        if (!payload) return null;
        const status = providerStatus(payload.status);
        const externalReference = boundedString(
          payload.external_reference,
          160,
        );
        const currency = boundedString(payload.currency_id, 8).toUpperCase();
        const majorAmount = Number(payload.transaction_amount);
        const observedAt = isoTimestamp(
          payload.date_last_updated ?? payload.date_created,
        );
        if (
          !status ||
          externalReference !== input.paymentId ||
          currency !== "BRL" ||
          !Number.isFinite(majorAmount) ||
          !observedAt
        ) {
          throw new MercadoPagoProviderError("MERCADO_PAGO_INVALID_RESPONSE");
        }
        const snapshot = normalizeReconciliationProviderSnapshot({
          paymentId: externalReference,
          providerPaymentReference: boundedIdentifier(payload.id, 180),
          status,
          amount: { minorUnits: Math.round(majorAmount * 100), currency },
          observedAt,
        });
        if (
          !snapshot ||
          snapshot.providerPaymentReference !== input.providerPaymentReference
        ) {
          throw new MercadoPagoProviderError("MERCADO_PAGO_INVALID_RESPONSE");
        }
        return snapshot;
      } catch (error) {
        return unavailable(error);
      }
    },
  });
}

function webhookToleranceSeconds(value: unknown): number {
  const raw = boundedString(value, 10);
  if (!raw) return 900;
  if (!/^[0-9]+$/u.test(raw)) {
    throw new Error("PAYMENTS_WEBHOOK_TOLERANCE_SECONDS is invalid");
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 60 || parsed > 900) {
    throw new Error("PAYMENTS_WEBHOOK_TOLERANCE_SECONDS is invalid");
  }
  return parsed;
}

function parseSignature(
  value: string,
): { timestamp: string; digest: string } | null {
  const parts = value.split(",");
  let timestamp = "";
  let digest = "";
  for (const part of parts) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim();
    const entry = part.slice(separator + 1).trim();
    if (key === "ts") timestamp = entry;
    if (key === "v1") digest = entry;
  }
  return /^[0-9]{10,13}$/u.test(timestamp) && signaturePattern.test(digest)
    ? { timestamp, digest: digest.toLowerCase() }
    : null;
}

function parseWebhookEnvelope(rawBody: Uint8Array): {
  dataId: string;
  action: string;
} | null {
  if (
    !(rawBody instanceof Uint8Array) ||
    rawBody.byteLength === 0 ||
    rawBody.byteLength > maxResponseBytes
  ) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(rawBody),
    ) as Record<string, unknown>;
    const data = parsed.data as Record<string, unknown> | undefined;
    const dataId = boundedIdentifier(data?.id, 180);
    const action = boundedString(parsed.action, 120);
    return dataId ? { dataId, action } : null;
  } catch {
    return null;
  }
}

export function createMercadoPagoWebhookVerifierFromEnvironment(
  environment: MercadoPagoProviderEnvironment,
  options: MercadoPagoProviderOptions = {},
): FinancialWebhookVerifierPort {
  if (environment.PAYMENTS_PROVIDER_MODE !== "mercado_pago") {
    throw new Error("PAYMENTS_PROVIDER_MODE=mercado_pago is required");
  }
  const secret = webhookSecret(environment);
  accessToken(environment);
  const tolerance = webhookToleranceSeconds(
    environment.PAYMENTS_WEBHOOK_TOLERANCE_SECONDS,
  );
  const now = options.now ?? Date.now;

  return Object.freeze({
    async verify(
      rawBody: Uint8Array,
      signatureEnvelope: string,
    ): Promise<VerifiedProviderPaymentEvent | null> {
      let envelope: { signature?: unknown; requestId?: unknown };
      try {
        envelope = JSON.parse(signatureEnvelope) as {
          signature?: unknown;
          requestId?: unknown;
        };
      } catch {
        return null;
      }
      const signature = parseSignature(boundedString(envelope.signature, 240));
      const requestId = boundedString(envelope.requestId, 180);
      const webhook = parseWebhookEnvelope(rawBody);
      if (!signature || !requestId || !webhook) return null;

      const timestamp = Number(signature.timestamp);
      const timestampSeconds =
        signature.timestamp.length === 13
          ? Math.floor(timestamp / 1000)
          : timestamp;
      const nowMilliseconds = Number(now());
      if (
        !Number.isSafeInteger(timestamp) ||
        !Number.isFinite(nowMilliseconds) ||
        Math.abs(Math.floor(nowMilliseconds / 1000) - timestampSeconds) >
          tolerance
      ) {
        return null;
      }

      const manifest = `id:${webhook.dataId};request-id:${requestId};ts:${signature.timestamp};`;
      const expected = createHmac("sha256", secret).update(manifest).digest();
      const provided = Buffer.from(signature.digest, "hex");
      if (
        provided.byteLength !== expected.byteLength ||
        !timingSafeEqual(provided, expected)
      ) {
        return null;
      }

      let payment: Record<string, unknown> | null;
      try {
        payment = await readMercadoPagoPayment(
          environment,
          webhook.dataId,
          options,
        );
      } catch {
        throw new MercadoPagoProviderError("MERCADO_PAGO_UNAVAILABLE");
      }
      if (!payment) return null;
      const status = providerStatus(payment.status);
      if (!status || status === "pending") {
        return null;
      }
      const externalReference = boundedString(payment.external_reference, 160);
      const occurredAt = isoTimestamp(
        payment.date_last_updated ??
          payment.date_approved ??
          payment.date_created,
      );
      const providerPaymentReference =
        payment.id === undefined
          ? webhook.dataId
          : boundedIdentifier(payment.id, 180);
      const transactionAmount = Number(payment.transaction_amount);
      const amountMinorUnits =
        Number.isFinite(transactionAmount) && transactionAmount > 0
          ? Math.round(transactionAmount * 100)
          : null;
      const currency = boundedString(payment.currency_id, 8).toUpperCase();
      if (
        !externalReference ||
        !occurredAt ||
        providerPaymentReference !== webhook.dataId ||
        amountMinorUnits === null ||
        !currency
      ) {
        return null;
      }
      const eventDigest = createHash("sha256")
        .update(requestId)
        .update("|")
        .update(webhook.action)
        .update("|")
        .update(webhook.dataId)
        .update("|")
        .update(status)
        .update("|")
        .update(occurredAt)
        .digest("hex")
        .slice(0, 32);
      return normalizeVerifiedProviderPaymentEvent({
        providerEventId: `pwe_mp_${eventDigest}`,
        externalReference,
        providerPaymentReference,
        amountMinorUnits,
        currency,
        status,
        occurredAt,
      });
    },
  });
}

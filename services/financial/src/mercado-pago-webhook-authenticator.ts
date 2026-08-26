import { createHmac, timingSafeEqual } from "node:crypto";

import type {
  FinancialWebhookVerifierPort,
  VerifiedProviderPaymentEvent,
} from "@touristic/financial";

import {
  createMercadoPagoWebhookVerifierFromEnvironment,
  type MercadoPagoProviderEnvironment,
  type MercadoPagoProviderOptions,
} from "./mercado-pago-provider.js";

export const mercadoPagoWebhookAuthenticityFailureReasons = Object.freeze([
  "invalid_envelope",
  "missing_signature",
  "missing_request_id",
  "missing_query_data_id",
  "invalid_signature",
  "invalid_body_data_id",
  "data_id_mismatch",
  "timestamp_invalid",
  "hmac_mismatch",
] as const);

export type MercadoPagoWebhookAuthenticityFailureReason =
  (typeof mercadoPagoWebhookAuthenticityFailureReasons)[number];

export interface AuthenticatingFinancialWebhookVerifierPort extends FinancialWebhookVerifierPort {
  verifyAuthenticity(
    rawBody: Uint8Array,
    signatureEnvelope: string,
  ): Promise<boolean>;
  diagnoseAuthenticity(
    rawBody: Uint8Array,
    signatureEnvelope: string,
  ): Promise<MercadoPagoWebhookAuthenticityFailureReason | null>;
}

const maxBodyBytes = 64 * 1024;

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

function parseSignature(
  value: string,
): { timestamp: string; digest: string } | null {
  let timestamp = "";
  let digest = "";
  for (const part of value.split(",")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim();
    const entry = part.slice(separator + 1).trim();
    if (key === "ts") timestamp = entry;
    if (key === "v1") digest = entry.toLowerCase();
  }
  return /^[0-9]{10,13}$/u.test(timestamp) && /^[a-f0-9]{64}$/u.test(digest)
    ? { timestamp, digest }
    : null;
}

function webhookBodyDataId(rawBody: Uint8Array): string {
  if (
    !(rawBody instanceof Uint8Array) ||
    rawBody.byteLength === 0 ||
    rawBody.byteLength > maxBodyBytes
  ) {
    return "";
  }
  try {
    const parsed = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(rawBody),
    ) as Record<string, unknown>;
    const data = parsed.data as Record<string, unknown> | undefined;
    return boundedIdentifier(data?.id, 180);
  } catch {
    return "";
  }
}

function parseEnvelope(value: string): {
  signature: string;
  requestId: string;
  dataId: string;
} | null {
  let envelope: {
    signature?: unknown;
    requestId?: unknown;
    dataId?: unknown;
  };
  try {
    envelope = JSON.parse(value) as {
      signature?: unknown;
      requestId?: unknown;
      dataId?: unknown;
    };
  } catch {
    return null;
  }
  return {
    signature: boundedString(envelope.signature, 240),
    requestId: boundedString(envelope.requestId, 180),
    dataId: boundedIdentifier(envelope.dataId, 180),
  };
}

function secret(environment: MercadoPagoProviderEnvironment): string {
  const value = boundedString(
    environment.MERCADO_PAGO_WEBHOOK_SECRET ??
      environment.BUSINESS_PAYMENT_WEBHOOK_SECRET,
    2_048,
  );
  if (value.length < 16) {
    throw new Error("MERCADO_PAGO_WEBHOOK_SECRET is required");
  }
  return value;
}

function toleranceSeconds(value: unknown): number {
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

export function createMercadoPagoAuthenticatingWebhookVerifierFromEnvironment(
  environment: MercadoPagoProviderEnvironment,
  options: MercadoPagoProviderOptions = {},
): AuthenticatingFinancialWebhookVerifierPort {
  const terminalVerifier = createMercadoPagoWebhookVerifierFromEnvironment(
    environment,
    options,
  );
  const webhookSecret = secret(environment);
  const tolerance = toleranceSeconds(
    environment.PAYMENTS_WEBHOOK_TOLERANCE_SECONDS,
  );
  const now = options.now ?? Date.now;

  function authenticityFailure(
    rawBody: Uint8Array,
    signatureEnvelope: string,
  ): MercadoPagoWebhookAuthenticityFailureReason | null {
    const envelope = parseEnvelope(signatureEnvelope);
    if (!envelope) return "invalid_envelope";
    if (!envelope.signature) return "missing_signature";
    if (!envelope.requestId) return "missing_request_id";
    if (!envelope.dataId) return "missing_query_data_id";

    const signature = parseSignature(envelope.signature);
    if (!signature) return "invalid_signature";

    const bodyDataId = webhookBodyDataId(rawBody);
    if (!bodyDataId) return "invalid_body_data_id";
    if (bodyDataId !== envelope.dataId) return "data_id_mismatch";

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
      return "timestamp_invalid";
    }

    // Mercado Pago signs the data.id query parameter. The HTTP runtime binds
    // that value into this internal envelope and overrides any caller-supplied
    // marker. The body id is checked above only as an additional consistency
    // guard before the provider query id becomes HMAC authority.
    const manifest = `id:${envelope.dataId};request-id:${envelope.requestId};ts:${signature.timestamp};`;
    const expected = createHmac("sha256", webhookSecret)
      .update(manifest)
      .digest();
    const provided = Buffer.from(signature.digest, "hex");
    if (
      provided.byteLength !== expected.byteLength ||
      !timingSafeEqual(provided, expected)
    ) {
      return "hmac_mismatch";
    }
    return null;
  }

  function diagnoseAuthenticity(
    rawBody: Uint8Array,
    signatureEnvelope: string,
  ): Promise<MercadoPagoWebhookAuthenticityFailureReason | null> {
    return Promise.resolve(authenticityFailure(rawBody, signatureEnvelope));
  }

  function verifyAuthenticity(
    rawBody: Uint8Array,
    signatureEnvelope: string,
  ): Promise<boolean> {
    return Promise.resolve(
      authenticityFailure(rawBody, signatureEnvelope) === null,
    );
  }

  async function verify(
    rawBody: Uint8Array,
    signatureEnvelope: string,
  ): Promise<VerifiedProviderPaymentEvent | null> {
    if (!(await verifyAuthenticity(rawBody, signatureEnvelope))) return null;
    return terminalVerifier.verify(rawBody, signatureEnvelope);
  }

  return Object.freeze({
    verify,
    verifyAuthenticity,
    diagnoseAuthenticity,
  });
}

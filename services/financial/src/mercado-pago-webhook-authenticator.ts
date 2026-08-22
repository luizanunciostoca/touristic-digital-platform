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

export interface AuthenticatingFinancialWebhookVerifierPort extends FinancialWebhookVerifierPort {
  verifyAuthenticity(
    rawBody: Uint8Array,
    signatureEnvelope: string,
  ): Promise<boolean>;
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
  const signature = boundedString(envelope.signature, 240);
  const requestId = boundedString(envelope.requestId, 180);
  const dataId = boundedIdentifier(envelope.dataId, 180);
  return signature && requestId && dataId
    ? { signature, requestId, dataId }
    : null;
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

  function verifyAuthenticity(
    rawBody: Uint8Array,
    signatureEnvelope: string,
  ): Promise<boolean> {
    const envelope = parseEnvelope(signatureEnvelope);
    if (!envelope) return Promise.resolve(false);
    const signature = parseSignature(envelope.signature);
    const bodyDataId = webhookBodyDataId(rawBody);
    if (!signature || !bodyDataId || bodyDataId !== envelope.dataId)
      return Promise.resolve(false);

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
      return Promise.resolve(false);
    }

    const manifest = `id:${envelope.dataId};request-id:${envelope.requestId};ts:${signature.timestamp};`;
    const expected = createHmac("sha256", webhookSecret)
      .update(manifest)
      .digest();
    const provided = Buffer.from(signature.digest, "hex");
    return Promise.resolve(
      provided.byteLength === expected.byteLength &&
        timingSafeEqual(provided, expected),
    );
  }

  async function verify(
    rawBody: Uint8Array,
    signatureEnvelope: string,
  ): Promise<VerifiedProviderPaymentEvent | null> {
    if (!(await verifyAuthenticity(rawBody, signatureEnvelope))) return null;
    return terminalVerifier.verify(rawBody, signatureEnvelope);
  }

  return Object.freeze({ verify, verifyAuthenticity });
}

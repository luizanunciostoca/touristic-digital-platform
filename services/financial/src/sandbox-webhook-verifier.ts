import { createHmac, timingSafeEqual } from "node:crypto";

import {
  normalizeVerifiedProviderPaymentEvent,
  type FinancialWebhookVerifierPort,
  type VerifiedProviderPaymentEvent,
} from "@touristic/financial";

export interface SandboxWebhookVerifierEnvironment {
  readonly PAYMENTS_SANDBOX_WEBHOOK_SECRET?: string;
  readonly PAYMENTS_WEBHOOK_TOLERANCE_SECONDS?: string;
}

export interface SandboxWebhookVerifierClock {
  nowEpochMilliseconds(): number;
}

export interface SandboxWebhookVerifierOptions {
  readonly clock?: SandboxWebhookVerifierClock;
}

const maxBodyBytes = 64 * 1024;
const signaturePattern = /^t=([0-9]{10,13}),v1=([a-f0-9]{64})$/u;

function boundedString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : "";
}

function toleranceSeconds(value: unknown): number {
  const raw = boundedString(value, 10);
  if (!raw) return 300;
  if (!/^[0-9]+$/u.test(raw)) {
    throw new Error("PAYMENTS_WEBHOOK_TOLERANCE_SECONDS is invalid");
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 60 || parsed > 900) {
    throw new Error("PAYMENTS_WEBHOOK_TOLERANCE_SECONDS is invalid");
  }
  return parsed;
}

function verifiedPayload(rawBody: Uint8Array): Record<string, unknown> | null {
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(rawBody);
    const parsed = JSON.parse(decoded) as unknown;
    return parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function createSandboxWebhookVerifierFromEnvironment(
  environment: SandboxWebhookVerifierEnvironment,
  options: SandboxWebhookVerifierOptions = {},
): FinancialWebhookVerifierPort {
  const secret = boundedString(
    environment.PAYMENTS_SANDBOX_WEBHOOK_SECRET,
    1_024,
  );
  if (secret.length < 32) {
    throw new Error("PAYMENTS_SANDBOX_WEBHOOK_SECRET is required");
  }
  const tolerance = toleranceSeconds(
    environment.PAYMENTS_WEBHOOK_TOLERANCE_SECONDS,
  );
  const clock =
    options.clock ??
    Object.freeze({
      nowEpochMilliseconds: () => Date.now(),
    });

  return Object.freeze({
    async verify(
      rawBody: Uint8Array,
      signature: string,
    ): Promise<VerifiedProviderPaymentEvent | null> {
      if (
        !(rawBody instanceof Uint8Array) ||
        rawBody.byteLength === 0 ||
        rawBody.byteLength > maxBodyBytes
      ) {
        return null;
      }
      const match = signaturePattern.exec(
        boundedString(signature, 200).toLowerCase(),
      );
      if (!match) return null;
      const timestamp = Number(match[1]);
      const now = clock.nowEpochMilliseconds();
      if (
        !Number.isSafeInteger(timestamp) ||
        !Number.isFinite(now) ||
        Math.abs(Math.floor(now / 1_000) - timestamp) > tolerance
      ) {
        return null;
      }
      const provided = Buffer.from(match[2] ?? "", "hex");
      const expected = createHmac("sha256", secret)
        .update(String(timestamp))
        .update(".")
        .update(rawBody)
        .digest();
      if (
        provided.byteLength !== expected.byteLength ||
        !timingSafeEqual(provided, expected)
      ) {
        return null;
      }

      const payload = verifiedPayload(rawBody);
      if (!payload || payload.version !== 1) return null;
      return normalizeVerifiedProviderPaymentEvent({
        providerEventId: payload.eventId,
        externalReference: payload.externalReference,
        providerPaymentReference:
          payload.paymentReference === undefined
            ? null
            : payload.paymentReference,
        status: payload.status,
        occurredAt: payload.occurredAt,
      });
    },
  });
}

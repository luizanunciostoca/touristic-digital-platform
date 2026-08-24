import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createMercadoPagoAuthenticatingWebhookVerifierFromEnvironment,
} from "./mercado-pago-webhook-authenticator.js";

const webhookSecret = "webhook_secret_test_12345678901234567890";
const accessToken = "TEST_ACCESS_TOKEN_123456789012345678901234567890";
const nowMs = 1_787_608_000_000;
const timestamp = String(Math.floor(nowMs / 1_000));
const requestId = "request-provider-webhook-0001";
const dataId = "123456789";

function rawBody(id = dataId): Uint8Array {
  return Buffer.from(
    JSON.stringify({ action: "payment.updated", data: { id } }),
  );
}

function signedEnvelope(
  options: {
    readonly manifestDataId?: string;
    readonly envelopeDataId?: string | null;
    readonly ts?: string;
  } = {},
): string {
  const manifestDataId = options.manifestDataId ?? dataId;
  const ts = options.ts ?? timestamp;
  const manifest = `id:${manifestDataId};request-id:${requestId};ts:${ts};`;
  const digest = createHmac("sha256", webhookSecret)
    .update(manifest)
    .digest("hex");
  return JSON.stringify({
    signature: `ts=${ts},v1=${digest}`,
    requestId,
    ...(options.envelopeDataId === undefined
      ? {}
      : { dataId: options.envelopeDataId }),
  });
}

function verifier() {
  return createMercadoPagoAuthenticatingWebhookVerifierFromEnvironment(
    {
      PAYMENTS_PROVIDER_MODE: "mercado_pago",
      MERCADO_PAGO_ACCESS_TOKEN: accessToken,
      MERCADO_PAGO_WEBHOOK_SECRET: webhookSecret,
      PAYMENTS_WEBHOOK_TOLERANCE_SECONDS: "300",
    },
    { now: () => nowMs },
  );
}

describe("Mercado Pago authenticating webhook verifier", () => {
  it(
    "accepts the official HMAC when the internal transport does not supply provider dataId",
    async () => {
      await expect(
        verifier().verifyAuthenticity(rawBody(), signedEnvelope()),
      ).resolves.toBe(true);
    },
  );

  it("accepts a matching explicit internal dataId", async () => {
    await expect(
      verifier().verifyAuthenticity(
        rawBody(),
        signedEnvelope({ envelopeDataId: dataId }),
      ),
    ).resolves.toBe(true);
  });

  it(
    "rejects a conflicting explicit internal dataId before HMAC acceptance",
    async () => {
      await expect(
        verifier().verifyAuthenticity(
          rawBody(),
          signedEnvelope({ envelopeDataId: "987654321" }),
        ),
      ).resolves.toBe(false);
    },
  );

  it(
    "rejects body dataId tampering even when the captured signature was valid",
    async () => {
      await expect(
        verifier().verifyAuthenticity(rawBody("987654321"), signedEnvelope()),
      ).resolves.toBe(false);
    },
  );

  it(
    "rejects signatures outside the configured timestamp tolerance",
    async () => {
      const staleTs = String(Number(timestamp) - 301);
      await expect(
        verifier().verifyAuthenticity(
          rawBody(),
          signedEnvelope({ ts: staleTs }),
        ),
      ).resolves.toBe(false);
    },
  );
});

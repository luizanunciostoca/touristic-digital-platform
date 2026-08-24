import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createMercadoPagoAuthenticatingWebhookVerifierFromEnvironment } from "./mercado-pago-webhook-authenticator.js";

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
    readonly requestId?: string | null;
  } = {},
): string {
  const manifestDataId = options.manifestDataId ?? dataId;
  const envelopeDataId =
    options.envelopeDataId === undefined ? dataId : options.envelopeDataId;
  const manifestRequestId =
    options.requestId === undefined ? requestId : (options.requestId ?? "");
  const ts = options.ts ?? timestamp;
  const manifest = `id:${manifestDataId};request-id:${manifestRequestId};ts:${ts};`;
  const digest = createHmac("sha256", webhookSecret)
    .update(manifest)
    .digest("hex");
  return JSON.stringify({
    signature: `ts=${ts},v1=${digest}`,
    ...(options.requestId === null ? {} : { requestId: manifestRequestId }),
    ...(envelopeDataId === null ? {} : { dataId: envelopeDataId }),
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
  it("accepts the official HMAC using the provider query dataId", async () => {
    await expect(
      verifier().verifyAuthenticity(rawBody(), signedEnvelope()),
    ).resolves.toBe(true);
    await expect(
      verifier().diagnoseAuthenticity(rawBody(), signedEnvelope()),
    ).resolves.toBeNull();
  });

  it("diagnoses a notification when the provider query dataId is missing", async () => {
    const envelope = signedEnvelope({ envelopeDataId: null });
    await expect(
      verifier().verifyAuthenticity(rawBody(), envelope),
    ).resolves.toBe(false);
    await expect(
      verifier().diagnoseAuthenticity(rawBody(), envelope),
    ).resolves.toBe("missing_query_data_id");
  });

  it("diagnoses a missing provider request id without exposing its value", async () => {
    const envelope = signedEnvelope({ requestId: null });
    await expect(
      verifier().verifyAuthenticity(rawBody(), envelope),
    ).resolves.toBe(false);
    await expect(
      verifier().diagnoseAuthenticity(rawBody(), envelope),
    ).resolves.toBe("missing_request_id");
  });

  it("diagnoses a conflicting provider query dataId before HMAC acceptance", async () => {
    const envelope = signedEnvelope({ envelopeDataId: "987654321" });
    await expect(
      verifier().verifyAuthenticity(rawBody(), envelope),
    ).resolves.toBe(false);
    await expect(
      verifier().diagnoseAuthenticity(rawBody(), envelope),
    ).resolves.toBe("data_id_mismatch");
  });

  it("diagnoses body dataId tampering even when the query signature is valid", async () => {
    await expect(
      verifier().verifyAuthenticity(rawBody("987654321"), signedEnvelope()),
    ).resolves.toBe(false);
    await expect(
      verifier().diagnoseAuthenticity(
        rawBody("987654321"),
        signedEnvelope(),
      ),
    ).resolves.toBe("data_id_mismatch");
  });

  it("diagnoses signatures outside the configured timestamp tolerance", async () => {
    const staleTs = String(Number(timestamp) - 301);
    const envelope = signedEnvelope({ ts: staleTs });
    await expect(
      verifier().verifyAuthenticity(rawBody(), envelope),
    ).resolves.toBe(false);
    await expect(
      verifier().diagnoseAuthenticity(rawBody(), envelope),
    ).resolves.toBe("timestamp_invalid");
  });

  it("diagnoses an HMAC key or manifest mismatch without exposing inputs", async () => {
    const envelope = signedEnvelope({ manifestDataId: "987654321" });
    await expect(
      verifier().verifyAuthenticity(rawBody(), envelope),
    ).resolves.toBe(false);
    await expect(
      verifier().diagnoseAuthenticity(rawBody(), envelope),
    ).resolves.toBe("hmac_mismatch");
  });
});

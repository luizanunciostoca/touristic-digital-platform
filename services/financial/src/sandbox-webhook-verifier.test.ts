import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createSandboxWebhookVerifierFromEnvironment } from "./sandbox-webhook-verifier.js";

const secret = "sandbox-webhook-secret-with-at-least-thirty-two-characters";
const now = Date.parse("2026-08-14T23:00:00Z");
const timestamp = Math.floor(now / 1_000);

function body(overrides: Record<string, unknown> = {}): Uint8Array {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      eventId: "pwe_sandbox_00000001",
      externalReference: "pay_sandbox_webhook_0001",
      paymentReference: "sandbox_payment_0001",
      status: "paid",
      occurredAt: "2026-08-14T22:59:59Z",
      ...overrides,
    }),
  );
}

function signature(rawBody: Uint8Array, epochSeconds = timestamp): string {
  const digest = createHmac("sha256", secret)
    .update(String(epochSeconds))
    .update(".")
    .update(rawBody)
    .digest("hex");
  return `t=${epochSeconds},v1=${digest}`;
}

function verifier() {
  return createSandboxWebhookVerifierFromEnvironment(
    {
      PAYMENTS_SANDBOX_WEBHOOK_SECRET: secret,
      PAYMENTS_WEBHOOK_TOLERANCE_SECONDS: "300",
    },
    { clock: { nowEpochMilliseconds: () => now } },
  );
}

describe("M141 sandbox raw-body webhook verifier", () => {
  it("verifies the exact bytes before normalizing the provider event", async () => {
    const rawBody = body();
    await expect(
      verifier().verify(rawBody, signature(rawBody)),
    ).resolves.toEqual({
      providerEventId: "pwe_sandbox_00000001",
      externalReference: "pay_sandbox_webhook_0001",
      providerPaymentReference: "sandbox_payment_0001",
      status: "paid",
      occurredAt: "2026-08-14T22:59:59.000Z",
    });
  });

  it("rejects tamper, stale signatures and invalid payloads", async () => {
    const rawBody = body();
    const signed = signature(rawBody);
    await expect(
      verifier().verify(
        Buffer.from(
          JSON.stringify({
            ...JSON.parse(Buffer.from(rawBody).toString("utf8")),
            status: "failed",
          }),
        ),
        signed,
      ),
    ).resolves.toBeNull();
    await expect(
      verifier().verify(rawBody, signature(rawBody, timestamp - 301)),
    ).resolves.toBeNull();

    const invalid = body({ externalReference: "ord_not_a_payment" });
    await expect(
      verifier().verify(invalid, signature(invalid)),
    ).resolves.toBeNull();
  });

  it("fails closed on missing secrets and invalid tolerance", () => {
    expect(() =>
      createSandboxWebhookVerifierFromEnvironment({
        PAYMENTS_SANDBOX_WEBHOOK_SECRET: "short",
      }),
    ).toThrow("PAYMENTS_SANDBOX_WEBHOOK_SECRET is required");
    expect(() =>
      createSandboxWebhookVerifierFromEnvironment({
        PAYMENTS_SANDBOX_WEBHOOK_SECRET: secret,
        PAYMENTS_WEBHOOK_TOLERANCE_SECONDS: "59",
      }),
    ).toThrow("PAYMENTS_WEBHOOK_TOLERANCE_SECONDS is invalid");
  });
});

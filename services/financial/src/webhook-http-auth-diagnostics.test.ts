import { describe, expect, it } from "vitest";

import type { FinancialWebhookAuditEvent } from "./webhook-http-transport.js";
import { FinancialWebhookHttpTransport } from "./webhook-http-transport.js";

describe("Mercado Pago webhook authentication diagnostics", () => {
  it("audits only the sanitized authentication failure stage and header context", async () => {
    const audits: FinancialWebhookAuditEvent[] = [];
    const verifier = Object.freeze({
      verify: () => Promise.resolve(null),
      verifyAuthenticity: () => Promise.resolve(false),
      diagnoseAuthenticity: () => Promise.resolve("hmac_mismatch"),
    });
    const transport = new FinancialWebhookHttpTransport({
      verifier,
      events: {
        claim: () => Promise.reject(new Error("UNEXPECTED_EVENT_CLAIM")),
      },
      payments: {
        findById: () => Promise.resolve(null),
        save: () => Promise.reject(new Error("UNEXPECTED_PAYMENT_SAVE")),
      },
      outcomes: {
        apply: () => Promise.reject(new Error("UNEXPECTED_OUTCOME_APPLY")),
      },
      accounting: {
        apply: () => Promise.reject(new Error("UNEXPECTED_ACCOUNTING_APPLY")),
      },
      audit: {
        record(event) {
          audits.push(event);
          return Promise.resolve();
        },
      },
      clock: { now: () => "2026-08-24T23:00:00Z" },
    });

    const rawBody = Buffer.from(
      JSON.stringify({ action: "payment.updated", data: { id: "123456789" } }),
    );
    const response = await transport.handle({
      method: "POST",
      pathname: "/api/payments/v1/webhooks/sandbox",
      headers: {
        "x-signature": `ts=1787612400,v1=${"a".repeat(64)}`,
        "x-request-id": "request-secret-value-not-for-audit",
        "x-morro-provider-data-id": "123456789",
        "rndr-id": "render-trace-value-not-for-audit",
      },
      rawBody,
      correlationId: "corr_webhook_diag_0001",
    });

    expect(response).toMatchObject({
      status: 401,
      body: { error: "WEBHOOK_UNAUTHORIZED" },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: "webhook.receive",
      result: "denied",
      reason: "signature_or_payload_invalid",
      authenticityFailure: "hmac_mismatch",
      authenticityContext: {
        signaturePresent: true,
        requestIdPresent: true,
        providerDataIdPresent: true,
        renderTracePresent: true,
        requestIdMatchesRenderTrace: false,
      },
    });
    const serializedAudit = JSON.stringify(audits[0]);
    expect(serializedAudit).not.toContain("request-secret-value-not-for-audit");
    expect(serializedAudit).not.toContain("render-trace-value-not-for-audit");
    expect(serializedAudit).not.toContain("123456789");
    expect(serializedAudit).not.toContain("a".repeat(64));
  });
});

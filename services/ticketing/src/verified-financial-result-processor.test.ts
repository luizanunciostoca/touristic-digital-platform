import { describe, expect, it, vi } from "vitest";

import { normalizeVerifiedPaymentResult } from "@touristic/financial";

import { createVerifiedFinancialResultProcessor } from "./verified-financial-result-processor.js";

function result(kind: "approved" | "refunded", sequence: number) {
  const value = normalizeVerifiedPaymentResult({
    resultId: `fev_ticketing_result_${sequence.toString().padStart(8, "0")}`,
    providerEventId: `pev_ticketing_result_${sequence.toString().padStart(8, "0")}`,
    paymentId: `pay_ticketing_result_${sequence.toString().padStart(8, "0")}`,
    orderReference: `ord_ticketing_result_${sequence.toString().padStart(8, "0")}`,
    kind,
    paymentStatus: kind === "approved" ? "confirmed" : "refunded",
    paymentReference: `provider_ticketing_${sequence}`,
    occurredAt: `2026-08-16T18:0${sequence}:00.000Z`,
    recordedAt: `2026-08-16T18:1${sequence}:00.000Z`,
  });
  if (!value) throw new Error("FIXTURE_INVALID");
  return value;
}

describe("verified Financial result processor", () => {
  it("advances the durable cursor only after each handler succeeds", async () => {
    const approved = result("approved", 1);
    const refunded = result("refunded", 2);
    let cursor: { recordedAt: string; resultId: string } | null = null;
    const fulfillment = vi.fn(async () => null);
    const refunds = vi.fn(async () => null);
    const processor = createVerifiedFinancialResultProcessor({
      feed: {
        async listAfter() {
          return [approved, refunded];
        },
      },
      cursor: {
        async load() {
          return cursor;
        },
        async save(next) {
          cursor = next;
        },
      },
      fulfillment: { handle: fulfillment },
      refunds: { handle: refunds },
    });

    await expect(processor.drain()).resolves.toEqual({ processed: 2 });
    expect(fulfillment).toHaveBeenCalledWith(approved);
    expect(refunds).toHaveBeenCalledWith(refunded);
    expect(cursor).toEqual({
      recordedAt: refunded.recordedAt,
      resultId: refunded.resultId,
    });
  });

  it("does not advance past a failed fulfillment", async () => {
    const approved = result("approved", 1);
    let saved = false;
    const processor = createVerifiedFinancialResultProcessor({
      feed: { async listAfter() { return [approved]; } },
      cursor: {
        async load() { return null; },
        async save() { saved = true; },
      },
      fulfillment: {
        async handle() { throw new Error("FULFILLMENT_FAILED"); },
      },
      refunds: { async handle() { return null; } },
    });

    await expect(processor.drain()).rejects.toThrow("FULFILLMENT_FAILED");
    expect(saved).toBe(false);
  });
});

import { describe, expect, it, vi } from "vitest";

import { normalizeVerifiedPaymentResult } from "@touristic/financial";

import { createVerifiedFinancialResultProcessor } from "./verified-financial-result-processor.js";

function result(kind: "approved" | "refunded", sequence: number) {
  const value = normalizeVerifiedPaymentResult({
    resultId: `fev_ticketing_result_${sequence.toString().padStart(8, "0")}`,
    providerEventId: `pwe_ticketing_result_${sequence.toString().padStart(8, "0")}`,
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
      feed: {
        async listAfter() {
          return [approved];
        },
      },
      cursor: {
        async load() {
          return null;
        },
        async save() {
          saved = true;
        },
      },
      fulfillment: {
        async handle() {
          throw new Error("FULFILLMENT_FAILED");
        },
      },
      refunds: {
        async handle() {
          return null;
        },
      },
    });

    await expect(processor.drain()).rejects.toMatchObject({
      message: "TICKETING_FINANCIAL_PROCESSOR_STAGE_FAILURE",
      stage: "fulfillment_handle",
      diagnosticCode: "UNKNOWN_FAILURE",
    });
    expect(saved).toBe(false);
  });

  for (const failingStage of [
    "cursor_load",
    "feed_list_after",
    "fulfillment_handle",
    "refund_handle",
    "cursor_save",
  ] as const) {
    it("reports only allowlisted diagnostics for " + failingStage, async () => {
      const source = result(
        failingStage === "refund_handle" ? "refunded" : "approved",
        1,
      );
      const raw = Object.assign(
        new Error("SENSITIVE_SENTINEL mysql://user:password@host/finance"),
        {
          code: "ER_NO_SUCH_TABLE",
          sql: "SELECT SENSITIVE_SENTINEL",
          sqlMessage: "SENSITIVE_SENTINEL",
        },
      );
      let saved = 0;
      const processor = createVerifiedFinancialResultProcessor({
        cursor: {
          async load() {
            if (failingStage === "cursor_load") throw raw;
            return null;
          },
          async save() {
            saved += 1;
            if (failingStage === "cursor_save") throw raw;
          },
        },
        feed: {
          async listAfter() {
            if (failingStage === "feed_list_after") throw raw;
            return [source];
          },
        },
        fulfillment: {
          async handle() {
            if (failingStage === "fulfillment_handle") throw raw;
            return null;
          },
        },
        refunds: {
          async handle() {
            if (failingStage === "refund_handle") throw raw;
            return null;
          },
        },
      });
      let thrown: unknown;
      try {
        await processor.drain();
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toMatchObject({
        name: "TicketingFinancialStageFailure",
        message: "TICKETING_FINANCIAL_PROCESSOR_STAGE_FAILURE",
        stage: failingStage,
        diagnosticCode: "ER_NO_SUCH_TABLE",
      });
      expect(JSON.stringify(thrown)).not.toContain("SENSITIVE_SENTINEL");
      expect(String(thrown)).not.toContain("SENSITIVE_SENTINEL");
      expect(saved).toBe(failingStage === "cursor_save" ? 1 : 0);
    });
  }

  it("redacts unrecognized codes and raw error details", async () => {
    const processor = createVerifiedFinancialResultProcessor({
      cursor: {
        async load() {
          throw Object.assign(new Error("SENSITIVE_SENTINEL SECRET"), {
            code: "ER_BAD_FIELD_ERROR_SENSITIVE_SENTINEL",
            sql: "SELECT SENSITIVE_SENTINEL",
          });
        },
        async save() {
          throw new Error("SAVE_SHOULD_NEVER_RUN");
        },
      },
      feed: {
        async listAfter() {
          return [];
        },
      },
      fulfillment: {
        async handle() {
          return null;
        },
      },
      refunds: {
        async handle() {
          return null;
        },
      },
    });
    let thrown: unknown;
    try {
      await processor.drain();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      stage: "cursor_load",
      diagnosticCode: "UNKNOWN_FAILURE",
      message: "TICKETING_FINANCIAL_PROCESSOR_STAGE_FAILURE",
    });
    expect(JSON.stringify(thrown)).not.toContain("SENSITIVE_SENTINEL");
    expect(String(thrown)).not.toContain("SENSITIVE_SENTINEL");
  });

  async function expectSafeCursorLoadFailure(
    raw: Error,
    diagnosticCode: string,
  ): Promise<void> {
    const listAfter = vi.fn(async () => []);
    const save = vi.fn(async () => {});
    const fulfillment = vi.fn(async () => null);
    const refunds = vi.fn(async () => null);
    const processor = createVerifiedFinancialResultProcessor({
      cursor: {
        async load() {
          throw raw;
        },
        save,
      },
      feed: { listAfter },
      fulfillment: { handle: fulfillment },
      refunds: { handle: refunds },
    });
    let thrown: unknown;
    try {
      await processor.drain();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).toMatchObject({
      name: "TicketingFinancialStageFailure",
      message: "TICKETING_FINANCIAL_PROCESSOR_STAGE_FAILURE",
      stage: "cursor_load",
      diagnosticCode,
    });
    expect(thrown).not.toHaveProperty("cause");
    expect(JSON.stringify(thrown)).not.toContain("SENSITIVE_SENTINEL");
    expect(String(thrown)).not.toContain("SENSITIVE_SENTINEL");
    expect(listAfter).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(fulfillment).not.toHaveBeenCalled();
    expect(refunds).not.toHaveBeenCalled();
  }

  for (const property of ["code", "message"] as const) {
    it("reads a mutable " + property + " getter only once", async () => {
      let reads = 0;
      const raw = new Error("SENSITIVE_SENTINEL");
      Object.defineProperty(raw, property, {
        get() {
          reads += 1;
          return reads === 1 ? "ER_NO_SUCH_TABLE" : "SENSITIVE_SENTINEL";
        },
      });
      await expectSafeCursorLoadFailure(raw, "ER_NO_SUCH_TABLE");
      expect(reads).toBe(1);
    });

    it(
      "preserves the stage when a " + property + " getter throws",
      async () => {
        const raw = new Error("SENSITIVE_SENTINEL");
        Object.defineProperty(raw, property, {
          get() {
            throw new Error("SENSITIVE_SENTINEL");
          },
        });
        await expectSafeCursorLoadFailure(raw, "UNKNOWN_FAILURE");
      },
    );
  }

  it("preserves the stage when a proxy has trap throws", async () => {
    const raw = new Proxy(new Error("SENSITIVE_SENTINEL"), {
      has() {
        throw new Error("SENSITIVE_SENTINEL");
      },
    });
    await expectSafeCursorLoadFailure(raw, "UNKNOWN_FAILURE");
  });

  it("preserves the stage when a proxy prototype trap throws", async () => {
    const raw = new Proxy(new Error("SENSITIVE_SENTINEL"), {
      getPrototypeOf() {
        throw new Error("SENSITIVE_SENTINEL");
      },
    });
    await expectSafeCursorLoadFailure(raw, "UNKNOWN_FAILURE");
  });

  it("preserves the stage when the original error is a revoked proxy", async () => {
    const { proxy, revoke } = Proxy.revocable(
      new Error("SENSITIVE_SENTINEL"),
      {},
    );
    revoke();
    await expectSafeCursorLoadFailure(proxy, "UNKNOWN_FAILURE");
  });
  it("reports the observed prepared LIMIT failure safely without advancing the cursor", async () => {
    const save = vi.fn(async () => {});
    const processor = createVerifiedFinancialResultProcessor({
      cursor: { load: async () => null, save },
      feed: {
        listAfter: async () => {
          throw Object.assign(new Error("SENSITIVE_SENTINEL"), {
            code: "ER_WRONG_ARGUMENTS",
            sql: "SENSITIVE_SENTINEL",
          });
        },
      },
      fulfillment: { handle: async () => null },
      refunds: { handle: async () => null },
    });
    let thrown;
    try {
      await processor.drain();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      stage: "feed_list_after",
      diagnosticCode: "ER_WRONG_ARGUMENTS",
      message: "TICKETING_FINANCIAL_PROCESSOR_STAGE_FAILURE",
    });
    expect(JSON.stringify(thrown)).not.toContain("SENSITIVE_SENTINEL");
    expect(thrown).not.toHaveProperty("cause");
    expect(save).not.toHaveBeenCalled();
  });
});

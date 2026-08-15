import { describe, expect, it } from "vitest";

import {
  createLedgerTransaction,
  createMoney,
  createPaymentIdempotencyKey,
  normalizeLedgerTransactionId,
  normalizePaymentId,
  normalizeRefundRequest,
  normalizeVerifiedPaymentResult,
  type FinancialRefundProviderPort,
  type LedgerTransaction,
  type LedgerTransactionRepositoryPort,
  type Payment,
  type PaymentId,
  type PaymentRepositoryPort,
  type ProviderEventId,
  type RefundProviderCommand,
  type RefundRequest,
  type RefundRequestId,
  type RefundRequestRepositoryPort,
  type VerifiedPaymentResult,
  type VerifiedPaymentResultRepositoryPort,
  type VerifiedPaymentTerminalStatus,
} from "@touristic/financial";

import { createRefundApplicationService } from "./refund-application-service.js";
import { verifiedPaymentAccountingExternalKey } from "./verified-payment-accounting-service.js";

function fixtures() {
  const id = normalizePaymentId("pay_refund_service_0001");
  const key = createPaymentIdempotencyKey("ord_refund_service_0001");
  const amount = createMoney(49_900, "BRL");
  if (!id || !key || !amount) throw new Error("FIXTURE_INVALID");
  const payment: Payment = {
    id,
    idempotencyKey: key,
    subject: { kind: "order", reference: "ord_refund_service_0001" },
    amount,
    status: "confirmed",
    providerReference: "sandbox_payment_refund_0001",
    createdAt: "2026-08-15T00:15:00Z",
    updatedAt: "2026-08-15T00:15:01Z",
    confirmedAt: "2026-08-15T00:15:01Z",
    refundedAt: null,
  };
  const approved = normalizeVerifiedPaymentResult({
    resultId: "fev_refund_service_approved_0001",
    providerEventId: "pwe_refund_service_approved_0001",
    paymentId: payment.id,
    orderReference: payment.subject.reference,
    kind: "approved",
    paymentStatus: "confirmed",
    paymentReference: payment.providerReference,
    occurredAt: "2026-08-15T00:15:01Z",
    recordedAt: "2026-08-15T00:15:02Z",
  });
  const ledgerId = normalizeLedgerTransactionId("led_refund_service_0001");
  if (!approved || !ledgerId) throw new Error("FIXTURE_INVALID");
  const ledger = createLedgerTransaction({
    id: ledgerId,
    externalKey: verifiedPaymentAccountingExternalKey(approved),
    occurredAt: approved.occurredAt,
    postings: [
      {
        accountReference: "asset:provider_clearing",
        direction: "debit",
        amount,
      },
      {
        accountReference: "revenue:checkout",
        direction: "credit",
        amount,
      },
    ],
  });
  return { payment, approved, ledger };
}

class MemoryPayments implements PaymentRepositoryPort {
  constructor(public current: Payment | null) {}
  findById(id: PaymentId): Promise<Payment | null> {
    return Promise.resolve(this.current?.id === id ? this.current : null);
  }
  save(value: Payment): Promise<Payment> {
    this.current = value;
    return Promise.resolve(value);
  }
}

class MemoryResults implements VerifiedPaymentResultRepositoryPort {
  constructor(readonly value: VerifiedPaymentResult | null) {}
  findByProviderEventId(
    id: ProviderEventId,
  ): Promise<VerifiedPaymentResult | null> {
    return Promise.resolve(
      this.value?.providerEventId === id ? this.value : null,
    );
  }
  findByPaymentStatus(
    id: PaymentId,
    status: VerifiedPaymentTerminalStatus,
  ): Promise<VerifiedPaymentResult | null> {
    return Promise.resolve(
      this.value?.paymentId === id && this.value.paymentStatus === status
        ? this.value
        : null,
    );
  }
  save(value: VerifiedPaymentResult): Promise<VerifiedPaymentResult> {
    return Promise.resolve(value);
  }
}

class MemoryLedger implements LedgerTransactionRepositoryPort {
  constructor(readonly value: LedgerTransaction | null) {}
  append(): Promise<void> {
    return Promise.resolve();
  }
  findByExternalKey(key: string): Promise<LedgerTransaction | null> {
    return Promise.resolve(this.value?.externalKey === key ? this.value : null);
  }
}

class MemoryRefunds implements RefundRequestRepositoryPort {
  current: RefundRequest | null = null;
  findByPaymentId(id: PaymentId): Promise<RefundRequest | null> {
    return Promise.resolve(
      this.current?.paymentId === id ? this.current : null,
    );
  }
  claim(request: RefundRequest) {
    const claimed = this.current === null;
    if (!this.current) this.current = request;
    return Promise.resolve({ claimed, request: this.current });
  }
  acceptProvider(
    id: RefundRequestId,
    reference: string,
    updatedAt: string,
  ): Promise<RefundRequest> {
    if (!this.current || this.current.id !== id) {
      return Promise.reject(new Error("NOT_FOUND"));
    }
    const value = normalizeRefundRequest({
      ...this.current,
      status: "provider_accepted",
      providerRefundReference: reference,
      updatedAt,
    });
    if (!value) return Promise.reject(new Error("INVALID"));
    this.current = value;
    return Promise.resolve(value);
  }
}

function harness(
  options: {
    payment?: Payment | null;
    approved?: VerifiedPaymentResult | null;
    ledger?: LedgerTransaction | null;
    provider?: FinancialRefundProviderPort;
  } = {},
) {
  const fixture = fixtures();
  const payments = new MemoryPayments(
    options.payment === undefined ? fixture.payment : options.payment,
  );
  const refunds = new MemoryRefunds();
  const calls: RefundProviderCommand[] = [];
  const provider = options.provider ?? {
    requestRefund(command: RefundProviderCommand) {
      calls.push(command);
      return Promise.resolve({
        accepted: true as const,
        providerRefundReference: "sandbox_refund_service_0001",
      });
    },
  };
  let tick = 0;
  const application = createRefundApplicationService({
    payments,
    results: new MemoryResults(
      options.approved === undefined ? fixture.approved : options.approved,
    ),
    ledger: new MemoryLedger(
      options.ledger === undefined ? fixture.ledger : options.ledger,
    ),
    refunds,
    provider,
    clock: {
      now: () =>
        new Date(Date.parse("2026-08-15T00:15:03Z") + tick++).toISOString(),
    },
  });
  return { application, payments, refunds, calls, fixture };
}

describe("M144 durable full-refund application service", () => {
  it("accepts one provider command without mutating Payment", async () => {
    const { application, payments, calls, fixture } = harness();
    await expect(
      application.requestFullRefund(fixture.payment.id),
    ).resolves.toMatchObject({
      status: "AWAITING_VERIFIED_EVENT",
      replayed: false,
      request: {
        status: "provider_accepted",
        idempotencyKey: "refund:v1:pay_refund_service_0001",
      },
    });
    expect(calls).toHaveLength(1);
    expect(payments.current?.status).toBe("confirmed");

    await expect(
      application.requestFullRefund(fixture.payment.id),
    ).resolves.toMatchObject({
      status: "AWAITING_VERIFIED_EVENT",
      replayed: true,
    });
    expect(calls).toHaveLength(1);
  });

  it("retries a claimed request with the same key after uncertainty", async () => {
    let attempt = 0;
    const commands: RefundProviderCommand[] = [];
    const provider: FinancialRefundProviderPort = {
      requestRefund(command) {
        commands.push(command);
        if (++attempt === 1) return Promise.reject(new Error("UNCERTAIN"));
        return Promise.resolve({
          accepted: true,
          providerRefundReference: "sandbox_refund_retry_0001",
        });
      },
    };
    const { application, fixture } = harness({ provider });
    await expect(
      application.requestFullRefund(fixture.payment.id),
    ).rejects.toThrow("UNCERTAIN");
    await expect(
      application.requestFullRefund(fixture.payment.id),
    ).resolves.toMatchObject({ replayed: true });
    expect(commands).toHaveLength(2);
    expect(commands[1]).toEqual(commands[0]);
  });

  it("does not resend an uncertain claim after a verified refund wins the race", async () => {
    const commands: RefundProviderCommand[] = [];
    const provider: FinancialRefundProviderPort = {
      requestRefund(command) {
        commands.push(command);
        return Promise.reject(new Error("UNCERTAIN"));
      },
    };
    const { application, payments, fixture } = harness({ provider });
    await expect(
      application.requestFullRefund(fixture.payment.id),
    ).rejects.toThrow("UNCERTAIN");
    payments.current = {
      ...fixture.payment,
      status: "refunded",
      updatedAt: "2026-08-15T00:15:10Z",
      refundedAt: "2026-08-15T00:15:10Z",
    };

    await expect(
      application.requestFullRefund(fixture.payment.id),
    ).resolves.toMatchObject({
      status: "COMPLETED",
      replayed: true,
      request: { status: "claimed" },
    });
    expect(commands).toHaveLength(1);
  });

  it("reports completion only from verified refunded Payment state", async () => {
    const { application, payments, calls, fixture } = harness();
    await application.requestFullRefund(fixture.payment.id);
    payments.current = {
      ...fixture.payment,
      status: "refunded",
      updatedAt: "2026-08-15T00:15:10Z",
      refundedAt: "2026-08-15T00:15:10Z",
    };
    await expect(
      application.requestFullRefund(fixture.payment.id),
    ).resolves.toMatchObject({ status: "COMPLETED", replayed: true });
    expect(calls).toHaveLength(1);
  });

  it("fails closed without approval ledger or confirmed state", async () => {
    const fixture = fixtures();
    await expect(
      harness({ ledger: null }).application.requestFullRefund(
        fixture.payment.id,
      ),
    ).rejects.toThrow("REFUND_APPROVAL_LEDGER_MISSING");
    await expect(
      harness({
        payment: { ...fixture.payment, status: "failed" },
      }).application.requestFullRefund(fixture.payment.id),
    ).rejects.toThrow("REFUND_NOT_ALLOWED");
  });
});

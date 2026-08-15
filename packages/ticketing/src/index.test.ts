import { describe, expect, it } from "vitest";

import { createMoney, normalizePaymentId } from "@touristic/financial";
import { normalizeOrderId } from "@touristic/ordering";

import {
  applyTicketCheckIn,
  createTicket,
  createTicketCode,
  createTicketOfflineEnvelope,
  createTicketOfflineEnvelopeSignature,
  createTicketQrPayload,
  isTicketTransitionAllowed,
  normalizeTicketSigningSecret,
  verifyTicketOfflineEnvelope,
  verifyTicketQrPayload,
} from "./index.js";

function fixture() {
  const orderId = normalizeOrderId("ord_ticketing_0001");
  const paymentId = normalizePaymentId("pay_ticketing_0001");
  const amount = createMoney(12_500, "BRL");
  const secret = normalizeTicketSigningSecret(
    "ticketing-signing-secret-0001-very-secure",
  );
  if (!orderId || !paymentId || !amount || !secret) {
    throw new Error("FIXTURE_INVALID");
  }
  return { orderId, paymentId, amount, secret };
}

describe("M147 ticketing domain", () => {
  it("creates a canonical issued ticket linked to Ordering and Financial", () => {
    const { orderId, paymentId, amount } = fixture();
    const ticket = createTicket({
      id: "tck_ticketing_0001",
      orderId,
      paymentId,
      destinationId: "morro-de-sao-paulo",
      product: { kind: "tour", reference: "volta-a-ilha" },
      holderName: "Luiz Silva",
      quantity: 2,
      amount,
      code: "ABCD-EFGH-JKLM-NPQR",
      issuedAt: "2026-08-15T10:00:00Z",
    });

    expect(ticket).toMatchObject({
      id: "tck_ticketing_0001",
      status: "issued",
      product: { kind: "tour", reference: "volta-a-ilha" },
      quantity: 2,
    });
  });

  it("signs and verifies a QR payload with HMAC", () => {
    const { secret } = fixture();
    const payload = createTicketQrPayload("tck_ticketing_0001", secret);
    expect(payload).toMatch(/^tck\.v1\.tck_ticketing_0001\.[a-f0-9]{64}$/u);
    expect(verifyTicketQrPayload(payload, secret)).toEqual({
      ticketId: "tck_ticketing_0001",
      signature: payload?.split(".").at(-1),
    });
    expect(
      verifyTicketQrPayload(
        payload?.replace("tck_ticketing_0001", "tck_ticketing_0002"),
        secret,
      ),
    ).toBeNull();
  });

  it("keeps the ticket lifecycle deterministic", () => {
    const { orderId, paymentId, amount } = fixture();
    const issued = createTicket({
      id: "tck_ticketing_0002",
      orderId,
      paymentId,
      destinationId: "morro-de-sao-paulo",
      product: { kind: "tour", reference: "passeio-quadriciclo" },
      holderName: "Maria Souza",
      quantity: 1,
      amount,
      code: "WXYZ-2345-6789-ABCD",
      issuedAt: "2026-08-15T11:00:00Z",
    });
    if (!issued) throw new Error("TICKET_FIXTURE_INVALID");

    const validated = applyTicketCheckIn(issued, {
      result: "validated",
      occurredAt: "2026-08-15T11:30:00Z",
    });
    expect(validated.status).toBe("validated");
    expect(validated.validatedAt).toBe("2026-08-15T11:30:00.000Z");

    const used = applyTicketCheckIn(validated, {
      result: "used",
      occurredAt: "2026-08-15T11:31:00Z",
    });
    expect(used.status).toBe("used");
    expect(used.usedAt).toBe("2026-08-15T11:31:00.000Z");
    expect(isTicketTransitionAllowed("used", "cancelled")).toBe(false);
  });

  it("creates and verifies an offline sync envelope", () => {
    const { secret } = fixture();
    const signature = createTicketOfflineEnvelopeSignature(
      {
        ticketId: "tck_ticketing_0003",
        operation: "validate",
        payload: "tck.v1.tck_ticketing_0003." + "a".repeat(64),
        queuedAt: "2026-08-15T12:00:00Z",
      },
      secret,
    );
    const envelope = createTicketOfflineEnvelope({
      id: "toe_ticketing_0003",
      ticketId: "tck_ticketing_0003",
      operation: "validate",
      payload: "tck.v1.tck_ticketing_0003." + "a".repeat(64),
      signature,
      queuedAt: "2026-08-15T12:00:00Z",
    });
    expect(envelope).not.toBeNull();
    expect(verifyTicketOfflineEnvelope(envelope!, secret)).toEqual(envelope);
    expect(
      verifyTicketOfflineEnvelope({ ...envelope!, operation: "use" }, secret),
    ).toBeNull();
  });

  it("normalizes a human-safe ticket code", () => {
    expect(createTicketCode("abcd efgh jklm npqr")).toBe("ABCD-EFGH-JKLM-NPQR");
    expect(createTicketCode("abcd-efgh-jklm-npqr")).toBe("ABCD-EFGH-JKLM-NPQR");
    expect(createTicketCode("abcd")).toBeNull();
  });
});

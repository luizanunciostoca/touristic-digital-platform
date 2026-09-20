import { createHash } from "node:crypto";

import type { Pool } from "mysql2/promise";
import { describe, expect, it, vi } from "vitest";

import { MySqlTicketingCommerceCrmOutbox } from "./commerce-crm-outbox.js";

function eventId(reservationId: string): string {
  return `tce_${createHash("sha256")
    .update(`ticketing:commerce-crm:purchase-confirmed:v1:${reservationId}`)
    .digest("hex")
    .slice(0, 40)}`;
}

describe("MySqlTicketingCommerceCrmOutbox", () => {
  it("reconciles a confirmed issued reservation when the original outbox write was missed", async () => {
    const reservationId = "trv_reconcile_0001";
    const id = eventId(reservationId);
    const confirmedAt = new Date("2026-09-20T00:00:00.000Z");
    const execute = vi
      .fn()
      .mockResolvedValueOnce([
        [
          {
            reservation_id: reservationId,
            holder_reference: "guest_reconcile",
            inventory_id: "mpi_reconcile_0001",
            order_id: "ord_reconcile_0001",
            payment_id: "pay_reconcile_0001",
            destination_id: "morro-de-sao-paulo",
            product_kind: "business_experience",
            product_reference:
              "morro-pro:toca-do-morcego:place-toca-do-morcego:the-party",
            unit_amount_minor: 8000,
            currency: "BRL",
            quantity: 2,
            confirmed_at: confirmedAt,
          },
        ],
        [],
      ])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([
        [
          {
            event_id: id,
            event_type: "purchase_confirmed",
            reservation_id: reservationId,
            holder_reference: "guest_reconcile",
            inventory_id: "mpi_reconcile_0001",
            order_id: "ord_reconcile_0001",
            payment_id: "pay_reconcile_0001",
            destination_id: "morro-de-sao-paulo",
            product_kind: "business_experience",
            product_reference:
              "morro-pro:toca-do-morcego:place-toca-do-morcego:the-party",
            quantity: 2,
            amount_minor: 16000,
            currency: "BRL",
            occurred_at: confirmedAt,
            published_at: null,
            attempt_count: 0,
            last_error_code: null,
          },
        ],
        [],
      ]);
    const pool = { execute } as unknown as Pool;
    const outbox = new MySqlTicketingCommerceCrmOutbox(pool);

    await expect(
      outbox.reconcileMissingConfirmedPurchases(100),
    ).resolves.toBe(1);

    expect(String(execute.mock.calls[0]?.[0])).toContain(
      "FROM ticketing_tickets AS t",
    );
    expect(String(execute.mock.calls[0]?.[0])).toContain(
      "NOT EXISTS",
    );
    expect(execute.mock.calls[1]?.[1]).toEqual(
      expect.arrayContaining([
        id,
        reservationId,
        "ord_reconcile_0001",
        "pay_reconcile_0001",
        16000,
        "BRL",
      ]),
    );
  });
});

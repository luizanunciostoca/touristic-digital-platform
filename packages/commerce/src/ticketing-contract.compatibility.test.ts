import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { readTicketingInventoryContract } from "./index.js";

const currentTicketingContractSource = readFileSync(
  new URL("../../ticketing/src/reservations.ts", import.meta.url),
  "utf8",
);

describe("current Ticketing inventory contract compatibility", () => {
  it("tracks the current TicketInventoryOffer read contract without importing authority", () => {
    expect(currentTicketingContractSource).toContain(
      "export interface TicketInventoryOffer",
    );
    for (const field of ["id", "destinationId", "product", "label"]) {
      expect(currentTicketingContractSource).toMatch(
        new RegExp(`readonly ${field}:`),
      );
    }

    const compatibleCurrentShape = {
      id: "tin_12345678",
      destinationId: "morro-de-sao-paulo",
      product: {
        kind: "tour",
        reference: "tour:volta-a-ilha",
      },
      label: "Volta a Ilha",
      unitAmount: { minorUnits: 10000, currency: "BRL" },
      pricingVersion: "v1",
      capacity: 20,
      maxPerReservation: 4,
      salesStartAt: "2026-09-01T00:00:00.000Z",
      salesEndAt: "2026-09-30T00:00:00.000Z",
      startsAt: "2026-10-01T12:00:00.000Z",
      endsAt: "2026-10-01T20:00:00.000Z",
      enabled: true,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };

    expect(readTicketingInventoryContract(compatibleCurrentShape)).toEqual({
      inventoryId: "tin_12345678",
      destinationId: "morro-de-sao-paulo",
      product: { kind: "tour", reference: "tour:volta-a-ilha" },
      label: "Volta a Ilha",
    });
  });

  it("does not copy monetary, order, payment, ticket, QR or wallet authority into Commerce Core", () => {
    const commerceSource = readFileSync(
      new URL("./index.ts", import.meta.url),
      "utf8",
    );
    for (const forbidden of [
      "@touristic/financial",
      "@touristic/ordering",
      "paymentId",
      "orderId",
      "unitAmount",
      "pricingVersion",
      "qr",
      "wallet",
      "checkout",
    ]) {
      expect(commerceSource.toLowerCase()).not.toContain(
        forbidden.toLowerCase(),
      );
    }
  });
});

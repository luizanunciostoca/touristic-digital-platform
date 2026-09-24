import { describe, expect, it } from "vitest";

import { resolveTicketedAdmissionOfferings } from "./ticketed-admission-resolver.js";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "tin_party_pista_0001",
    destinationId: "morro-de-sao-paulo",
    product: {
      kind: "business_experience",
      reference: "morro-pro:legacy:the-party",
    },
    label: "The Party · Pista · 1º lote",
    admission: {
      offeringId: "event_the_party_20260926",
      placeId: "place_toca_do_morcego",
      subtype: "party",
      ticketType: "Pista",
      tierLabel: "1º lote",
      displayOrder: 10,
    },
    unitAmount: { minorUnits: 8000, currency: "BRL" },
    pricingVersion: "party-v1",
    maxPerReservation: 8,
    salesStartAt: "2026-09-20T12:00:00.000Z",
    salesEndAt: "2026-09-26T23:00:00.000Z",
    startsAt: "2026-09-27T02:59:00.000Z",
    endsAt: "2026-09-27T09:00:00.000Z",
    availableQuantity: 27,
    sellable: true,
    observedAt: "2026-09-23T20:00:00.000Z",
    ...overrides,
  };
}

describe("ticketed admission resolver", () => {
  it("groups inventory variants by explicit offering and place identity", () => {
    const resolved = resolveTicketedAdmissionOfferings([
      row(),
      row({
        id: "tin_party_vip_0001",
        label: "The Party · VIP · 1º lote",
        admission: {
          offeringId: "event_the_party_20260926",
          placeId: "place_toca_do_morcego",
          subtype: "party",
          ticketType: "VIP",
          tierLabel: "1º lote",
          displayOrder: 20,
        },
        unitAmount: { minorUnits: 12000, currency: "BRL" },
      }),
    ]);

    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.offering.identity).toMatchObject({
      offerId: "event_the_party_20260926",
      placeId: "place_toca_do_morcego",
    });
    expect(resolved[0]?.subtype).toBe("party");
    expect(resolved[0]?.variants.map(({ ticketType }) => ticketType)).toEqual([
      "Pista",
      "VIP",
    ]);
  });

  it("keeps server-owned price, capacity state and sales windows per variant", () => {
    const resolved = resolveTicketedAdmissionOfferings([row()]);
    expect(resolved[0]?.variants[0]).toMatchObject({
      inventoryId: "tin_party_pista_0001",
      unitAmount: { minorUnits: 8000, currency: "BRL" },
      maxPerReservation: 8,
      availableQuantity: 27,
      sellable: true,
      pricingVersion: "party-v1",
    });
  });

  it("ignores legacy business experiences without explicit admission metadata", () => {
    expect(
      resolveTicketedAdmissionOfferings([
        row({ admission: undefined }),
      ]),
    ).toEqual([]);
  });

  it("orders tiers by explicit display order rather than price", () => {
    const resolved = resolveTicketedAdmissionOfferings([
      row({
        id: "tin_party_lote_2",
        admission: {
          offeringId: "event_the_party_20260926",
          placeId: "place_toca_do_morcego",
          subtype: "party",
          ticketType: "Pista",
          tierLabel: "2º lote",
          displayOrder: 20,
        },
        unitAmount: { minorUnits: 9000, currency: "BRL" },
      }),
      row(),
    ]);
    expect(resolved[0]?.variants.map(({ tierLabel }) => tierLabel)).toEqual([
      "1º lote",
      "2º lote",
    ]);
  });
});

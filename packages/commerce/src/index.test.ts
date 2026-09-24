import { describe, expect, it } from "vitest";

import {
  adaptLegacyTicketingInventoryOffer,
  commerceModeForPlaceCategory,
  commerceModeForProductKind,
  offeringMatchesPlace,
} from "./index.js";

describe("Morro Commerce foundation", () => {
  it("maps current Ticketing product kinds without changing Ticketing authority", () => {
    expect(commerceModeForProductKind("business_experience")).toBe(
      "ticketed_admission",
    );
    expect(commerceModeForProductKind("tour")).toBe("activity_reservation");
    expect(commerceModeForProductKind("transport")).toBe("transport_ticket");
    expect(commerceModeForPlaceCategory("restaurants")).toBe(
      "table_reservation",
    );
  });

  it("prefers explicit canonical identity when inventory provides it", () => {
    const resolved = adaptLegacyTicketingInventoryOffer({
      id: "tin_sunset_20260923",
      offerId: "offer_sunset_daily",
      businessId: "business_toca",
      placeId: "place_toca",
      destinationId: "morro-de-sao-paulo",
      product: {
        kind: "business_experience",
        reference: "morro-pro:toca-do-morcego:sunset",
      },
      label: "Sunset · Toca do Morcego",
    });
    expect(resolved?.identitySource).toBe("explicit");
    expect(resolved?.offering.identity).toMatchObject({
      offerId: "offer_sunset_daily",
      businessId: "business_toca",
      placeId: "place_toca",
      inventoryId: "tin_sunset_20260923",
    });
    expect(resolved?.offering.context).toBe("sunset");
  });

  it("uses admission metadata as the canonical identity for ticketed admission", () => {
    const resolved = adaptLegacyTicketingInventoryOffer({
      id: "tin_party_20260926",
      destinationId: "morro-de-sao-paulo",
      product: {
        kind: "business_experience",
        reference: "morro-pro:legacy-business:place-legacy-place:sunset",
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
    });
    expect(resolved?.identitySource).toBe("explicit");
    expect(resolved?.offering.identity.offerId).toBe(
      "event_the_party_20260926",
    );
    expect(resolved?.offering.identity.placeId).toBe(
      "place_toca_do_morcego",
    );
    expect(resolved?.offering.context).toBe("party");
  });

  it("keeps legacy reference parsing as an explicit compatibility source", () => {
    const resolved = adaptLegacyTicketingInventoryOffer({
      id: "tin_party_20260926",
      destinationId: "morro-de-sao-paulo",
      product: {
        kind: "business_experience",
        reference: "morro-pro:toca-do-morcego:the-party",
      },
      label: "The Party · Toca do Morcego",
    });
    expect(resolved?.identitySource).toBe("legacy_reference");
    expect(resolved?.offering.identity.businessId).toBe("toca-do-morcego");
    expect(resolved?.offering.identity.placeId).toBeNull();
    expect(resolved?.offering.context).toBe("party");
  });

  it("uses exact canonical identifiers before any compatibility heuristic", () => {
    const resolved = adaptLegacyTicketingInventoryOffer({
      id: "tin_tour_0001",
      destinationId: "morro-de-sao-paulo",
      placeId: "place_garapua",
      product: { kind: "tour", reference: "tour:garapua" },
      label: "Garapuá",
    });
    expect(resolved).not.toBeNull();
    expect(
      resolved &&
        offeringMatchesPlace(resolved.offering, { id: "place_garapua" }),
    ).toBe(true);
    expect(
      resolved &&
        offeringMatchesPlace(resolved.offering, { id: "place_other" }),
    ).toBe(false);
  });

  it("rejects malformed inventory instead of inventing commercial identity", () => {
    expect(
      adaptLegacyTicketingInventoryOffer({
        id: "x",
        destinationId: "morro-de-sao-paulo",
        product: { kind: "business_experience", reference: "sunset" },
        label: "Sunset",
      }),
    ).toBeNull();
  });
});

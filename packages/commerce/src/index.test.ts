import { describe, expect, it } from "vitest";

import {
  adaptTicketingInventoryOffer,
  commerceModeForPlaceCategory,
  commerceModeForProductKind,
  createCommerceOfferingIdentity,
  offeringMatchesCanonicalPlace,
  readTicketingInventoryContract,
} from "./index.js";

const inventory = Object.freeze({
  id: "tin_12345678",
  destinationId: "morro-de-sao-paulo",
  product: Object.freeze({
    kind: "business_experience",
    reference: "morro-pro:toca-do-morcego:sunset",
  }),
  label: "Sunset · Toca do Morcego",
});

describe("CommerceMode", () => {
  it("maps current domain modes without introducing a checkout flow", () => {
    expect(commerceModeForProductKind("business_experience")).toBe(
      "ticketed_admission",
    );
    expect(commerceModeForProductKind("tour")).toBe("activity_reservation");
    expect(commerceModeForProductKind("transport")).toBe("transport_ticket");
    expect(commerceModeForPlaceCategory("restaurants")).toBe(
      "table_reservation",
    );
    expect(commerceModeForProductKind("restaurant")).toBeNull();
  });
});

describe("canonical commerce identity", () => {
  it("creates explicit offering/destination/business/place/inventory identity", () => {
    expect(
      createCommerceOfferingIdentity({
        offeringId: "offer_sunset_daily",
        destinationId: "morro-de-sao-paulo",
        businessId: "business_toca",
        placeId: "place_toca",
        inventoryId: "tin_12345678",
      }),
    ).toEqual({
      offeringId: "offer_sunset_daily",
      destinationId: "morro-de-sao-paulo",
      businessId: "business_toca",
      placeId: "place_toca",
      inventoryId: "tin_12345678",
    });
  });

  it("rejects incomplete or malformed primary identity", () => {
    expect(
      createCommerceOfferingIdentity({
        offeringId: "",
        destinationId: "morro-de-sao-paulo",
      }),
    ).toBeNull();
    expect(
      createCommerceOfferingIdentity({
        offeringId: "offer_sunset_daily",
        destinationId: "",
      }),
    ).toBeNull();
    expect(
      createCommerceOfferingIdentity({
        offeringId: "offer_sunset_daily",
        destinationId: "morro-de-sao-paulo",
        placeId: " ",
      }),
    ).toBeNull();
  });
});

describe("Ticketing/Inventory compatibility boundary", () => {
  it("reads only the existing inventory contract needed for orchestration", () => {
    expect(readTicketingInventoryContract(inventory)).toEqual({
      inventoryId: "tin_12345678",
      destinationId: "morro-de-sao-paulo",
      product: {
        kind: "business_experience",
        reference: "morro-pro:toca-do-morcego:sunset",
      },
      label: "Sunset · Toca do Morcego",
    });
  });

  it("requires an explicit canonical binding and never derives primary identity from reference", () => {
    const offering = adaptTicketingInventoryOffer(inventory, {
      offeringId: "offer_sunset_daily",
      destinationId: "morro-de-sao-paulo",
      businessId: "business_toca",
      placeId: "place_toca",
    });

    expect(offering?.identity).toEqual({
      offeringId: "offer_sunset_daily",
      destinationId: "morro-de-sao-paulo",
      businessId: "business_toca",
      placeId: "place_toca",
      inventoryId: "tin_12345678",
    });
    expect(offering?.product.reference).toBe(
      "morro-pro:toca-do-morcego:sunset",
    );
  });

  it("rejects incomplete or contradictory bindings", () => {
    expect(
      adaptTicketingInventoryOffer(inventory, {
        offeringId: "",
        destinationId: "morro-de-sao-paulo",
      }),
    ).toBeNull();
    expect(
      adaptTicketingInventoryOffer(inventory, {
        offeringId: "offer_sunset_daily",
        destinationId: "another-destination",
      }),
    ).toBeNull();
  });

  it("matches places only by exact canonical place/business ids", () => {
    const offering = adaptTicketingInventoryOffer(inventory, {
      offeringId: "offer_sunset_daily",
      destinationId: "morro-de-sao-paulo",
      businessId: "business_toca",
      placeId: "place_toca",
    });
    expect(offering).not.toBeNull();
    if (!offering) return;

    expect(
      offeringMatchesCanonicalPlace(offering, { placeId: "place_toca" }),
    ).toBe(true);
    expect(
      offeringMatchesCanonicalPlace(offering, {
        businessId: "business_toca",
      }),
    ).toBe(true);
    expect(
      offeringMatchesCanonicalPlace(offering, {
        placeId: "toca-do-morcego",
      }),
    ).toBe(false);
    expect(
      offeringMatchesCanonicalPlace(offering, {
        businessId: "morro-pro:toca-do-morcego:sunset",
      }),
    ).toBe(false);
  });
});

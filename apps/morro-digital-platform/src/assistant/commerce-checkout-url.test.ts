import { describe, expect, it } from "vitest";

import { commerceCheckoutUrl } from "./browser-assistant-runtime.js";

describe("commerce action URL translation", () => {
  it("routes a canonical restaurant offering to Morro Commerce", () => {
    expect(
      commerceCheckoutUrl(
        "commerce:restaurant:business_restaurante_0001:place_restaurante_0001",
      ),
    ).toBe(
      "/commerce.html?mode=table_reservation&businessId=business_restaurante_0001&placeId=place_restaurante_0001&source=map",
    );
  });

  it("routes a canonical restaurant place to the Commerce selector", () => {
    expect(
      commerceCheckoutUrl(
        "commerce:restaurant-place:place_restaurante_0001",
      ),
    ).toBe(
      "/commerce.html?mode=table_reservation&placeId=place_restaurante_0001&source=map",
    );
  });

  it("preserves legacy Ticketing commerce routes", () => {
    expect(commerceCheckoutUrl("commerce:offer:mpi_12345678")).toBe(
      "/tickets.html?offer=mpi_12345678&source=map",
    );
    expect(
      commerceCheckoutUrl("commerce:offers:mpi_12345678,mpi_87654321"),
    ).toBe(
      "/tickets.html?offers=mpi_12345678,mpi_87654321&source=map",
    );
    expect(commerceCheckoutUrl("commerce:place:toca-do-morcego")).toBe(
      "/tickets.html?place=toca-do-morcego&source=map",
    );
  });

  it("rejects malformed tenant and place identities", () => {
    expect(
      commerceCheckoutUrl("commerce:restaurant:../admin:place_0001"),
    ).toBeNull();
    expect(
      commerceCheckoutUrl("commerce:restaurant:business_a:../place"),
    ).toBeNull();
  });
});

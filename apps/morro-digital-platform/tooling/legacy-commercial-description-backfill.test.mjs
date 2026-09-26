import { describe, expect, it, vi } from "vitest";

import {
  assessLegacyCommercialDescriptionBackfill,
  bootstrapLegacyCommercialDescription,
} from "./legacy-commercial-description-backfill-core.mjs";
import { runLegacyCommercialDescriptionBackfill } from "./legacy-commercial-description-backfill.mjs";

function rows(description = "") {
  const categories = ["hotels", "restaurants", "nightlife", "shops"];
  return Array.from({ length: 72 }, (_, index) => {
    const categoryId = categories[index % categories.length];
    const businessId = `business-${index}`;
    const placeId = `place-${index}`;
    return {
      source_system: "morro-v1-search-catalog",
      source_key: `source-${index}`,
      business_id: businessId,
      place_id: placeId,
      destination_id: "morro-de-sao-paulo",
      category_id: categoryId,
      publication_state: "draft",
      published_revision: null,
      editable_place_json: JSON.stringify({
        id: placeId,
        businessId,
        destinationId: "morro-de-sao-paulo",
        name: `Place ${index}`,
        description:
          typeof description === "function"
            ? description(index, categoryId)
            : description,
      }),
    };
  });
}

describe("legacy commercial description backfill", () => {
  it("builds factual deterministic descriptions from canonical facts", () => {
    expect(
      bootstrapLegacyCommercialDescription({
        name: "Toca do Morcego",
        categoryId: "nightlife",
        destinationId: "morro-de-sao-paulo",
      }),
    ).toBe(
      "Toca do Morcego é um local de vida noturna cadastrado em Morro de São Paulo.",
    );
  });

  it("dry-runs all empty descriptions without mutations", () => {
    expect(assessLegacyCommercialDescriptionBackfill(rows())).toEqual({
      total: 72,
      wouldUpdate: 72,
      existingBootstrap: 0,
      preserveCustom: 0,
    });
  });

  it("preserves custom content and recognizes bootstrap idempotently", () => {
    const input = rows((index, categoryId) =>
      index === 0
        ? "Descrição editorial existente."
        : bootstrapLegacyCommercialDescription({
            name: `Place ${index}`,
            categoryId,
            destinationId: "morro-de-sao-paulo",
          }),
    );
    expect(assessLegacyCommercialDescriptionBackfill(input)).toEqual({
      total: 72,
      wouldUpdate: 0,
      existingBootstrap: 71,
      preserveCustom: 1,
    });
  });

  it("fails closed outside canonical staging", async () => {
    await expect(
      runLegacyCommercialDescriptionBackfill({
        environment: {
          RENDER_SERVICE_NAME: "morro-digital-v2",
          BUSINESS_DATABASE_URL: "mysql://business",
        },
        mysqlClient: { createPool: vi.fn() },
      }),
    ).rejects.toThrow(/LEGACY_DESCRIPTION_BACKFILL_SERVICE_DENIED/u);
  });
});

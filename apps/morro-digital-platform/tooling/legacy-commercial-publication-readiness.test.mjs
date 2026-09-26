import { describe, expect, it, vi } from "vitest";

import { assessLegacyCommercialPublicationReadiness } from "./legacy-commercial-publication-readiness-core.mjs";
import { runLegacyCommercialPublicationReadinessAudit } from "./legacy-commercial-publication-readiness.mjs";

function fixtures({ description = "", publishedRevision = null } = {}) {
  const rows = [];
  const markers = [];
  for (let index = 0; index < 72; index += 1) {
    const sourceKey = `source-${index}`;
    const placeId = `place-${index}`;
    const businessId = `business-${index}`;
    rows.push({
      source_system: "morro-v1-search-catalog",
      source_key: sourceKey,
      business_id: businessId,
      place_id: placeId,
      destination_id: "morro-de-sao-paulo",
      category_id: "hotels",
      publication_state: "draft",
      published_revision: publishedRevision,
      editable_revision_json: JSON.stringify({
        placeId,
        businessId,
        destinationId: "morro-de-sao-paulo",
        name: `Place ${index}`,
        categoryId: "hotels",
        description,
        location: { latitude: -13.38, longitude: -38.91 },
        capabilities: { enabled: ["directions", "photos"] },
        visibility: "public",
        openingHoursPresent: false,
        contactPresent: false,
        menuPresent: false,
      }),
    });
    markers.push({
      source_system: "morro-v1-search-catalog",
      source_key: sourceKey,
      business_id: businessId,
      place_id: placeId,
      disposition: index < 6 ? "migrate" : "intentional_no_image",
      asset_count: index < 6 ? 3 : 0,
    });
  }
  return { rows, markers };
}

describe("legacy commercial publication readiness", () => {
  it("reports empty descriptions as the only required blocker", () => {
    const { rows, markers } = fixtures();
    const result = assessLegacyCommercialPublicationReadiness(rows, markers);
    expect(result).toEqual({
      total: 72,
      readyForReview: 0,
      blocked: 72,
      publicationStateCounts: { draft: 72 },
      requiredIssueCounts: { DESCRIPTION_REQUIRED: 72 },
      recommendedIssueCounts: {
        COVER_RECOMMENDED: 72,
        HOURS_RECOMMENDED: 72,
        CONTACT_RECOMMENDED: 72,
      },
      media: {
        migrate: 6,
        intentionalNoImage: 66,
        assetCount: 18,
      },
    });
  });

  it("reports all rows ready when required fields are complete", () => {
    const { rows, markers } = fixtures({ description: "Descrição válida" });
    const result = assessLegacyCommercialPublicationReadiness(rows, markers);
    expect(result.readyForReview).toBe(72);
    expect(result.blocked).toBe(0);
    expect(result.requiredIssueCounts).toEqual({});
  });

  it("fails closed if a legacy draft already has a published revision", () => {
    const { rows, markers } = fixtures({ publishedRevision: 1 });
    expect(() =>
      assessLegacyCommercialPublicationReadiness(rows, markers),
    ).toThrow(/LEGACY_PUBLICATION_READINESS_UNEXPECTED_PUBLISHED_REVISION/u);
  });

  it("denies database audit outside canonical staging", async () => {
    await expect(
      runLegacyCommercialPublicationReadinessAudit({
        environment: {
          RENDER_SERVICE_NAME: "morro-digital-v2",
          BUSINESS_DATABASE_URL: "mysql://business",
          CONTENT_DATABASE_URL: "mysql://content",
        },
        mysqlClient: { createPool: vi.fn() },
      }),
    ).rejects.toThrow(/LEGACY_PUBLICATION_READINESS_SERVICE_DENIED/u);
  });
});

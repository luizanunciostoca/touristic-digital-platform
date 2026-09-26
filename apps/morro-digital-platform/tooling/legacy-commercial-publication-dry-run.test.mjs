import { describe, expect, it, vi } from "vitest";

import {
  assessLegacyCommercialPublicationDryRun,
  runLegacyCommercialPublicationDryRun,
} from "./legacy-commercial-publication-dry-run.mjs";

function rows() {
  return Array.from({ length: 72 }, (_, index) => ({
    source_system: "morro-v1-search-catalog",
    source_key: `source-${index}`,
    business_id: `business-${index}`,
    place_id: `place-${index}`,
    destination_id: "morro-de-sao-paulo",
    publication_state: "review",
    editable_revision: 3,
    published_revision: null,
    review_marker_source_key: `source-${index}`,
    review_marker_business_id: `business-${index}`,
    review_marker_place_id: `place-${index}`,
    review_marker_revision: 3,
  }));
}

describe("legacy commercial publication dry run", () => {
  it("reports all 72 exact reviewed revisions as publish candidates", () => {
    expect(assessLegacyCommercialPublicationDryRun(rows())).toEqual({
      total: 72,
      wouldPublish: 72,
      existingPublished: 0,
      publicationStateCounts: { review: 72 },
    });
  });

  it("fails closed if a Place has already been published", () => {
    const input = rows();
    input[0].publication_state = "published";
    input[0].published_revision = 3;
    expect(() => assessLegacyCommercialPublicationDryRun(input)).toThrow(
      /LEGACY_PUBLICATION_DRY_RUN_STATE_INVALID/u,
    );
  });

  it("fails closed if review marker revision is stale", () => {
    const input = rows();
    input[0].review_marker_revision = 2;
    expect(() => assessLegacyCommercialPublicationDryRun(input)).toThrow(
      /LEGACY_PUBLICATION_DRY_RUN_REVIEW_REVISION_DRIFT/u,
    );
  });

  it("fails closed if review provenance identity drifts", () => {
    const input = rows();
    input[0].review_marker_place_id = "other-place";
    expect(() => assessLegacyCommercialPublicationDryRun(input)).toThrow(
      /LEGACY_PUBLICATION_DRY_RUN_REVIEW_MARKER_DRIFT/u,
    );
  });

  it("denies execution outside canonical staging", async () => {
    await expect(
      runLegacyCommercialPublicationDryRun({
        environment: {
          RENDER_SERVICE_NAME: "morro-digital-v2",
          BUSINESS_DATABASE_URL: "mysql://business",
        },
        mysqlClient: { createPool: vi.fn() },
      }),
    ).rejects.toThrow(/LEGACY_PUBLICATION_DRY_RUN_SERVICE_DENIED/u);
  });
});

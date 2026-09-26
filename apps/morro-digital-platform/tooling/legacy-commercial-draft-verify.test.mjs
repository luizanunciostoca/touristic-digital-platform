import { describe, expect, it, vi } from "vitest";

import { verifyLegacyCommercialDraftBackfill } from "./legacy-commercial-draft-verify-core.mjs";
import { runLegacyCommercialDraftVerify } from "./legacy-commercial-draft-verify.mjs";

function poolFor(lifecycleRow, markerRow = null) {
  let call = 0;
  return {
    execute: vi.fn(async () => {
      call += 1;
      if (call === 1) return [[lifecycleRow], []];
      if (markerRow) return [[markerRow], []];
      const error = new Error("missing review marker table");
      error.code = "ER_NO_SUCH_TABLE";
      throw error;
    }),
    end: vi.fn(async () => {}),
  };
}

const draftHealthy = Object.freeze({
  mapping_count: 72,
  place_count: 72,
  business_count: 72,
  destination_link_count: 72,
  draft_count: 72,
  review_count: 0,
  published_revision_count: 0,
  invalid_state_count: 0,
  missing_place_count: 0,
  missing_business_count: 0,
  missing_destination_link_count: 0,
  identity_conflict_count: 0,
});

const reviewMarkers = Object.freeze({
  review_marker_count: 72,
  marker_review_count: 72,
  marker_pending_count: 0,
  marker_drift_count: 0,
});

describe("legacy commercial lifecycle verifier", () => {
  it("accepts exactly 72 canonical drafts before review migration", async () => {
    const pool = poolFor(draftHealthy);
    await expect(
      verifyLegacyCommercialDraftBackfill({ pool }),
    ).resolves.toEqual({
      mappingCount: 72,
      placeCount: 72,
      businessCount: 72,
      destinationLinkCount: 72,
      draftCount: 72,
      reviewCount: 0,
      publishedRevisionCount: 0,
      invalidStateCount: 0,
      missingPlaceCount: 0,
      missingBusinessCount: 0,
      missingDestinationLinkCount: 0,
      identityConflictCount: 0,
      reviewMarkerCount: 0,
      markerReviewCount: 0,
      markerPendingCount: 0,
      markerDriftCount: 0,
    });
  });

  it("accepts exactly 72 governed reviews after migration", async () => {
    const pool = poolFor(
      {
        ...draftHealthy,
        draft_count: 0,
        review_count: 72,
      },
      reviewMarkers,
    );
    await expect(
      verifyLegacyCommercialDraftBackfill({ pool }),
    ).resolves.toMatchObject({
      draftCount: 0,
      reviewCount: 72,
      publishedRevisionCount: 0,
      reviewMarkerCount: 72,
      markerReviewCount: 72,
      markerPendingCount: 0,
      markerDriftCount: 0,
    });
  });

  it("allows a recoverable partial review transition", async () => {
    const pool = poolFor(
      {
        ...draftHealthy,
        draft_count: 47,
        review_count: 25,
      },
      {
        review_marker_count: 26,
        marker_review_count: 25,
        marker_pending_count: 1,
        marker_drift_count: 0,
      },
    );
    await expect(
      verifyLegacyCommercialDraftBackfill({ pool }),
    ).resolves.toMatchObject({
      draftCount: 47,
      reviewCount: 25,
      reviewMarkerCount: 26,
      markerReviewCount: 25,
      markerPendingCount: 1,
    });
  });

  it("fails closed when any mapped Place is missing", async () => {
    const pool = poolFor({
      ...draftHealthy,
      place_count: 71,
      draft_count: 71,
      missing_place_count: 1,
    });
    await expect(verifyLegacyCommercialDraftBackfill({ pool })).rejects.toThrow(
      /LEGACY_COMMERCIAL_DRAFT_VERIFY_CANONICAL_COUNT/u,
    );
  });

  it("fails closed if a mapped Place becomes published", async () => {
    const pool = poolFor({
      ...draftHealthy,
      draft_count: 71,
      published_revision_count: 1,
    });
    await expect(verifyLegacyCommercialDraftBackfill({ pool })).rejects.toThrow(
      /LEGACY_COMMERCIAL_DRAFT_VERIFY_INVARIANT/u,
    );
  });

  it("fails closed if review state is not backed by review markers", async () => {
    const pool = poolFor(
      {
        ...draftHealthy,
        draft_count: 71,
        review_count: 1,
      },
      {
        review_marker_count: 0,
        marker_review_count: 0,
        marker_pending_count: 0,
        marker_drift_count: 0,
      },
    );
    await expect(verifyLegacyCommercialDraftBackfill({ pool })).rejects.toThrow(
      /LEGACY_COMMERCIAL_DRAFT_VERIFY_REVIEW_MARKER_INVARIANT/u,
    );
  });

  it("denies execution outside canonical staging", async () => {
    await expect(
      runLegacyCommercialDraftVerify({
        environment: { RENDER_SERVICE_NAME: "morro-digital-v2" },
        mysqlClient: { createPool: vi.fn() },
      }),
    ).rejects.toThrow(/LEGACY_COMMERCIAL_DRAFT_VERIFY_SERVICE_DENIED/u);
  });
});

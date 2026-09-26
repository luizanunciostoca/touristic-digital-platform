import { describe, expect, it, vi } from "vitest";

import { verifyLegacyCommercialDraftBackfill } from "./legacy-commercial-draft-verify-core.mjs";
import { runLegacyCommercialDraftVerify } from "./legacy-commercial-draft-verify.mjs";

function missingTableError(message) {
  const error = new Error(message);
  error.code = "ER_NO_SUCH_TABLE";
  return error;
}

function poolFor(
  lifecycleRow,
  reviewMarkerRow = null,
  publicationMarkerRow = null,
) {
  let call = 0;
  return {
    execute: vi.fn(async () => {
      call += 1;
      if (call === 1) return [[lifecycleRow], []];
      if (call === 2) {
        if (reviewMarkerRow) return [[reviewMarkerRow], []];
        throw missingTableError("missing review marker table");
      }
      if (call === 3) {
        if (publicationMarkerRow) return [[publicationMarkerRow], []];
        throw missingTableError("missing publication marker table");
      }
      return [[], []];
    }),
    end: vi.fn(async () => {}),
  };
}

const lifecycleBase = Object.freeze({
  mapping_count: 72,
  place_count: 72,
  business_count: 72,
  destination_link_count: 72,
  draft_count: 72,
  review_count: 0,
  published_state_count: 0,
  suspended_state_count: 0,
  archived_state_count: 0,
  post_publish_edit_state_count: 0,
  published_revision_count: 0,
  published_state_missing_revision_count: 0,
  invalid_state_count: 0,
  missing_place_count: 0,
  missing_business_count: 0,
  missing_destination_link_count: 0,
  identity_conflict_count: 0,
  published_catalog_snapshot_count: 0,
  published_media_snapshot_count: 0,
});

const reviewMarkers72 = Object.freeze({
  review_marker_count: 72,
  marker_review_count: 72,
  marker_pending_count: 0,
  marker_published_count: 0,
  marker_drift_count: 0,
});

const publicationMarkersZero = Object.freeze({
  publication_marker_count: 0,
  publication_marker_published_count: 0,
  publication_marker_pending_count: 0,
  publication_marker_drift_count: 0,
});

describe("legacy commercial lifecycle verifier", () => {
  it("accepts exactly 72 canonical drafts before review migration", async () => {
    const pool = poolFor(lifecycleBase);
    await expect(
      verifyLegacyCommercialDraftBackfill({ pool }),
    ).resolves.toMatchObject({
      mappingCount: 72,
      placeCount: 72,
      businessCount: 72,
      destinationLinkCount: 72,
      draftCount: 72,
      reviewCount: 0,
      publishedRevisionCount: 0,
      reviewMarkerCount: 0,
      publicationMarkerCount: 0,
    });
  });

  it("accepts exactly 72 governed reviews before publication", async () => {
    const pool = poolFor(
      {
        ...lifecycleBase,
        draft_count: 0,
        review_count: 72,
      },
      reviewMarkers72,
      publicationMarkersZero,
    );
    await expect(
      verifyLegacyCommercialDraftBackfill({ pool }),
    ).resolves.toMatchObject({
      draftCount: 0,
      reviewCount: 72,
      publishedRevisionCount: 0,
      reviewMarkerCount: 72,
      markerReviewCount: 72,
      publicationMarkerCount: 0,
    });
  });

  it("allows a recoverable partial review transition", async () => {
    const pool = poolFor(
      {
        ...lifecycleBase,
        draft_count: 47,
        review_count: 25,
      },
      {
        review_marker_count: 26,
        marker_review_count: 25,
        marker_pending_count: 1,
        marker_published_count: 0,
        marker_drift_count: 0,
      },
      publicationMarkersZero,
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

  it("accepts the certified state after one publication canary", async () => {
    const pool = poolFor(
      {
        ...lifecycleBase,
        draft_count: 0,
        review_count: 71,
        published_state_count: 1,
        published_revision_count: 1,
        published_catalog_snapshot_count: 1,
        published_media_snapshot_count: 1,
      },
      {
        review_marker_count: 72,
        marker_review_count: 71,
        marker_pending_count: 0,
        marker_published_count: 1,
        marker_drift_count: 0,
      },
      {
        publication_marker_count: 1,
        publication_marker_published_count: 1,
        publication_marker_pending_count: 0,
        publication_marker_drift_count: 0,
      },
    );

    await expect(
      verifyLegacyCommercialDraftBackfill({ pool }),
    ).resolves.toMatchObject({
      reviewCount: 71,
      publishedStateCount: 1,
      publishedRevisionCount: 1,
      publishedCatalogSnapshotCount: 1,
      publishedMediaSnapshotCount: 1,
      markerPublishedCount: 1,
      publicationMarkerPublishedCount: 1,
    });
  });

  it("allows a recoverable publication marker pending before transition", async () => {
    const pool = poolFor(
      {
        ...lifecycleBase,
        draft_count: 0,
        review_count: 71,
        published_state_count: 1,
        published_revision_count: 1,
        published_catalog_snapshot_count: 1,
        published_media_snapshot_count: 1,
      },
      {
        review_marker_count: 72,
        marker_review_count: 71,
        marker_pending_count: 0,
        marker_published_count: 1,
        marker_drift_count: 0,
      },
      {
        publication_marker_count: 2,
        publication_marker_published_count: 1,
        publication_marker_pending_count: 1,
        publication_marker_drift_count: 0,
      },
    );

    await expect(
      verifyLegacyCommercialDraftBackfill({ pool }),
    ).resolves.toMatchObject({
      publishedRevisionCount: 1,
      publicationMarkerCount: 2,
      publicationMarkerPublishedCount: 1,
      publicationMarkerPendingCount: 1,
    });
  });

  it("accepts the fully published 72-member cohort", async () => {
    const pool = poolFor(
      {
        ...lifecycleBase,
        draft_count: 0,
        published_state_count: 72,
        published_revision_count: 72,
        published_catalog_snapshot_count: 72,
        published_media_snapshot_count: 72,
      },
      {
        review_marker_count: 72,
        marker_review_count: 0,
        marker_pending_count: 0,
        marker_published_count: 72,
        marker_drift_count: 0,
      },
      {
        publication_marker_count: 72,
        publication_marker_published_count: 72,
        publication_marker_pending_count: 0,
        publication_marker_drift_count: 0,
      },
    );

    await expect(
      verifyLegacyCommercialDraftBackfill({ pool }),
    ).resolves.toMatchObject({
      publishedStateCount: 72,
      publishedRevisionCount: 72,
      publishedCatalogSnapshotCount: 72,
      publishedMediaSnapshotCount: 72,
      publicationMarkerPublishedCount: 72,
    });
  });

  it("accepts suspension while preserving the published revision", async () => {
    const pool = poolFor(
      {
        ...lifecycleBase,
        draft_count: 0,
        review_count: 71,
        suspended_state_count: 1,
        published_revision_count: 1,
        published_catalog_snapshot_count: 1,
        published_media_snapshot_count: 1,
      },
      {
        review_marker_count: 72,
        marker_review_count: 71,
        marker_pending_count: 0,
        marker_published_count: 1,
        marker_drift_count: 0,
      },
      {
        publication_marker_count: 1,
        publication_marker_published_count: 1,
        publication_marker_pending_count: 0,
        publication_marker_drift_count: 0,
      },
    );

    await expect(
      verifyLegacyCommercialDraftBackfill({ pool }),
    ).resolves.toMatchObject({
      suspendedStateCount: 1,
      publishedRevisionCount: 1,
    });
  });

  it("fails closed when a published revision is missing a snapshot", async () => {
    const pool = poolFor(
      {
        ...lifecycleBase,
        draft_count: 0,
        review_count: 71,
        published_state_count: 1,
        published_revision_count: 1,
        published_catalog_snapshot_count: 1,
        published_media_snapshot_count: 0,
      },
      {
        review_marker_count: 72,
        marker_review_count: 71,
        marker_pending_count: 0,
        marker_published_count: 1,
        marker_drift_count: 0,
      },
      {
        publication_marker_count: 1,
        publication_marker_published_count: 1,
        publication_marker_pending_count: 0,
        publication_marker_drift_count: 0,
      },
    );

    await expect(verifyLegacyCommercialDraftBackfill({ pool })).rejects.toThrow(
      /LEGACY_COMMERCIAL_DRAFT_VERIFY_SNAPSHOT_INVARIANT/u,
    );
  });

  it("fails closed when a published revision is not publication-marker owned", async () => {
    const pool = poolFor(
      {
        ...lifecycleBase,
        draft_count: 0,
        review_count: 71,
        published_state_count: 1,
        published_revision_count: 1,
        published_catalog_snapshot_count: 1,
        published_media_snapshot_count: 1,
      },
      {
        review_marker_count: 72,
        marker_review_count: 71,
        marker_pending_count: 0,
        marker_published_count: 1,
        marker_drift_count: 0,
      },
      publicationMarkersZero,
    );

    await expect(verifyLegacyCommercialDraftBackfill({ pool })).rejects.toThrow(
      /LEGACY_COMMERCIAL_DRAFT_VERIFY_PUBLICATION_MARKER_INVARIANT/u,
    );
  });

  it("fails closed when any mapped Place is missing", async () => {
    const pool = poolFor({
      ...lifecycleBase,
      place_count: 71,
      draft_count: 71,
      missing_place_count: 1,
    });
    await expect(verifyLegacyCommercialDraftBackfill({ pool })).rejects.toThrow(
      /LEGACY_COMMERCIAL_DRAFT_VERIFY_CANONICAL_COUNT/u,
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

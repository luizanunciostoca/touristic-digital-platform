import { describe, expect, it, vi } from "vitest";

import { verifyLegacyCommercialDraftBackfill } from "./legacy-commercial-draft-verify-core.mjs";
import { runLegacyCommercialDraftVerify } from "./legacy-commercial-draft-verify.mjs";

function poolFor(row) {
  return {
    execute: vi.fn(async () => [[row], []]),
    end: vi.fn(async () => {}),
  };
}

const healthy = Object.freeze({
  mapping_count: 72,
  place_count: 72,
  business_count: 72,
  destination_link_count: 72,
  draft_count: 72,
  non_draft_count: 0,
  missing_place_count: 0,
  missing_business_count: 0,
  missing_destination_link_count: 0,
  identity_conflict_count: 0,
});

describe("legacy commercial draft verifier", () => {
  it("accepts exactly 72 canonical draft identities", async () => {
    const pool = poolFor(healthy);
    await expect(
      verifyLegacyCommercialDraftBackfill({ pool }),
    ).resolves.toEqual({
      mappingCount: 72,
      placeCount: 72,
      businessCount: 72,
      destinationLinkCount: 72,
      draftCount: 72,
      nonDraftCount: 0,
      missingPlaceCount: 0,
      missingBusinessCount: 0,
      missingDestinationLinkCount: 0,
      identityConflictCount: 0,
    });
  });

  it("fails closed when any mapped Place is missing", async () => {
    const pool = poolFor({
      ...healthy,
      place_count: 71,
      draft_count: 71,
      missing_place_count: 1,
    });
    await expect(verifyLegacyCommercialDraftBackfill({ pool })).rejects.toThrow(
      /LEGACY_COMMERCIAL_DRAFT_VERIFY_CANONICAL_COUNT/u,
    );
  });

  it("fails closed if a mapped Place is published", async () => {
    const pool = poolFor({
      ...healthy,
      draft_count: 71,
      non_draft_count: 1,
    });
    await expect(verifyLegacyCommercialDraftBackfill({ pool })).rejects.toThrow(
      /LEGACY_COMMERCIAL_DRAFT_VERIFY_INVARIANT/u,
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

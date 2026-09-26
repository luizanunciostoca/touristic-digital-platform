import { describe, expect, it, vi } from "vitest";

import { assessLegacyCommercialCutover } from "./legacy-commercial-cutover-audit-core.mjs";
import { runLegacyCommercialCutoverAudit } from "./legacy-commercial-cutover-audit.mjs";

function fixtures() {
  const rows = Array.from({ length: 72 }, (_, index) => ({
    source_system: "morro-v1-search-catalog",
    source_key: `source-${index}`,
    business_id: `business-${index}`,
    place_id: `place-${index}`,
    destination_id: "morro-de-sao-paulo",
    category_id: index % 2 === 0 ? "hotels" : "restaurants",
    publication_state: "review",
    editable_revision: 2,
    published_revision: null,
    published_revision_id: null,
    published_place_json: null,
    published_revision_json: null,
    published_latitude: null,
    published_longitude: null,
    review_marker_source_key: `source-${index}`,
    review_marker_business_id: `business-${index}`,
    review_marker_place_id: `place-${index}`,
    review_marker_revision: 2,
    description_marker_source_key: `source-${index}`,
    description_marker_business_id: `business-${index}`,
    description_marker_place_id: `place-${index}`,
    description_source_kind: "derived-canonical-name-category-destination",
    catalog_snapshot_business_id: null,
    catalog_snapshot_revision: null,
    catalog_snapshot_json: null,
    media_snapshot_business_id: null,
    media_snapshot_revision: null,
    media_snapshot_json: null,
  }));
  const mediaRows = rows.map((row, index) => ({
    source_system: row.source_system,
    source_key: row.source_key,
    business_id: row.business_id,
    place_id: row.place_id,
    disposition: index < 6 ? "migrate" : "intentional_no_image",
    asset_count: index < 6 ? 3 : 0,
    link_count: index < 6 ? 3 : 0,
    published_asset_count: index < 6 ? 3 : 0,
  }));
  return { rows, mediaRows };
}

function publish(row, mediaRow, state = "published") {
  row.publication_state = state;
  row.published_revision = 2;
  row.published_revision_id = `${row.place_id}:r2`;
  row.published_place_json = JSON.stringify({
    id: row.place_id,
    businessId: row.business_id,
    destinationId: "morro-de-sao-paulo",
  });
  row.published_revision_json = JSON.stringify({
    placeId: row.place_id,
    businessId: row.business_id,
    destinationId: "morro-de-sao-paulo",
  });
  row.published_latitude = -13.38;
  row.published_longitude = -38.91;
  row.catalog_snapshot_business_id = row.business_id;
  row.catalog_snapshot_revision = 2;
  row.catalog_snapshot_json = JSON.stringify({
    products: [],
    offers: [],
    menus: [],
    categories: [],
    items: [],
  });
  row.media_snapshot_business_id = row.business_id;
  row.media_snapshot_revision = 2;
  row.media_snapshot_json = JSON.stringify(
    mediaRow.disposition === "migrate"
      ? {
          placeId: row.place_id,
          coverImage: { mediaId: "cover" },
          gallery: [{ mediaId: "cover" }, { mediaId: "g1" }, { mediaId: "g2" }],
          logo: null,
        }
      : { placeId: row.place_id, coverImage: null, gallery: [], logo: null },
  );
}

describe("legacy commercial cutover auditor", () => {
  it("accepts all 72 review candidates before publication", () => {
    const { rows, mediaRows } = fixtures();
    expect(assessLegacyCommercialCutover(rows, mediaRows)).toEqual({
      total: 72,
      publishCandidates: 72,
      publishedRevisionCount: 0,
      currentCatalogSnapshots: 0,
      currentMediaSnapshots: 0,
      publicationStateCounts: { review: 72 },
      media: {
        migrate: 6,
        intentionalNoImage: 66,
        assetCount: 18,
        materializedAssets: 18,
      },
    });
  });

  it("requires exact catalog and media snapshots for published revisions", () => {
    const { rows, mediaRows } = fixtures();
    publish(rows[0], mediaRows[0]);
    publish(rows[6], mediaRows[6]);

    expect(assessLegacyCommercialCutover(rows, mediaRows)).toMatchObject({
      publishCandidates: 70,
      publishedRevisionCount: 2,
      currentCatalogSnapshots: 2,
      currentMediaSnapshots: 2,
      publicationStateCounts: { published: 2, review: 70 },
    });
  });

  it("accepts suspension while keeping the published snapshot auditable", () => {
    const { rows, mediaRows } = fixtures();
    publish(rows[0], mediaRows[0], "suspended");

    expect(assessLegacyCommercialCutover(rows, mediaRows)).toMatchObject({
      publishedRevisionCount: 1,
      publicationStateCounts: { suspended: 1, review: 71 },
    });
  });

  it("fails closed on lifecycle regression to unpublished draft", () => {
    const { rows, mediaRows } = fixtures();
    rows[0].publication_state = "draft";
    expect(() => assessLegacyCommercialCutover(rows, mediaRows)).toThrow(
      /LEGACY_CUTOVER_LIFECYCLE_REGRESSION/u,
    );
  });

  it("fails closed when a published revision is missing snapshots", () => {
    const { rows, mediaRows } = fixtures();
    publish(rows[0], mediaRows[0]);
    rows[0].catalog_snapshot_json = null;
    expect(() => assessLegacyCommercialCutover(rows, mediaRows)).toThrow(
      /LEGACY_CUTOVER_CATALOG_SNAPSHOT_INVALID/u,
    );
  });

  it("fails closed on media snapshot drift", () => {
    const { rows, mediaRows } = fixtures();
    publish(rows[0], mediaRows[0]);
    rows[0].media_snapshot_json = JSON.stringify({
      placeId: rows[0].place_id,
      coverImage: null,
      gallery: [],
      logo: null,
    });
    expect(() => assessLegacyCommercialCutover(rows, mediaRows)).toThrow(
      /LEGACY_CUTOVER_MEDIA_SNAPSHOT_DRIFT/u,
    );
  });

  it("rejects published records with missing coordinates", () => {
    const { rows, mediaRows } = fixtures();
    publish(rows[0], mediaRows[0]);
    rows[0].published_latitude = null;
    expect(() => assessLegacyCommercialCutover(rows, mediaRows)).toThrow(
      /LEGACY_CUTOVER_PUBLIC_PLACE_SNAPSHOT_INVALID/u,
    );
  });

  it("denies CLI execution outside canonical staging", async () => {
    await expect(
      runLegacyCommercialCutoverAudit({
        environment: {
          RENDER_SERVICE_NAME: "morro-digital-v2",
          BUSINESS_DATABASE_URL: "mysql://business",
          CONTENT_DATABASE_URL: "mysql://content",
        },
        mysqlClient: { createPool: vi.fn() },
      }),
    ).rejects.toThrow(/LEGACY_CUTOVER_AUDIT_SERVICE_DENIED/u);
  });
});

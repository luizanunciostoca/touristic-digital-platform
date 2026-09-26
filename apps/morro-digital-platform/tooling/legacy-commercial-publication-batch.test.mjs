import { describe, expect, it, vi } from "vitest";

import { runLegacyCommercialPublicationBatch } from "./legacy-commercial-publication-batch.mjs";

const SOURCE_SYSTEM = "morro-v1-search-catalog";

function rows() {
  return Array.from({ length: 72 }, (_, index) => ({
    source_system: SOURCE_SYSTEM,
    source_key:
      index === 0
        ? "nightlife:toca-do-morcego:-13.3766787:-38.9172057"
        : `source-${index}`,
    business_id: index === 0 ? "toca-do-morcego" : `business-${index}`,
    place_id: index === 0 ? "place-toca-do-morcego" : `place-${index}`,
    destination_id: "morro-de-sao-paulo",
    publication_state: index === 0 ? "published" : "review",
    editable_revision: 3,
    published_revision: index === 0 ? 3 : null,
    review_marker_source_key:
      index === 0
        ? "nightlife:toca-do-morcego:-13.3766787:-38.9172057"
        : `source-${index}`,
    review_marker_business_id:
      index === 0 ? "toca-do-morcego" : `business-${index}`,
    review_marker_place_id:
      index === 0 ? "place-toca-do-morcego" : `place-${index}`,
    review_marker_revision: 3,
  }));
}

function publicationMarker(row) {
  return {
    source_system: SOURCE_SYSTEM,
    source_key: row.source_key,
    business_id: row.business_id,
    place_id: row.place_id,
    editable_revision: row.editable_revision,
  };
}

function fixture({ extraPendingMarker = false, unownedPublished = false } = {}) {
  const stateRows = rows();
  if (unownedPublished) {
    stateRows[1].publication_state = "published";
    stateRows[1].published_revision = 3;
  }
  let markers = [publicationMarker(stateRows[0])];
  if (extraPendingMarker) markers.push(publicationMarker(stateRows[1]));

  const pool = {
    query: vi.fn(async () => [[], []]),
    execute: vi.fn(async (sql, params = []) => {
      if (sql.includes("FROM business_place_legacy_mappings")) {
        return [[...stateRows], []];
      }
      if (sql.includes("FROM legacy_place_publication_migrations")) {
        return [[...markers], []];
      }
      if (sql.includes("INSERT INTO legacy_place_publication_migrations")) {
        const row = stateRows.find(
          (candidate) => candidate.source_key === params[1],
        );
        markers.push(publicationMarker(row));
        return [{ affectedRows: 1 }, []];
      }
      return [[], []];
    }),
    end: vi.fn(async () => {}),
  };

  return { stateRows, pool, markers: () => markers };
}

function environment() {
  return {
    RENDER_SERVICE_NAME: "morro-digital-v2-staging",
    BUSINESS_DATABASE_URL: "mysql://business",
    CONTENT_DATABASE_URL: "mysql://content",
  };
}

describe("legacy commercial publication batch", () => {
  it("dry-runs 71 remaining review Places after the canary", async () => {
    const { pool } = fixture();
    await expect(
      runLegacyCommercialPublicationBatch({
        environment: environment(),
        argv: [],
        mysqlClient: { createPool: vi.fn(() => pool) },
      }),
    ).resolves.toMatchObject({
      total: 72,
      wouldPublish: 71,
      existingPublished: 1,
      existingMigrations: 1,
      published: 0,
      markersInserted: 0,
    });
  });

  it("publishes all remaining review Places with durable markers", async () => {
    const { stateRows, pool } = fixture();
    const transitionPublication = vi.fn(async (_actor, businessId, action, revision) => {
      const row = stateRows.find((candidate) => candidate.business_id === businessId);
      expect(action).toBe("publish");
      expect(revision).toBe(3);
      row.publication_state = "published";
      row.published_revision = 3;
    });
    const runtime = {
      start: vi.fn(async () => true),
      stop: vi.fn(async () => {}),
      transitionPublication,
    };

    await expect(
      runLegacyCommercialPublicationBatch({
        environment: environment(),
        argv: ["--apply"],
        mysqlClient: { createPool: vi.fn(() => pool) },
        runtimeFactory: () => runtime,
      }),
    ).resolves.toMatchObject({
      total: 72,
      wouldPublish: 0,
      existingPublished: 72,
      existingMigrations: 72,
      published: 71,
      markersInserted: 71,
    });
    expect(transitionPublication).toHaveBeenCalledTimes(71);
  });

  it("recovers from a marker-present pending review Place", async () => {
    const { stateRows, pool } = fixture({ extraPendingMarker: true });
    const transitionPublication = vi.fn(async (_actor, businessId) => {
      const row = stateRows.find((candidate) => candidate.business_id === businessId);
      row.publication_state = "published";
      row.published_revision = 3;
    });
    const result = await runLegacyCommercialPublicationBatch({
      environment: environment(),
      argv: ["--apply"],
      mysqlClient: { createPool: vi.fn(() => pool) },
      runtimeFactory: () => ({
        start: vi.fn(async () => true),
        stop: vi.fn(async () => {}),
        transitionPublication,
      }),
    });
    expect(result).toMatchObject({
      published: 71,
      markersInserted: 70,
      existingPublished: 72,
      existingMigrations: 72,
    });
  });

  it("fails closed on an unowned published Place", async () => {
    const { pool } = fixture({ unownedPublished: true });
    await expect(
      runLegacyCommercialPublicationBatch({
        environment: environment(),
        argv: [],
        mysqlClient: { createPool: vi.fn(() => pool) },
      }),
    ).rejects.toThrow(/LEGACY_PUBLICATION_BATCH_UNOWNED_PUBLISHED_STATE/u);
  });

  it("fails closed on stale review provenance", async () => {
    const { stateRows, pool } = fixture();
    stateRows[10].review_marker_revision = 2;
    await expect(
      runLegacyCommercialPublicationBatch({
        environment: environment(),
        argv: [],
        mysqlClient: { createPool: vi.fn(() => pool) },
      }),
    ).rejects.toThrow(/LEGACY_PUBLICATION_BATCH_REVIEW_REVISION_DRIFT/u);
  });

  it("denies execution outside canonical staging", async () => {
    await expect(
      runLegacyCommercialPublicationBatch({
        environment: {
          RENDER_SERVICE_NAME: "morro-digital-v2",
          BUSINESS_DATABASE_URL: "mysql://business",
          CONTENT_DATABASE_URL: "mysql://content",
        },
        argv: [],
        mysqlClient: { createPool: vi.fn() },
      }),
    ).rejects.toThrow(/LEGACY_PUBLICATION_BATCH_SERVICE_DENIED/u);
  });
});

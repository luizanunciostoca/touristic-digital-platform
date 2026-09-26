import { describe, expect, it, vi } from "vitest";

import { runLegacyCommercialPublicationCanary } from "./legacy-commercial-publication-canary.mjs";

function fixture({ state = "review", publishedRevision = null, marker = null } = {}) {
  const row = {
    source_system: "morro-v1-search-catalog",
    source_key: "nightlife:toca-do-morcego:-13.3766787:-38.9172057",
    business_id: "toca-do-morcego",
    place_id: "place-toca-do-morcego",
    destination_id: "morro-de-sao-paulo",
    publication_state: state,
    editable_revision: 3,
    published_revision: publishedRevision,
    review_marker_revision: 3,
  };
  let markerRow = marker;
  const pool = {
    query: vi.fn(async () => [[], []]),
    execute: vi.fn(async (sql) => {
      if (sql.includes("FROM business_place_legacy_mappings")) {
        return [[row], []];
      }
      if (sql.includes("FROM legacy_place_publication_migrations")) {
        return [markerRow ? [markerRow] : [], []];
      }
      if (sql.includes("INSERT INTO legacy_place_publication_migrations")) {
        markerRow = {
          source_system: row.source_system,
          source_key: row.source_key,
          business_id: row.business_id,
          place_id: row.place_id,
          editable_revision: row.editable_revision,
        };
        return [{ affectedRows: 1 }, []];
      }
      return [[], []];
    }),
    end: vi.fn(async () => {}),
  };
  return { row, pool, getMarker: () => markerRow };
}

function environment() {
  return {
    RENDER_SERVICE_NAME: "morro-digital-v2-staging",
    BUSINESS_DATABASE_URL: "mysql://business",
    CONTENT_DATABASE_URL: "mysql://content",
  };
}

describe("legacy commercial publication canary", () => {
  it("dry-runs the reviewed Toca do Morcego canary without writes", async () => {
    const { pool } = fixture();
    const mysqlClient = { createPool: vi.fn(() => pool) };
    await expect(
      runLegacyCommercialPublicationCanary({
        environment: environment(),
        argv: [],
        mysqlClient,
      }),
    ).resolves.toMatchObject({
      canary: "place-toca-do-morcego",
      wouldPublish: 1,
      existingPublished: 0,
      published: 0,
      markersInserted: 0,
    });
  });

  it("applies marker then publishes the exact reviewed revision", async () => {
    const { row, pool } = fixture();
    const mysqlClient = { createPool: vi.fn(() => pool) };
    const transitionPublication = vi.fn(async () => {
      row.publication_state = "published";
      row.published_revision = 3;
      return { publicationState: "published" };
    });
    const runtime = {
      start: vi.fn(async () => true),
      stop: vi.fn(async () => {}),
      transitionPublication,
    };

    await expect(
      runLegacyCommercialPublicationCanary({
        environment: environment(),
        argv: ["--apply"],
        mysqlClient,
        runtimeFactory: () => runtime,
      }),
    ).resolves.toMatchObject({
      existingPublished: 1,
      published: 1,
      markersInserted: 1,
      publishedRevision: 3,
    });
    expect(transitionPublication).toHaveBeenCalledWith(
      expect.objectContaining({ role: "PLATFORM_OWNER" }),
      "toca-do-morcego",
      "publish",
      3,
    );
  });

  it("recovers idempotently from marker-present review state", async () => {
    const marker = {
      source_system: "morro-v1-search-catalog",
      source_key: "nightlife:toca-do-morcego:-13.3766787:-38.9172057",
      business_id: "toca-do-morcego",
      place_id: "place-toca-do-morcego",
      editable_revision: 3,
    };
    const { row, pool } = fixture({ marker });
    const transitionPublication = vi.fn(async () => {
      row.publication_state = "published";
      row.published_revision = 3;
    });
    await expect(
      runLegacyCommercialPublicationCanary({
        environment: environment(),
        argv: ["--apply"],
        mysqlClient: { createPool: vi.fn(() => pool) },
        runtimeFactory: () => ({
          start: vi.fn(async () => true),
          stop: vi.fn(async () => {}),
          transitionPublication,
        }),
      }),
    ).resolves.toMatchObject({
      published: 1,
      markersInserted: 0,
      existingPublished: 1,
    });
  });

  it("verifies marker-owned published state without runtime mutation", async () => {
    const marker = {
      source_system: "morro-v1-search-catalog",
      source_key: "nightlife:toca-do-morcego:-13.3766787:-38.9172057",
      business_id: "toca-do-morcego",
      place_id: "place-toca-do-morcego",
      editable_revision: 3,
    };
    const { pool } = fixture({
      state: "published",
      publishedRevision: 3,
      marker,
    });
    await expect(
      runLegacyCommercialPublicationCanary({
        environment: environment(),
        argv: ["--verify"],
        mysqlClient: { createPool: vi.fn(() => pool) },
      }),
    ).resolves.toMatchObject({
      existingPublished: 1,
      published: 0,
      publishedRevision: 3,
    });
  });

  it("fails closed on stale review revision", async () => {
    const { row, pool } = fixture();
    row.review_marker_revision = 2;
    await expect(
      runLegacyCommercialPublicationCanary({
        environment: environment(),
        argv: [],
        mysqlClient: { createPool: vi.fn(() => pool) },
      }),
    ).rejects.toThrow(/LEGACY_PUBLICATION_CANARY_REVIEW_REVISION_DRIFT/u);
  });

  it("denies execution outside canonical staging", async () => {
    await expect(
      runLegacyCommercialPublicationCanary({
        environment: {
          RENDER_SERVICE_NAME: "morro-digital-v2",
          BUSINESS_DATABASE_URL: "mysql://business",
          CONTENT_DATABASE_URL: "mysql://content",
        },
        argv: [],
        mysqlClient: { createPool: vi.fn() },
      }),
    ).rejects.toThrow(/LEGACY_PUBLICATION_CANARY_SERVICE_DENIED/u);
  });
});

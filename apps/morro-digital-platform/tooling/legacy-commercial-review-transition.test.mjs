import { describe, expect, it, vi } from "vitest";

import { runLegacyCommercialReviewTransition } from "./legacy-commercial-review-transition.mjs";

function rows(state = "draft", revision = 3) {
  return Array.from({ length: 72 }, (_, index) => ({
    source_system: "morro-v1-search-catalog",
    source_key: `source-${index}`,
    business_id: `business-${index}`,
    place_id: `place-${index}`,
    destination_id: "morro-de-sao-paulo",
    category_id: "restaurants",
    publication_state: state,
    editable_revision: revision,
    published_revision: null,
  }));
}

function fakeDatabase(initialRows) {
  const state = { rows: initialRows, markers: [] };
  const pool = {
    query: vi.fn(async () => [[], []]),
    execute: vi.fn(async (sql, params = []) => {
      if (sql.includes("FROM business_place_legacy_mappings"))
        return [state.rows, []];
      if (sql.includes("FROM legacy_place_review_migrations"))
        return [state.markers, []];
      if (sql.includes("INSERT INTO legacy_place_review_migrations")) {
        state.markers.push({
          source_system: params[0],
          source_key: params[1],
          business_id: params[2],
          place_id: params[3],
          editable_revision: params[4],
        });
        return [{ affectedRows: 1 }, []];
      }
      return [[], []];
    }),
    end: vi.fn(async () => {}),
  };
  return { state, pool };
}

function environment() {
  return {
    RENDER_SERVICE_NAME: "morro-digital-v2-staging",
    BUSINESS_DATABASE_URL: "mysql://business",
    CONTENT_DATABASE_URL: "mysql://content",
  };
}

describe("legacy commercial review transition", () => {
  it("reports 72 eligible drafts in dry-run without writes", async () => {
    const database = fakeDatabase(rows());
    const result = await runLegacyCommercialReviewTransition({
      environment: environment(),
      mysqlClient: { createPool: vi.fn(() => database.pool) },
    });
    expect(result).toEqual({
      total: 72,
      wouldReview: 72,
      existingReview: 0,
      existingMigrations: 0,
      reviewed: 0,
      markersInserted: 0,
    });
    expect(database.state.markers).toHaveLength(0);
  });

  it("applies review with exact revisions and verifies markers", async () => {
    const database = fakeDatabase(rows());
    const transitionPublication = vi.fn(
      async (_actor, businessId, action, expectedRevision) => {
        expect(action).toBe("review");
        const row = database.state.rows.find(
          (candidate) => candidate.business_id === businessId,
        );
        expect(expectedRevision).toBe(row.editable_revision);
        row.publication_state = "review";
        return { ok: true };
      },
    );
    const runtime = {
      start: vi.fn(async () => true),
      stop: vi.fn(async () => {}),
      transitionPublication,
    };
    const mysqlClient = { createPool: vi.fn(() => database.pool) };

    const applied = await runLegacyCommercialReviewTransition({
      environment: environment(),
      argv: ["--apply"],
      mysqlClient,
      runtimeFactory: () => runtime,
    });
    expect(applied).toEqual({
      total: 72,
      wouldReview: 0,
      existingReview: 72,
      existingMigrations: 72,
      reviewed: 72,
      markersInserted: 72,
    });
    expect(transitionPublication).toHaveBeenCalledTimes(72);

    const verified = await runLegacyCommercialReviewTransition({
      environment: environment(),
      argv: ["--verify"],
      mysqlClient,
    });
    expect(verified).toEqual({
      total: 72,
      wouldReview: 0,
      existingReview: 72,
      existingMigrations: 72,
      reviewed: 0,
      markersInserted: 0,
    });
  });

  it("fails closed on stale marker revision", async () => {
    const database = fakeDatabase(rows("review", 4));
    database.state.markers = rows("review", 3).map((row) => ({
      source_system: row.source_system,
      source_key: row.source_key,
      business_id: row.business_id,
      place_id: row.place_id,
      editable_revision: row.editable_revision,
    }));
    await expect(
      runLegacyCommercialReviewTransition({
        environment: environment(),
        argv: ["--verify"],
        mysqlClient: { createPool: vi.fn(() => database.pool) },
      }),
    ).rejects.toThrow(/LEGACY_REVIEW_TRANSITION_MARKER_DRIFT/u);
  });

  it("fails closed outside canonical staging", async () => {
    await expect(
      runLegacyCommercialReviewTransition({
        environment: {
          ...environment(),
          RENDER_SERVICE_NAME: "morro-digital-v2",
        },
        mysqlClient: { createPool: vi.fn() },
      }),
    ).rejects.toThrow(/LEGACY_REVIEW_TRANSITION_SERVICE_DENIED/u);
  });
});

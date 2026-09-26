import { describe, expect, it, vi } from "vitest";

import { runLegacyCommercialPublicationTransition } from "./legacy-commercial-publication-transition.mjs";

function rows(state = "review", revision = 3) {
  return Array.from({ length: 72 }, (_, index) => ({
    source_system: "morro-v1-search-catalog",
    source_key: `source-${index}`,
    business_id: `business-${index}`,
    place_id: `place-${index}`,
    destination_id: "morro-de-sao-paulo",
    publication_state: state,
    editable_revision: revision,
    published_revision: state === "published" ? revision : null,
    review_marker_source_key: `source-${index}`,
    review_marker_business_id: `business-${index}`,
    review_marker_place_id: `place-${index}`,
    review_marker_revision: revision,
  }));
}

function fakeDatabase(initialRows) {
  const state = { rows: initialRows, markers: [] };
  const pool = {
    query: vi.fn(async () => [[], []]),
    execute: vi.fn(async (sql, params = []) => {
      if (sql.includes("FROM business_place_legacy_mappings")) {
        return [state.rows, []];
      }
      if (sql.includes("FROM legacy_place_publication_migrations")) {
        return [state.markers, []];
      }
      if (sql.includes("INSERT INTO legacy_place_publication_migrations")) {
        state.markers.push({
          source_system: params[0],
          source_key: params[1],
          business_id: params[2],
          place_id: params[3],
          published_revision: params[4],
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

describe("legacy commercial publication transition", () => {
  it("publishes all 72 exact reviewed revisions and records provenance", async () => {
    const database = fakeDatabase(rows());
    const transitionPublication = vi.fn(
      async (_actor, businessId, action, expectedRevision) => {
        expect(action).toBe("publish");
        const row = database.state.rows.find(
          (candidate) => candidate.business_id === businessId,
        );
        expect(expectedRevision).toBe(row.editable_revision);
        row.publication_state = "published";
        row.published_revision = expectedRevision;
        return { publicationState: "published" };
      },
    );
    const runtime = {
      start: vi.fn(async () => true),
      stop: vi.fn(async () => {}),
      transitionPublication,
    };
    const mysqlClient = { createPool: vi.fn(() => database.pool) };

    const applied = await runLegacyCommercialPublicationTransition({
      environment: environment(),
      argv: ["--apply"],
      mysqlClient,
      runtimeFactory: () => runtime,
    });

    expect(applied).toEqual({
      total: 72,
      wouldPublish: 0,
      migratedPublicationCount: 72,
      existingMigrations: 72,
      publicationStateCounts: { published: 72 },
      published: 72,
      markersInserted: 72,
    });
    expect(transitionPublication).toHaveBeenCalledTimes(72);

    const verified = await runLegacyCommercialPublicationTransition({
      environment: environment(),
      argv: ["--verify"],
      mysqlClient,
    });
    expect(verified).toEqual({
      total: 72,
      wouldPublish: 0,
      migratedPublicationCount: 72,
      existingMigrations: 72,
      publicationStateCounts: { published: 72 },
      published: 0,
      markersInserted: 0,
    });
  });

  it("retries a recoverable marker-backed review transition", async () => {
    const database = fakeDatabase(rows());
    database.state.markers = rows().map((row) => ({
      source_system: row.source_system,
      source_key: row.source_key,
      business_id: row.business_id,
      place_id: row.place_id,
      published_revision: row.editable_revision,
    }));
    const transitionPublication = vi.fn(
      async (_actor, businessId, _action, expectedRevision) => {
        const row = database.state.rows.find(
          (candidate) => candidate.business_id === businessId,
        );
        row.publication_state = "published";
        row.published_revision = expectedRevision;
      },
    );
    const runtime = {
      start: vi.fn(async () => true),
      stop: vi.fn(async () => {}),
      transitionPublication,
    };

    const result = await runLegacyCommercialPublicationTransition({
      environment: environment(),
      argv: ["--apply"],
      mysqlClient: { createPool: vi.fn(() => database.pool) },
      runtimeFactory: () => runtime,
    });

    expect(result.published).toBe(72);
    expect(result.markersInserted).toBe(0);
  });

  it("does not republish a later editable review after initial migration", async () => {
    const input = rows("review", 4);
    for (const row of input) row.published_revision = 3;
    const database = fakeDatabase(input);
    database.state.markers = input.map((row) => ({
      source_system: row.source_system,
      source_key: row.source_key,
      business_id: row.business_id,
      place_id: row.place_id,
      published_revision: 3,
    }));

    const result = await runLegacyCommercialPublicationTransition({
      environment: environment(),
      argv: ["--verify"],
      mysqlClient: { createPool: vi.fn(() => database.pool) },
    });

    expect(result).toMatchObject({
      migratedPublicationCount: 72,
      existingMigrations: 72,
      published: 0,
    });
  });

  it("fails closed if a published row is not owned by a migration marker", async () => {
    const database = fakeDatabase(rows("published"));
    await expect(
      runLegacyCommercialPublicationTransition({
        environment: environment(),
        argv: ["--apply"],
        mysqlClient: { createPool: vi.fn(() => database.pool) },
      }),
    ).rejects.toThrow(/LEGACY_PUBLICATION_TRANSITION_UNOWNED_STATE/u);
  });

  it("fails closed outside canonical staging", async () => {
    await expect(
      runLegacyCommercialPublicationTransition({
        environment: {
          ...environment(),
          RENDER_SERVICE_NAME: "morro-digital-v2",
        },
        argv: ["--verify"],
        mysqlClient: { createPool: vi.fn() },
      }),
    ).rejects.toThrow(/LEGACY_PUBLICATION_TRANSITION_SERVICE_DENIED/u);
  });
});

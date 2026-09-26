import { describe, expect, it, vi } from "vitest";

import {
  assessLegacyCommercialDescriptionBackfill,
  bootstrapLegacyCommercialDescription,
} from "./legacy-commercial-description-backfill-core.mjs";
import { runLegacyCommercialDescriptionBackfill } from "./legacy-commercial-description-backfill.mjs";

function rows(description = "") {
  const categories = ["hotels", "restaurants", "nightlife", "shops"];
  return Array.from({ length: 72 }, (_, index) => {
    const categoryId = categories[index % categories.length];
    const businessId = `business-${index}`;
    const placeId = `place-${index}`;
    return {
      source_system: "morro-v1-search-catalog",
      source_key: `source-${index}`,
      business_id: businessId,
      place_id: placeId,
      destination_id: "morro-de-sao-paulo",
      category_id: categoryId,
      publication_state: "draft",
      published_revision: null,
      editable_place_json: JSON.stringify({
        id: placeId,
        businessId,
        destinationId: "morro-de-sao-paulo",
        name: `Place ${index}`,
        description:
          typeof description === "function"
            ? description(index, categoryId)
            : description,
      }),
    };
  });
}

function fakeDatabase(initialRows) {
  const state = {
    rows: initialRows,
    markers: [],
  };
  const pool = {
    query: vi.fn(async () => [[], []]),
    execute: vi.fn(async (sql, params = []) => {
      if (sql.includes("FROM business_place_legacy_mappings")) {
        return [state.rows, []];
      }
      if (sql.includes("FROM legacy_place_description_migrations")) {
        return [state.markers, []];
      }
      if (sql.includes("INSERT INTO legacy_place_description_migrations")) {
        state.markers.push({
          source_system: params[0],
          source_key: params[1],
          business_id: params[2],
          place_id: params[3],
          source_kind: params[4],
          description_sha256: params[5],
        });
        return [{ affectedRows: 1 }, []];
      }
      return [[], []];
    }),
    end: vi.fn(async () => {}),
  };
  return { state, pool };
}

function stagingEnvironment() {
  return {
    RENDER_SERVICE_NAME: "morro-digital-v2-staging",
    BUSINESS_DATABASE_URL: "mysql://business",
    CONTENT_DATABASE_URL: "mysql://content",
  };
}

describe("legacy commercial description backfill", () => {
  it("builds factual deterministic descriptions from canonical facts", () => {
    expect(
      bootstrapLegacyCommercialDescription({
        name: "Toca do Morcego",
        categoryId: "nightlife",
        destinationId: "morro-de-sao-paulo",
      }),
    ).toBe(
      "Toca do Morcego é um local de vida noturna cadastrado em Morro de São Paulo.",
    );
  });

  it("dry-runs all empty descriptions without mutations", () => {
    expect(assessLegacyCommercialDescriptionBackfill(rows())).toEqual({
      total: 72,
      wouldUpdate: 72,
      existingBootstrap: 0,
      preserveCustom: 0,
    });
  });

  it("preserves custom content and recognizes bootstrap idempotently", () => {
    const input = rows((index, categoryId) =>
      index === 0
        ? "Descrição editorial existente."
        : bootstrapLegacyCommercialDescription({
            name: `Place ${index}`,
            categoryId,
            destinationId: "morro-de-sao-paulo",
          }),
    );
    expect(assessLegacyCommercialDescriptionBackfill(input)).toEqual({
      total: 72,
      wouldUpdate: 0,
      existingBootstrap: 71,
      preserveCustom: 1,
    });
  });

  it("applies through governed runtime and verifies all migration markers", async () => {
    const database = fakeDatabase(rows());
    const updateProfile = vi.fn(async (_actor, businessId, input) => {
      const row = database.state.rows.find(
        (candidate) => candidate.business_id === businessId,
      );
      const place = JSON.parse(row.editable_place_json);
      row.editable_place_json = JSON.stringify({
        ...place,
        shortDescription: input.shortDescription,
        description: input.description,
      });
      return { ok: true };
    });
    const runtime = {
      start: vi.fn(async () => true),
      stop: vi.fn(async () => {}),
      updateProfile,
    };
    const mysqlClient = { createPool: vi.fn(() => database.pool) };

    const applied = await runLegacyCommercialDescriptionBackfill({
      environment: stagingEnvironment(),
      argv: ["--apply"],
      mysqlClient,
      runtimeFactory: () => runtime,
    });

    expect(applied).toEqual({
      total: 72,
      wouldUpdate: 0,
      existingBootstrap: 72,
      preserveCustom: 0,
      existingMigrations: 0,
      updated: 72,
      markersInserted: 72,
    });
    expect(updateProfile).toHaveBeenCalledTimes(72);
    expect(database.state.markers).toHaveLength(72);

    const verified = await runLegacyCommercialDescriptionBackfill({
      environment: stagingEnvironment(),
      argv: ["--verify"],
      mysqlClient,
    });
    expect(verified).toEqual({
      total: 72,
      wouldUpdate: 0,
      existingBootstrap: 72,
      preserveCustom: 0,
      existingMigrations: 72,
      updated: 0,
      markersInserted: 0,
    });
  });

  it("verifies existing description markers after all 72 Places move to review", async () => {
    const database = fakeDatabase(rows());
    const updateProfile = vi.fn(async (_actor, businessId, input) => {
      const row = database.state.rows.find(
        (candidate) => candidate.business_id === businessId,
      );
      const place = JSON.parse(row.editable_place_json);
      row.editable_place_json = JSON.stringify({
        ...place,
        shortDescription: input.shortDescription,
        description: input.description,
      });
      return { ok: true };
    });
    const runtime = {
      start: vi.fn(async () => true),
      stop: vi.fn(async () => {}),
      updateProfile,
    };
    const mysqlClient = { createPool: vi.fn(() => database.pool) };

    await runLegacyCommercialDescriptionBackfill({
      environment: stagingEnvironment(),
      argv: ["--apply"],
      mysqlClient,
      runtimeFactory: () => runtime,
    });
    for (const row of database.state.rows) {
      row.publication_state = "review";
    }

    await expect(
      runLegacyCommercialDescriptionBackfill({
        environment: stagingEnvironment(),
        argv: ["--verify"],
        mysqlClient,
      }),
    ).resolves.toMatchObject({
      total: 72,
      wouldUpdate: 0,
      existingBootstrap: 72,
      existingMigrations: 72,
      updated: 0,
      markersInserted: 0,
    });
  });

  it("denies late description migration after a Place leaves draft", async () => {
    const input = rows((index, categoryId) =>
      bootstrapLegacyCommercialDescription({
        name: `Place ${index}`,
        categoryId,
        destinationId: "morro-de-sao-paulo",
      }),
    );
    for (const row of input) row.publication_state = "review";
    const database = fakeDatabase(input);

    await expect(
      runLegacyCommercialDescriptionBackfill({
        environment: stagingEnvironment(),
        argv: ["--apply"],
        mysqlClient: { createPool: vi.fn(() => database.pool) },
      }),
    ).rejects.toThrow(/LEGACY_DESCRIPTION_LATE_MIGRATION_DENIED/u);
  });

  it("records markers without starting runtime when bootstrap copy already exists", async () => {
    const database = fakeDatabase(
      rows((index, categoryId) =>
        bootstrapLegacyCommercialDescription({
          name: `Place ${index}`,
          categoryId,
          destinationId: "morro-de-sao-paulo",
        }),
      ),
    );
    const runtimeFactory = vi.fn();

    const result = await runLegacyCommercialDescriptionBackfill({
      environment: stagingEnvironment(),
      argv: ["--apply"],
      mysqlClient: { createPool: vi.fn(() => database.pool) },
      runtimeFactory,
    });

    expect(result).toEqual({
      total: 72,
      wouldUpdate: 0,
      existingBootstrap: 72,
      preserveCustom: 0,
      existingMigrations: 0,
      updated: 0,
      markersInserted: 72,
    });
    expect(runtimeFactory).not.toHaveBeenCalled();
    expect(database.state.markers).toHaveLength(72);
  });

  it("fails closed outside canonical staging", async () => {
    await expect(
      runLegacyCommercialDescriptionBackfill({
        environment: {
          RENDER_SERVICE_NAME: "morro-digital-v2",
          BUSINESS_DATABASE_URL: "mysql://business",
        },
        mysqlClient: { createPool: vi.fn() },
      }),
    ).rejects.toThrow(/LEGACY_DESCRIPTION_BACKFILL_SERVICE_DENIED/u);
  });
});

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
      editable_place_json: {
        id: placeId,
        businessId,
        destinationId: "morro-de-sao-paulo",
        name: `Place ${index}`,
        description:
          typeof description === "function"
            ? description(index, categoryId)
            : description,
        shortDescription: "",
      },
    };
  });
}

function fakeDatabase(inputRows) {
  const markers = [];
  const pool = {
    query: vi.fn(async () => [[], []]),
    execute: vi.fn(async (sql, params = []) => {
      if (sql.includes("FROM business_place_legacy_mappings")) {
        return [inputRows, []];
      }
      if (sql.includes("FROM legacy_place_description_migrations")) {
        return [markers, []];
      }
      if (sql.includes("INSERT INTO legacy_place_description_migrations")) {
        markers.push({
          source_system: params[0],
          source_key: params[1],
          business_id: params[2],
          place_id: params[3],
          source_kind: params[4],
          description_sha256: params[5],
        });
        return [{ affectedRows: 1 }, []];
      }
      throw new Error(`UNEXPECTED_SQL:${sql}`);
    }),
    end: vi.fn(async () => {}),
  };
  return {
    markers,
    pool,
    mysqlClient: { createPool: vi.fn(() => pool) },
  };
}

function runtimeFactory(inputRows) {
  return () => ({
    start: vi.fn(async () => true),
    stop: vi.fn(async () => {}),
    updateProfile: vi.fn(async (_session, businessId, input) => {
      const row = inputRows.find(
        (candidate) => candidate.business_id === businessId,
      );
      row.editable_place_json = {
        ...row.editable_place_json,
        shortDescription: input.shortDescription,
        description: input.description,
      };
      return {};
    }),
  });
}

const environment = {
  RENDER_SERVICE_NAME: "morro-digital-v2-staging",
  BUSINESS_DATABASE_URL: "mysql://business",
  CONTENT_DATABASE_URL: "mysql://content",
};

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

  it("applies 72 governed descriptions and records provenance markers", async () => {
    const input = rows();
    const database = fakeDatabase(input);
    const result = await runLegacyCommercialDescriptionBackfill({
      environment,
      argv: ["--apply"],
      mysqlClient: database.mysqlClient,
      runtimeFactory: runtimeFactory(input),
    });

    expect(result).toEqual({
      total: 72,
      wouldUpdate: 0,
      existingBootstrap: 72,
      preserveCustom: 0,
      existingMigrations: 0,
      updated: 72,
      markersInserted: 72,
    });
    expect(database.markers).toHaveLength(72);
  });

  it("verifies an applied migration idempotently", async () => {
    const input = rows();
    const database = fakeDatabase(input);
    await runLegacyCommercialDescriptionBackfill({
      environment,
      argv: ["--apply"],
      mysqlClient: database.mysqlClient,
      runtimeFactory: runtimeFactory(input),
    });

    const verified = await runLegacyCommercialDescriptionBackfill({
      environment,
      argv: ["--verify"],
      mysqlClient: database.mysqlClient,
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

  it("fails closed when verify is missing provenance markers", async () => {
    const input = rows((index, categoryId) =>
      bootstrapLegacyCommercialDescription({
        name: `Place ${index}`,
        categoryId,
        destinationId: "morro-de-sao-paulo",
      }),
    );
    const database = fakeDatabase(input);
    await expect(
      runLegacyCommercialDescriptionBackfill({
        environment,
        argv: ["--verify"],
        mysqlClient: database.mysqlClient,
      }),
    ).rejects.toThrow(/LEGACY_DESCRIPTION_MIGRATION_MARKER_COUNT_INVALID/u);
  });

  it("denies database audit outside canonical staging", async () => {
    await expect(
      runLegacyCommercialDescriptionBackfill({
        environment: {
          ...environment,
          RENDER_SERVICE_NAME: "morro-digital-v2",
        },
        mysqlClient: { createPool: vi.fn() },
      }),
    ).rejects.toThrow(/LEGACY_DESCRIPTION_BACKFILL_SERVICE_DENIED/u);
  });
});

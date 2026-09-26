import { expect, it, vi } from "vitest";

import { executeLegacyCommercialPlaceBackfill } from "./legacy-commercial-place-backfill-core.mjs";

function mapping() {
  return Object.freeze({
    sourceSystem: "morro-v1-search-catalog",
    sourceKey: "nightlife:toca-do-morcego:-13.3766787:-38.9172057",
    legacyName: "Toca do Morcego",
    legacyCategory: "nightlife",
    destinationId: "morro-de-sao-paulo",
    businessId: "toca-do-morcego",
    placeId: "place-toca-do-morcego",
    categoryId: "nightlife",
  });
}

function catalog() {
  return Object.freeze([
    Object.freeze({
      name: "Toca do Morcego",
      category: "nightlife",
      latitude: -13.3766787,
      longitude: -38.9172057,
      area: "Centro",
    }),
  ]);
}

function fixture({ mapped = null, canonical = null } = {}) {
  const queries = [];
  const pool = {
    async execute(sql, params) {
      queries.push([sql, params]);
      if (sql.includes("FROM business_place_legacy_mappings")) {
        return [[...(mapped ? [mapped] : [])], []];
      }
      if (sql.includes("FROM business_places p")) {
        return [[...(canonical ? [canonical] : [])], []];
      }
      if (sql.includes("INSERT INTO business_place_legacy_mappings")) {
        return [{ affectedRows: 1 }, []];
      }
      throw new Error("UNEXPECTED_QUERY");
    },
    async query() {
      return [[], []];
    },
    async end() {},
  };
  const runtime = {
    start: vi.fn(async () => true),
    stop: vi.fn(async () => {}),
    createDraft: vi.fn(async () => ({
      businessId: "toca-do-morcego",
      placeId: "place-toca-do-morcego",
    })),
    updateLocation: vi.fn(async () => ({
      editableRevision: { revision: 2 },
    })),
  };
  return {
    queries,
    pool,
    runtime,
  };
}

it("dry-run reports missing drafts without writing", async () => {
  const f = fixture();
  const result = await executeLegacyCommercialPlaceBackfill({
    pool: f.pool,
    runtime: f.runtime,
    apply: false,
    mappings: [mapping()],
    catalog: catalog(),
  });

  expect(result).toMatchObject({
    mode: "dry-run",
    total: 1,
    wouldCreate: 1,
    createdDrafts: 0,
    mappingsInserted: 0,
  });
  expect(f.runtime.createDraft).not.toHaveBeenCalled();
  expect(
    f.queries.some(([sql]) =>
      sql.includes("INSERT INTO business_place_legacy_mappings"),
    ),
  ).toBe(false);
});

it("apply creates only a draft, location revision and mapping", async () => {
  const f = fixture();
  const result = await executeLegacyCommercialPlaceBackfill({
    pool: f.pool,
    runtime: f.runtime,
    apply: true,
    mappings: [mapping()],
    catalog: catalog(),
  });

  expect(result).toMatchObject({
    mode: "apply",
    createdDrafts: 1,
    mappingsInserted: 1,
  });
  expect(f.runtime.createDraft).toHaveBeenCalledWith(
    expect.any(Object),
    expect.objectContaining({
      businessId: "toca-do-morcego",
      placeId: "place-toca-do-morcego",
      categoryId: "nightlife",
    }),
  );
  expect(f.runtime.updateLocation).toHaveBeenCalledWith(
    expect.any(Object),
    "toca-do-morcego",
    expect.objectContaining({
      latitude: -13.3766787,
      longitude: -38.9172057,
    }),
  );
});

it("reuses an existing canonical row only when identity matches exactly", async () => {
  const f = fixture({
    canonical: {
      business_id: "toca-do-morcego",
      place_id: "place-toca-do-morcego",
      destination_id: "morro-de-sao-paulo",
      category_id: "nightlife",
      place_name: "Toca do Morcego",
    },
  });
  const result = await executeLegacyCommercialPlaceBackfill({
    pool: f.pool,
    runtime: f.runtime,
    apply: true,
    mappings: [mapping()],
    catalog: catalog(),
  });
  expect(result.existingCanonical).toBe(1);
  expect(result.mappingsInserted).toBe(1);
  expect(f.runtime.createDraft).not.toHaveBeenCalled();
});

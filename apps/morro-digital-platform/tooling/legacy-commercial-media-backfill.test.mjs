import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { executeLegacyCommercialMediaBackfill } from "./legacy-commercial-media-backfill-core.mjs";
import { runLegacyCommercialMediaBackfill } from "./legacy-commercial-media-backfill.mjs";

const manifest = (
  await readFile(
    new URL(
      "../src/migration/legacy-commercial-media-mappings.ndjson",
      import.meta.url,
    ),
    "utf8",
  )
)
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const byKey = new Map(manifest.map((entry) => [entry.sourceKey, entry]));

function businessPool({
  publicationState = "draft",
  publishedRevision = null,
  missing = false,
} = {}) {
  return {
    execute: vi.fn(async (_sql, params) => {
      const entry = byKey.get(params[1]);
      if (!entry || missing) return [[], []];
      return [
        [
          {
            business_id: entry.businessId,
            place_id: entry.placeId,
            destination_id: entry.destinationId,
            category_id: "unused",
            publication_state: publicationState,
            published_revision: publishedRevision,
          },
        ],
        [],
      ];
    }),
  };
}

function contentPool({ apply = false } = {}) {
  const state = {
    queryCount: 0,
    assetInserts: 0,
    linkInserts: 0,
    markerInserts: 0,
    transactions: 0,
    commits: 0,
    rollbacks: 0,
  };
  const pool = {
    state,
    query: vi.fn(async () => {
      state.queryCount += 1;
      return [[], []];
    }),
    execute: vi.fn(async (sql) => {
      if (sql.includes("legacy_place_media_migrations")) {
        if (!apply) {
          const error = new Error("missing");
          error.code = "ER_NO_SUCH_TABLE";
          throw error;
        }
        return [[], []];
      }
      if (sql.includes("COUNT(*) AS total FROM place_media")) {
        return [[{ total: 0 }], []];
      }
      if (sql.includes("FROM media_assets")) return [[], []];
      return [[], []];
    }),
    getConnection: vi.fn(async () => ({
      beginTransaction: vi.fn(async () => {
        state.transactions += 1;
      }),
      execute: vi.fn(async (sql) => {
        if (sql.includes("INSERT INTO media_assets")) state.assetInserts += 1;
        if (sql.includes("INSERT INTO place_media")) state.linkInserts += 1;
        if (sql.includes("INSERT INTO legacy_place_media_migrations")) {
          state.markerInserts += 1;
        }
        return [{ affectedRows: 1 }, []];
      }),
      commit: vi.fn(async () => {
        state.commits += 1;
      }),
      rollback: vi.fn(async () => {
        state.rollbacks += 1;
      }),
      release: vi.fn(),
    })),
    end: vi.fn(async () => {}),
  };
  return pool;
}

describe("legacy commercial media backfill", () => {
  it("dry-runs all 72 identities without writes", async () => {
    const content = contentPool();
    const result = await executeLegacyCommercialMediaBackfill({
      businessPool: businessPool(),
      contentPool: content,
      manifest,
      apply: false,
    });

    expect(result).toEqual({
      total: 72,
      migrate: 6,
      intentionalNoImage: 66,
      existingMigrations: 0,
      wouldCreateAssets: 18,
      wouldRecordNoImage: 66,
      createdAssets: 0,
      migrationsInserted: 0,
    });
    expect(content.state.queryCount).toBe(0);
    expect(content.state.assetInserts).toBe(0);
    expect(content.getConnection).not.toHaveBeenCalled();
  });

  it("applies 18 assets, 18 links and all 72 migration dispositions transactionally", async () => {
    const content = contentPool({ apply: true });
    const result = await executeLegacyCommercialMediaBackfill({
      businessPool: businessPool(),
      contentPool: content,
      manifest,
      apply: true,
      now: new Date("2026-09-26T02:00:00.000Z"),
    });

    expect(result.createdAssets).toBe(18);
    expect(result.migrationsInserted).toBe(72);
    expect(content.state.queryCount).toBe(1);
    expect(content.state.assetInserts).toBe(18);
    expect(content.state.linkInserts).toBe(18);
    expect(content.state.markerInserts).toBe(72);
    expect(content.state.transactions).toBe(72);
    expect(content.state.commits).toBe(72);
    expect(content.state.rollbacks).toBe(0);
  });

  it("fails closed when an existing migrate marker has missing materialized assets", async () => {
    const migrated = manifest.find((entry) => entry.disposition === "migrate");
    const markerDigest = createHash("sha256")
      .update(JSON.stringify(migrated))
      .digest("hex");
    const content = {
      execute: vi.fn(async (sql, params) => {
        if (
          sql.includes("FROM legacy_place_media_migrations") &&
          params[1] === migrated.sourceKey
        ) {
          return [
            [
              {
                business_id: migrated.businessId,
                place_id: migrated.placeId,
                disposition: migrated.disposition,
                asset_count: migrated.assets.length,
                manifest_digest: markerDigest,
              },
            ],
            [],
          ];
        }
        if (sql.includes("FROM legacy_place_media_migrations")) {
          return [[], []];
        }
        if (sql.includes("COUNT(*) AS total FROM place_media")) {
          return [[{ total: 0 }], []];
        }
        if (sql.includes("FROM media_assets")) return [[], []];
        if (sql.includes("INNER JOIN media_assets")) return [[], []];
        return [[], []];
      }),
    };

    await expect(
      executeLegacyCommercialMediaBackfill({
        businessPool: businessPool(),
        contentPool: content,
        manifest,
      }),
    ).rejects.toThrow(/LEGACY_MEDIA_MIGRATION_MATERIAL_DRIFT/u);
  });

  it("allows review state while an unmigrated Place is still unpublished", async () => {
    const result = await executeLegacyCommercialMediaBackfill({
      businessPool: businessPool({ publicationState: "review" }),
      contentPool: contentPool(),
      manifest,
    });

    expect(result.wouldCreateAssets).toBe(18);
    expect(result.wouldRecordNoImage).toBe(66);
  });

  it("fails closed when a new media migration is attempted after publication", async () => {
    await expect(
      executeLegacyCommercialMediaBackfill({
        businessPool: businessPool({
          publicationState: "published",
          publishedRevision: 1,
        }),
        contentPool: contentPool(),
        manifest,
      }),
    ).rejects.toThrow(/LEGACY_MEDIA_PLACE_NOT_BACKFILL_ELIGIBLE/u);
  });

  it("keeps all existing media migrations verifiable after publication", async () => {
    const byPlace = new Map(manifest.map((entry) => [entry.placeId, entry]));
    const content = {
      execute: vi.fn(async (sql, params) => {
        if (sql.includes("FROM legacy_place_media_migrations")) {
          const entry = byKey.get(params[1]);
          if (!entry) return [[], []];
          return [
            [
              {
                business_id: entry.businessId,
                place_id: entry.placeId,
                disposition: entry.disposition,
                asset_count: entry.assets.length,
                manifest_digest: createHash("sha256")
                  .update(JSON.stringify(entry))
                  .digest("hex"),
              },
            ],
            [],
          ];
        }
        if (sql.includes("COUNT(*) AS total FROM place_media")) {
          const entry = byPlace.get(params[0]);
          return [[{ total: entry?.assets.length ?? 0 }], []];
        }
        if (sql.includes("INNER JOIN media_assets")) {
          const entry = byPlace.get(params[0]);
          const asset = entry?.assets.find(
            (candidate) => candidate.mediaId === params[1],
          );
          if (!entry || !asset) return [[], []];
          return [
            [
              {
                role: asset.role,
                sort_order: asset.sortOrder,
                business_id: entry.businessId,
                provider: asset.provider,
                provider_reference: asset.providerReference,
                mime_type: asset.mimeType,
                width: asset.width,
                height: asset.height,
                byte_size: asset.byteSize,
                checksum_sha256: asset.checksumSha256,
                alt_text: asset.alt,
                publication_state: asset.publicationState,
              },
            ],
            [],
          ];
        }
        return [[], []];
      }),
    };

    const result = await executeLegacyCommercialMediaBackfill({
      businessPool: businessPool({
        publicationState: "published",
        publishedRevision: 1,
      }),
      contentPool: content,
      manifest,
    });

    expect(result.existingMigrations).toBe(72);
    expect(result.wouldCreateAssets).toBe(0);
    expect(result.wouldRecordNoImage).toBe(0);
  });

  it("denies CLI execution outside canonical staging", async () => {
    await expect(
      runLegacyCommercialMediaBackfill({
        environment: {
          RENDER_SERVICE_NAME: "morro-digital-v2",
          BUSINESS_DATABASE_URL: "mysql://business",
          CONTENT_DATABASE_URL: "mysql://content",
        },
        mysqlClient: { createPool: vi.fn() },
        manifest,
      }),
    ).rejects.toThrow(/LEGACY_MEDIA_BACKFILL_SERVICE_DENIED/u);
  });
});

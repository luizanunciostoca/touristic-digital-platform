import {
  createPlaceMediaService,
  type MediaStoragePort,
} from "@touristic/content";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  MySqlPlaceMediaRepository,
  applyContentM156Schema,
  createContentPool,
} from "./index.js";

const databaseUrl = process.env.CONTENT_DATABASE_URL ?? "";

describe.skipIf(!databaseUrl)("Place media MySQL acceptance", () => {
  if (!databaseUrl) return;

  const pool = createContentPool(databaseUrl);
  const repository = new MySqlPlaceMediaRepository(pool);
  const owner = Object.freeze({
    businessId: "business-media-acceptance",
    placeId: "place-media-acceptance",
  });
  const scope = Object.freeze({
    businessIds: [owner.businessId],
    canMutate: true,
  });
  let sequence = 0;

  const storage: MediaStoragePort = {
    async upload() {
      sequence += 1;
      return {
        provider: "acceptance-storage",
        providerReference: `object-${sequence}`,
        checksumSha256: sequence.toString(16).padStart(64, "0"),
      };
    },
    async delete() {},
  };

  const service = createPlaceMediaService({
    repository,
    storage,
    now: () => "2026-09-24T21:30:00.000Z",
    createMediaId: () => `media-acceptance-${++sequence}`,
  });

  beforeAll(async () => {
    await applyContentM156Schema(pool);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM place_media");
    await pool.query("DELETE FROM media_assets");
    sequence = 0;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("persists an owned published cover and restores its projection", async () => {
    const created = await service.upload(scope, {
      owner,
      file: {
        fileName: "cover.webp",
        mimeType: "image/webp",
        byteSize: 4,
        width: 1200,
        height: 800,
        bytes: new Uint8Array(4),
      },
      role: "cover",
      alt: "Vista do estabelecimento ao pôr do sol",
      publish: true,
    });

    const storedAsset = await repository.getAsset(created.asset.id);
    expect(storedAsset).toEqual(created.asset);

    const projection = await service.projection(
      { businessIds: [owner.businessId], canMutate: false },
      owner,
    );
    expect(projection.coverImage?.mediaId).toBe(created.asset.id);
    expect(projection.gallery).toHaveLength(1);
  });

  it("enforces business-scoped checksum uniqueness in durable storage", async () => {
    const asset = Object.freeze({
      id: "media-durable-one",
      businessId: owner.businessId,
      type: "image" as const,
      provider: "acceptance-storage",
      providerReference: "object-one",
      mimeType: "image/jpeg",
      width: 800,
      height: 600,
      byteSize: 4,
      checksumSha256: "a".repeat(64),
      alt: "Foto um",
      publicationState: "draft" as const,
      createdAt: "2026-09-24T21:30:00.000Z",
      updatedAt: "2026-09-24T21:30:00.000Z",
    });
    await repository.saveAsset(asset);

    await expect(
      repository.saveAsset({
        ...asset,
        id: "media-durable-two",
        providerReference: "object-two",
      }),
    ).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
  });
});

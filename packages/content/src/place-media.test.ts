import { describe, expect, it } from "vitest";
import {
  createInMemoryPlaceMediaRepository,
  createPlaceMediaService,
  type MediaStoragePort,
} from "./place-media.js";

const owner = Object.freeze({
  placeId: "place-toca",
  businessId: "business-toca",
});
const scope = Object.freeze({
  businessIds: ["business-toca"],
  canMutate: true,
});
const readScope = Object.freeze({
  businessIds: ["business-toca"],
  canMutate: false,
});

function file(
  overrides: Partial<{
    mimeType: string;
    byteSize: number;
    width: number;
    height: number;
  }> = {},
) {
  const byteSize = overrides.byteSize ?? 4;
  return {
    fileName: "cover.jpg",
    mimeType: overrides.mimeType ?? "image/jpeg",
    byteSize,
    width: overrides.width ?? 1200,
    height: overrides.height ?? 800,
    bytes: new Uint8Array(byteSize),
  };
}

function harness(storageOverrides: Partial<MediaStoragePort> = {}) {
  const repository = createInMemoryPlaceMediaRepository();
  let sequence = 0;
  const storage: MediaStoragePort = {
    async upload() {
      sequence += 1;
      return {
        provider: "test-storage",
        providerReference: `asset-${sequence}`,
        checksumSha256: sequence.toString(16).padStart(64, "0"),
      };
    },
    async delete() {},
    ...storageOverrides,
  };
  const service = createPlaceMediaService({
    repository,
    storage,
    now: () => "2026-09-24T21:00:00.000Z",
    createMediaId: () => `media-${++sequence}`,
    maxBytes: 10,
    maxAssetsPerPlace: 5,
  });
  return { repository, service };
}

describe("PlaceMedia ownership and upload", () => {
  it("uploads authorized media and keeps provider secrets out of the contract", async () => {
    const { service } = harness();
    const created = await service.upload(scope, {
      owner,
      file: file(),
      role: "gallery",
      alt: "Vista da Toca do Morcego",
      publish: true,
    });
    expect(created.asset.businessId).toBe(owner.businessId);
    expect(created.link.placeId).toBe(owner.placeId);
    expect(created.asset.providerReference).toMatch(/^asset-/u);
    expect("secret" in created.asset).toBe(false);
  });

  it("denies cross-business access", async () => {
    const { service } = harness();
    await expect(
      service.upload(
        { businessIds: ["business-other"], canMutate: true },
        { owner, file: file(), alt: "Foto" },
      ),
    ).rejects.toThrow("MEDIA_ACCESS_BUSINESS_DENIED");
  });

  it("rejects invalid MIME, oversized files and invalid dimensions before storage", async () => {
    let uploads = 0;
    const { service } = harness({
      async upload() {
        uploads += 1;
        throw new Error("should-not-run");
      },
    });
    await expect(
      service.upload(scope, { owner, file: file({ mimeType: "text/html" }) }),
    ).rejects.toThrow("MEDIA_INVALID_MIME");
    await expect(
      service.upload(scope, { owner, file: file({ byteSize: 11 }) }),
    ).rejects.toThrow("MEDIA_INVALID_SIZE");
    await expect(
      service.upload(scope, { owner, file: file({ width: 9000 }) }),
    ).rejects.toThrow("MEDIA_INVALID_DIMENSIONS");
    expect(uploads).toBe(0);
  });

  it("rejects duplicates per business checksum", async () => {
    const checksum = "a".repeat(64);
    const { service } = harness({
      async upload() {
        return {
          provider: "test-storage",
          providerReference: "same-content",
          checksumSha256: checksum,
        };
      },
    });
    await service.upload(scope, { owner, file: file(), alt: "Foto" });
    await expect(
      service.upload(scope, { owner, file: file(), alt: "Foto repetida" }),
    ).rejects.toThrow("MEDIA_DUPLICATE_ASSET");
  });

  it("fails closed on partial provider upload failure", async () => {
    const { service } = harness({
      async upload() {
        throw new Error("provider-down");
      },
    });
    await expect(
      service.upload(scope, { owner, file: file(), alt: "Foto" }),
    ).rejects.toThrow("MEDIA_STORAGE_UPLOAD_FAILED");
    await expect(service.list(readScope, owner)).resolves.toEqual([]);
  });
});

describe("PlaceMedia management", () => {
  it("sets a unique cover, reorders and deletes media", async () => {
    const { service } = harness();
    const first = await service.upload(scope, {
      owner,
      file: file(),
      alt: "Primeira foto",
      publish: true,
    });
    const second = await service.upload(scope, {
      owner,
      file: file(),
      alt: "Segunda foto",
      publish: true,
    });
    await service.setCover(scope, owner, second.asset.id);
    const reordered = await service.reorder(scope, owner, [
      second.asset.id,
      first.asset.id,
    ]);
    expect(reordered.map((item) => item.mediaId)).toEqual([
      second.asset.id,
      first.asset.id,
    ]);
    const projection = await service.projection(readScope, owner);
    expect(projection.coverImage?.mediaId).toBe(second.asset.id);
    await service.delete(scope, owner, first.asset.id);
    expect(await service.list(readScope, owner)).toHaveLength(1);
  });

  it("preserves the authoritative relation when provider deletion fails", async () => {
    const { service } = harness({
      async delete() {
        throw new Error("provider-down");
      },
    });
    const created = await service.upload(scope, {
      owner,
      file: file(),
      alt: "Foto protegida",
      publish: true,
    });

    await expect(
      service.delete(scope, owner, created.asset.id),
    ).rejects.toThrow("MEDIA_STORAGE_DELETE_FAILED");
    await expect(service.list(readScope, owner)).resolves.toHaveLength(1);
  });

  it("returns asset-not-found for a missing relation", async () => {
    const { service } = harness();
    await expect(
      service.setCover(scope, owner, "media-missing"),
    ).rejects.toThrow("MEDIA_ASSET_NOT_FOUND");
  });

  it("requires accessible alt text before publication", async () => {
    const { service } = harness();
    const created = await service.upload(scope, {
      owner,
      file: file(),
      alt: "",
    });
    await expect(
      service.setPublished(scope, owner, created.asset.id, true),
    ).rejects.toThrow("MEDIA_ALT_REQUIRED_FOR_PUBLICATION");
    const updated = await service.updateAlt(
      scope,
      owner,
      created.asset.id,
      "Fachada iluminada ao pôr do sol",
    );
    expect(updated.alt).toContain("Fachada");
    await expect(
      service.setPublished(scope, owner, created.asset.id, true),
    ).resolves.toMatchObject({ publicationState: "published" });
  });

  it("supports canonical projection, legacy fallback and no-image state", async () => {
    const { service } = harness();
    const none = await service.resolveWithLegacyFallback(
      readScope,
      owner,
      "Lugar sem foto",
      () => null,
    );
    expect(none.source).toBe("none");

    const legacy = await service.resolveWithLegacyFallback(
      readScope,
      owner,
      "Toca do Morcego",
      (place) => ({ place, images: ["/legacy/toca.jpg"] }),
    );
    expect(legacy.source).toBe("legacy");

    await service.upload(scope, {
      owner,
      file: file(),
      role: "cover",
      alt: "Vista panorâmica",
      publish: true,
    });
    const canonical = await service.resolveWithLegacyFallback(
      readScope,
      owner,
      "Toca do Morcego",
      () => ({ place: "Toca do Morcego", images: ["/legacy/toca.jpg"] }),
    );
    expect(canonical.source).toBe("canonical");
    expect(canonical.projection.coverImage).not.toBeNull();
    expect(canonical.legacy).toBeNull();
  });
});

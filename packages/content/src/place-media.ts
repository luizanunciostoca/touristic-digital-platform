export const placeMediaRoles = Object.freeze([
  "cover",
  "gallery",
  "logo",
  "menu",
  "product",
  "other",
] as const);

export type PlaceMediaRole = (typeof placeMediaRoles)[number];
export type MediaPublicationState = "draft" | "published";

export interface MediaAsset {
  readonly id: string;
  readonly businessId: string;
  readonly type: "image";
  readonly provider: string;
  readonly providerReference: string;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  readonly checksumSha256: string;
  readonly alt: string;
  readonly publicationState: MediaPublicationState;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PlaceMedia {
  readonly placeId: string;
  readonly mediaId: string;
  readonly role: PlaceMediaRole;
  readonly sortOrder: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PlaceMediaOwner {
  readonly placeId: string;
  readonly businessId: string;
}

export interface MediaAccessScope {
  readonly businessIds: readonly string[];
  readonly canMutate: boolean;
}

export interface MediaUploadFile {
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
  readonly bytes: Uint8Array;
}

export interface StoredMediaObject {
  readonly provider: string;
  readonly providerReference: string;
  readonly checksumSha256: string;
}

export interface MediaStoragePort {
  upload(input: {
    readonly businessId: string;
    readonly placeId: string;
    readonly file: MediaUploadFile;
  }): Promise<StoredMediaObject>;
  delete(input: {
    readonly businessId: string;
    readonly provider: string;
    readonly providerReference: string;
  }): Promise<void>;
}

export interface PlaceMediaRepository {
  getAsset(mediaId: string): Promise<MediaAsset | null>;
  getAssetByChecksum(
    businessId: string,
    checksumSha256: string,
  ): Promise<MediaAsset | null>;
  saveAsset(asset: MediaAsset): Promise<void>;
  deleteAsset(mediaId: string): Promise<void>;
  listLinks(placeId: string): Promise<readonly PlaceMedia[]>;
  listLinksByMedia(mediaId: string): Promise<readonly PlaceMedia[]>;
  saveLink(link: PlaceMedia): Promise<void>;
  deleteLink(placeId: string, mediaId: string): Promise<void>;
}

export interface PlaceMediaServiceOptions {
  readonly repository: PlaceMediaRepository;
  readonly storage: MediaStoragePort;
  readonly now: () => string;
  readonly createMediaId: () => string;
  readonly maxAssetsPerPlace?: number;
  readonly maxBytes?: number;
  readonly maxDimension?: number;
}

export interface PlaceMediaUploadInput {
  readonly owner: PlaceMediaOwner;
  readonly file: MediaUploadFile;
  readonly role?: PlaceMediaRole;
  readonly alt?: string;
  readonly publish?: boolean;
}

export interface PlaceMediaProjectionImage {
  readonly mediaId: string;
  readonly provider: string;
  readonly providerReference: string;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
}

export interface PlaceMediaProjection {
  readonly placeId: string;
  readonly coverImage: PlaceMediaProjectionImage | null;
  readonly gallery: readonly PlaceMediaProjectionImage[];
  readonly logo: PlaceMediaProjectionImage | null;
}

export interface LegacyPhotoFallback {
  readonly place: string;
  readonly images: readonly string[];
}

export interface PlaceMediaResolution {
  readonly source: "canonical" | "legacy" | "none";
  readonly projection: PlaceMediaProjection;
  readonly legacy: LegacyPhotoFallback | null;
}

const DEFAULT_MAX_ASSETS = 40;
const DEFAULT_MAX_BYTES = 12 * 1024 * 1024;
const DEFAULT_MAX_DIMENSION = 8192;
const MIN_DIMENSION = 1;
const MAX_ALT_LENGTH = 300;
const MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);
const ROLE_SET = new Set<string>(placeMediaRoles);
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:_-]{1,159}$/u;
const CHECKSUM = /^[a-f0-9]{64}$/u;

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[<>]/gu, "").trim().slice(0, max);
}

function requireIdentifier(value: unknown, code: string): string {
  const normalized = cleanText(value, 160);
  if (!IDENTIFIER.test(normalized)) throw new Error(code);
  return normalized;
}

function assertOwner(scope: MediaAccessScope, owner: PlaceMediaOwner): void {
  requireIdentifier(owner.placeId, "INVALID_PLACE_ID");
  const businessId = requireIdentifier(owner.businessId, "INVALID_BUSINESS_ID");
  if (!scope.businessIds.includes(businessId)) {
    throw new Error("MEDIA_ACCESS_BUSINESS_DENIED");
  }
}

function assertMutation(scope: MediaAccessScope, owner: PlaceMediaOwner): void {
  assertOwner(scope, owner);
  if (!scope.canMutate) throw new Error("MEDIA_ACCESS_MUTATION_DENIED");
}

function assertRole(role: unknown): asserts role is PlaceMediaRole {
  if (typeof role !== "string" || !ROLE_SET.has(role)) {
    throw new Error("INVALID_MEDIA_ROLE");
  }
}

function assertFile(
  file: MediaUploadFile,
  maxBytes: number,
  maxDimension: number,
): void {
  if (!MIME_TYPES.has(file.mimeType)) throw new Error("MEDIA_INVALID_MIME");
  if (
    !Number.isSafeInteger(file.byteSize) ||
    file.byteSize <= 0 ||
    file.byteSize > maxBytes ||
    file.bytes.byteLength !== file.byteSize
  ) {
    throw new Error("MEDIA_INVALID_SIZE");
  }
  if (
    !Number.isSafeInteger(file.width) ||
    !Number.isSafeInteger(file.height) ||
    file.width < MIN_DIMENSION ||
    file.height < MIN_DIMENSION ||
    file.width > maxDimension ||
    file.height > maxDimension
  ) {
    throw new Error("MEDIA_INVALID_DIMENSIONS");
  }
  if (!cleanText(file.fileName, 240)) throw new Error("MEDIA_INVALID_FILE");
}

function normalizeAlt(value: unknown): string {
  return cleanText(value, MAX_ALT_LENGTH);
}

function assertPublishableAlt(alt: string): void {
  if (!alt) throw new Error("MEDIA_ALT_REQUIRED_FOR_PUBLICATION");
}

function imageFromAsset(asset: MediaAsset): PlaceMediaProjectionImage {
  return Object.freeze({
    mediaId: asset.id,
    provider: asset.provider,
    providerReference: asset.providerReference,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    alt: asset.alt,
  });
}

function sortedLinks(links: readonly PlaceMedia[]): readonly PlaceMedia[] {
  return Object.freeze(
    [...links].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.mediaId.localeCompare(b.mediaId),
    ),
  );
}

export function createInMemoryPlaceMediaRepository(): PlaceMediaRepository {
  const assets = new Map<string, MediaAsset>();
  const links = new Map<string, PlaceMedia>();

  const linkKey = (placeId: string, mediaId: string) =>
    `${placeId}::${mediaId}`;

  return Object.freeze({
    async getAsset(mediaId) {
      return assets.get(mediaId) ?? null;
    },
    async getAssetByChecksum(businessId, checksumSha256) {
      for (const asset of assets.values()) {
        if (
          asset.businessId === businessId &&
          asset.checksumSha256 === checksumSha256
        ) {
          return asset;
        }
      }
      return null;
    },
    async saveAsset(asset) {
      assets.set(asset.id, asset);
    },
    async deleteAsset(mediaId) {
      assets.delete(mediaId);
    },
    async listLinks(placeId) {
      return sortedLinks(
        [...links.values()].filter((link) => link.placeId === placeId),
      );
    },
    async listLinksByMedia(mediaId) {
      return sortedLinks(
        [...links.values()].filter((link) => link.mediaId === mediaId),
      );
    },
    async saveLink(link) {
      links.set(linkKey(link.placeId, link.mediaId), link);
    },
    async deleteLink(placeId, mediaId) {
      links.delete(linkKey(placeId, mediaId));
    },
  });
}

export function createPlaceMediaService(options: PlaceMediaServiceOptions) {
  const maxAssetsPerPlace = options.maxAssetsPerPlace ?? DEFAULT_MAX_ASSETS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;

  async function requireOwnedAsset(
    scope: MediaAccessScope,
    owner: PlaceMediaOwner,
    mediaIdInput: unknown,
  ): Promise<MediaAsset> {
    assertOwner(scope, owner);
    const mediaId = requireIdentifier(mediaIdInput, "INVALID_MEDIA_ID");
    const asset = await options.repository.getAsset(mediaId);
    if (!asset) throw new Error("MEDIA_ASSET_NOT_FOUND");
    if (asset.businessId !== owner.businessId) {
      throw new Error("MEDIA_ACCESS_BUSINESS_DENIED");
    }
    const links = await options.repository.listLinks(owner.placeId);
    if (!links.some((link) => link.mediaId === mediaId)) {
      throw new Error("MEDIA_PLACE_RELATION_NOT_FOUND");
    }
    return asset;
  }

  async function projection(
    scope: MediaAccessScope,
    owner: PlaceMediaOwner,
  ): Promise<PlaceMediaProjection> {
    assertOwner(scope, owner);
    const links = sortedLinks(
      await options.repository.listLinks(owner.placeId),
    );
    const resolved = await Promise.all(
      links.map(async (link) => ({
        link,
        asset: await options.repository.getAsset(link.mediaId),
      })),
    );
    const authorized = resolved.filter(
      (entry): entry is { link: PlaceMedia; asset: MediaAsset } =>
        entry.asset !== null &&
        entry.asset.businessId === owner.businessId &&
        entry.asset.publicationState === "published",
    );
    const cover =
      authorized.find((entry) => entry.link.role === "cover") ?? null;
    const logo = authorized.find((entry) => entry.link.role === "logo") ?? null;
    const gallery = authorized
      .filter(
        (entry) => entry.link.role === "gallery" || entry.link.role === "cover",
      )
      .map((entry) => imageFromAsset(entry.asset));

    return Object.freeze({
      placeId: owner.placeId,
      coverImage: cover ? imageFromAsset(cover.asset) : null,
      gallery: Object.freeze(gallery),
      logo: logo ? imageFromAsset(logo.asset) : null,
    });
  }

  return Object.freeze({
    async upload(
      scope: MediaAccessScope,
      input: PlaceMediaUploadInput,
    ): Promise<{ readonly asset: MediaAsset; readonly link: PlaceMedia }> {
      assertMutation(scope, input.owner);
      assertFile(input.file, maxBytes, maxDimension);
      const role = input.role ?? "gallery";
      assertRole(role);
      const alt = normalizeAlt(input.alt);
      if (input.publish) assertPublishableAlt(alt);

      const existingLinks = await options.repository.listLinks(
        input.owner.placeId,
      );
      if (existingLinks.length >= maxAssetsPerPlace) {
        throw new Error("MEDIA_PLACE_LIMIT_EXCEEDED");
      }

      let stored: StoredMediaObject;
      try {
        stored = await options.storage.upload({
          businessId: input.owner.businessId,
          placeId: input.owner.placeId,
          file: input.file,
        });
      } catch {
        throw new Error("MEDIA_STORAGE_UPLOAD_FAILED");
      }

      if (!CHECKSUM.test(stored.checksumSha256)) {
        try {
          await options.storage.delete({
            businessId: input.owner.businessId,
            provider: stored.provider,
            providerReference: stored.providerReference,
          });
        } catch {
          // best-effort cleanup; the invalid object is not made authoritative
        }
        throw new Error("MEDIA_INVALID_PROVIDER_METADATA");
      }

      const duplicate = await options.repository.getAssetByChecksum(
        input.owner.businessId,
        stored.checksumSha256,
      );
      if (duplicate) {
        try {
          await options.storage.delete({
            businessId: input.owner.businessId,
            provider: stored.provider,
            providerReference: stored.providerReference,
          });
        } catch {
          // duplicate storage cleanup is best-effort
        }
        throw new Error("MEDIA_DUPLICATE_ASSET");
      }

      const mediaId = requireIdentifier(
        options.createMediaId(),
        "INVALID_MEDIA_ID",
      );
      const now = options.now();
      const asset = Object.freeze<MediaAsset>({
        id: mediaId,
        businessId: input.owner.businessId,
        type: "image",
        provider: cleanText(stored.provider, 80),
        providerReference: cleanText(stored.providerReference, 500),
        mimeType: input.file.mimeType,
        width: input.file.width,
        height: input.file.height,
        byteSize: input.file.byteSize,
        checksumSha256: stored.checksumSha256,
        alt,
        publicationState: input.publish ? "published" : "draft",
        createdAt: now,
        updatedAt: now,
      });
      if (!asset.provider || !asset.providerReference) {
        try {
          await options.storage.delete({
            businessId: input.owner.businessId,
            provider: stored.provider,
            providerReference: stored.providerReference,
          });
        } catch {
          // best-effort cleanup; invalid provider metadata is never persisted
        }
        throw new Error("MEDIA_INVALID_PROVIDER_METADATA");
      }
      const link = Object.freeze<PlaceMedia>({
        placeId: input.owner.placeId,
        mediaId,
        role,
        sortOrder: existingLinks.length,
        createdAt: now,
        updatedAt: now,
      });

      try {
        await options.repository.saveAsset(asset);
        await options.repository.saveLink(link);
      } catch {
        try {
          await options.repository.deleteLink(input.owner.placeId, mediaId);
          await options.repository.deleteAsset(mediaId);
          await options.storage.delete({
            businessId: input.owner.businessId,
            provider: stored.provider,
            providerReference: stored.providerReference,
          });
        } catch {
          // rollback is best-effort; no partial record is returned to the caller
        }
        throw new Error("MEDIA_PERSISTENCE_FAILED");
      }
      return Object.freeze({ asset, link });
    },

    async list(scope: MediaAccessScope, owner: PlaceMediaOwner) {
      assertOwner(scope, owner);
      const links = sortedLinks(
        await options.repository.listLinks(owner.placeId),
      );
      const entries = await Promise.all(
        links.map(async (link) => {
          const asset = await options.repository.getAsset(link.mediaId);
          if (!asset) return null;
          if (asset.businessId !== owner.businessId) {
            throw new Error("MEDIA_ACCESS_BUSINESS_DENIED");
          }
          return Object.freeze({ asset, link });
        }),
      );
      return Object.freeze(
        entries.filter(
          (
            entry,
          ): entry is {
            readonly asset: MediaAsset;
            readonly link: PlaceMedia;
          } => entry !== null,
        ),
      );
    },

    async updateAlt(
      scope: MediaAccessScope,
      owner: PlaceMediaOwner,
      mediaId: string,
      altInput: unknown,
    ): Promise<MediaAsset> {
      assertMutation(scope, owner);
      const asset = await requireOwnedAsset(scope, owner, mediaId);
      const alt = normalizeAlt(altInput);
      if (asset.publicationState === "published") assertPublishableAlt(alt);
      const updated = Object.freeze({
        ...asset,
        alt,
        updatedAt: options.now(),
      });
      await options.repository.saveAsset(updated);
      return updated;
    },

    async setPublished(
      scope: MediaAccessScope,
      owner: PlaceMediaOwner,
      mediaId: string,
      published: boolean,
    ): Promise<MediaAsset> {
      assertMutation(scope, owner);
      const asset = await requireOwnedAsset(scope, owner, mediaId);
      if (published) assertPublishableAlt(asset.alt);
      const updated = Object.freeze({
        ...asset,
        publicationState: published
          ? ("published" as const)
          : ("draft" as const),
        updatedAt: options.now(),
      });
      await options.repository.saveAsset(updated);
      return updated;
    },

    async setRole(
      scope: MediaAccessScope,
      owner: PlaceMediaOwner,
      mediaId: string,
      role: PlaceMediaRole,
    ): Promise<PlaceMedia> {
      assertMutation(scope, owner);
      assertRole(role);
      const asset = await requireOwnedAsset(scope, owner, mediaId);
      if (
        (role === "cover" || role === "logo") &&
        asset.publicationState === "published"
      ) {
        assertPublishableAlt(asset.alt);
      }
      const links = await options.repository.listLinks(owner.placeId);
      const current = links.find((link) => link.mediaId === mediaId);
      if (!current) throw new Error("MEDIA_PLACE_RELATION_NOT_FOUND");
      const now = options.now();

      if (role === "cover" || role === "logo") {
        for (const link of links) {
          if (link.role === role && link.mediaId !== mediaId) {
            await options.repository.saveLink(
              Object.freeze({
                ...link,
                role: "gallery" as const,
                updatedAt: now,
              }),
            );
          }
        }
      }
      const updated = Object.freeze({ ...current, role, updatedAt: now });
      await options.repository.saveLink(updated);
      return updated;
    },

    async setCover(
      scope: MediaAccessScope,
      owner: PlaceMediaOwner,
      mediaId: string,
    ) {
      return this.setRole(scope, owner, mediaId, "cover");
    },

    async setLogo(
      scope: MediaAccessScope,
      owner: PlaceMediaOwner,
      mediaId: string,
    ) {
      return this.setRole(scope, owner, mediaId, "logo");
    },

    async reorder(
      scope: MediaAccessScope,
      owner: PlaceMediaOwner,
      orderedMediaIds: readonly string[],
    ): Promise<readonly PlaceMedia[]> {
      assertMutation(scope, owner);
      const links = await options.repository.listLinks(owner.placeId);
      if (
        orderedMediaIds.length !== links.length ||
        new Set(orderedMediaIds).size !== orderedMediaIds.length ||
        links.some((link) => !orderedMediaIds.includes(link.mediaId))
      ) {
        throw new Error("MEDIA_REORDER_SET_MISMATCH");
      }
      const now = options.now();
      const updates = orderedMediaIds.map((mediaId, sortOrder) => {
        const current = links.find((link) => link.mediaId === mediaId);
        if (!current) throw new Error("MEDIA_ASSET_NOT_FOUND");
        return Object.freeze({ ...current, sortOrder, updatedAt: now });
      });
      for (const link of updates) await options.repository.saveLink(link);
      return Object.freeze(updates);
    },

    async delete(
      scope: MediaAccessScope,
      owner: PlaceMediaOwner,
      mediaId: string,
    ): Promise<void> {
      assertMutation(scope, owner);
      const asset = await requireOwnedAsset(scope, owner, mediaId);
      const existingLinks = await options.repository.listLinksByMedia(asset.id);
      const isLastLink =
        existingLinks.length === 1 &&
        existingLinks[0]?.placeId === owner.placeId;

      if (!isLastLink) {
        await options.repository.deleteLink(owner.placeId, asset.id);
        return;
      }

      try {
        await options.storage.delete({
          businessId: owner.businessId,
          provider: asset.provider,
          providerReference: asset.providerReference,
        });
      } catch {
        throw new Error("MEDIA_STORAGE_DELETE_FAILED");
      }

      await options.repository.deleteLink(owner.placeId, asset.id);
      await options.repository.deleteAsset(asset.id);
    },

    projection,

    async resolveWithLegacyFallback(
      scope: MediaAccessScope,
      owner: PlaceMediaOwner,
      legacyPlaceName: string,
      legacyResolver: (placeName: string) => LegacyPhotoFallback | null,
    ): Promise<PlaceMediaResolution> {
      const canonical = await projection(scope, owner);
      if (
        canonical.coverImage ||
        canonical.gallery.length > 0 ||
        canonical.logo
      ) {
        return Object.freeze({
          source: "canonical" as const,
          projection: canonical,
          legacy: null,
        });
      }
      const legacy = legacyResolver(legacyPlaceName);
      if (legacy?.images.length) {
        return Object.freeze({
          source: "legacy" as const,
          projection: canonical,
          legacy,
        });
      }
      return Object.freeze({
        source: "none" as const,
        projection: canonical,
        legacy: null,
      });
    },
  });
}

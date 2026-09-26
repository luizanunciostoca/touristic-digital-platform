import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const mappings = JSON.parse(
  await readFile(
    resolve(
      root,
      "apps/morro-digital-platform/src/migration/legacy-commercial-place-mappings.json",
    ),
    "utf8",
  ),
);
const mediaMappings = (
  await readFile(
    resolve(
      root,
      "apps/morro-digital-platform/src/migration/legacy-commercial-media-mappings.ndjson",
    ),
    "utf8",
  )
)
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => JSON.parse(line));

function imageMetadata(bytes) {
  if (
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    const chunk = bytes.subarray(12, 16).toString("ascii");
    if (chunk === "VP8X") {
      return {
        mimeType: "image/webp",
        width: 1 + bytes.readUIntLE(24, 3),
        height: 1 + bytes.readUIntLE(27, 3),
      };
    }
    if (
      chunk === "VP8 " &&
      bytes[23] === 0x9d &&
      bytes[24] === 0x01 &&
      bytes[25] === 0x2a
    ) {
      return {
        mimeType: "image/webp",
        width: bytes.readUInt16LE(26) & 0x3fff,
        height: bytes.readUInt16LE(28) & 0x3fff,
      };
    }
    throw new Error("UNSUPPORTED_WEBP");
  }

  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error("UNSUPPORTED_IMAGE");
  }
  let offset = 2;
  while (offset < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const length = bytes.readUInt16BE(offset);
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker)
    ) {
      return {
        mimeType: "image/jpeg",
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      };
    }
    offset += length;
  }
  throw new Error("JPEG_DIMENSIONS_MISSING");
}

describe("legacy commercial media mappings", () => {
  it("covers all 72 explicit commercial identities exactly once", () => {
    expect(mediaMappings).toHaveLength(72);
    expect(mediaMappings.map((entry) => entry.sourceKey).sort()).toEqual(
      mappings.map((entry) => entry.sourceKey).sort(),
    );

    for (const entry of mediaMappings) {
      const identity = mappings.find(
        (mapping) => mapping.sourceKey === entry.sourceKey,
      );
      expect(entry).toMatchObject({
        sourceSystem: identity.sourceSystem,
        businessId: identity.businessId,
        placeId: identity.placeId,
        destinationId: identity.destinationId,
      });
    }
  });

  it("freezes six complete media sets and 66 intentional no-image states", () => {
    const migrate = mediaMappings.filter(
      (entry) => entry.disposition === "migrate",
    );
    const noImage = mediaMappings.filter(
      (entry) => entry.disposition === "intentional_no_image",
    );
    expect(migrate).toHaveLength(6);
    expect(noImage).toHaveLength(66);
    expect(noImage.every((entry) => entry.assets.length === 0)).toBe(true);
    expect(migrate.every((entry) => entry.assets.length === 3)).toBe(true);
    expect(migrate.flatMap((entry) => entry.assets)).toHaveLength(18);
  });

  it("binds every migrated asset to the exact audited bytes and metadata", async () => {
    const mediaIds = new Set();
    for (const entry of mediaMappings) {
      for (const asset of entry.assets) {
        expect(mediaIds.has(asset.mediaId)).toBe(false);
        mediaIds.add(asset.mediaId);
        expect(asset.provider).toBe("legacy-static");
        expect(asset.providerReference).toMatch(/^\/images\/fotos\//u);
        expect(asset.publicationState).toBe("published");
        const diskPath = resolve(root, asset.providerReference.slice(1));
        const bytes = await readFile(diskPath);
        const checksum = createHash("sha256").update(bytes).digest("hex");
        expect(checksum).toBe(asset.checksumSha256);
        expect(bytes.length).toBe(asset.byteSize);
        expect(imageMetadata(bytes)).toEqual({
          mimeType: asset.mimeType,
          width: asset.width,
          height: asset.height,
        });
      }
      if (entry.disposition === "migrate") {
        expect(entry.assets.map((asset) => asset.role)).toEqual([
          "cover",
          "gallery",
          "gallery",
        ]);
        expect(entry.assets.map((asset) => asset.sortOrder)).toEqual([0, 1, 2]);
      }
    }
  });
});

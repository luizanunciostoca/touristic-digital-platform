import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createFilesystemMediaStorage } from "./media-storage-runtime.mjs";

const roots = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function responseCapture() {
  const headers = new Map();
  return {
    statusCode: 0,
    body: null,
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), String(value));
    },
    end(value = null) {
      this.body = value;
    },
    header(name) {
      return headers.get(String(name).toLowerCase());
    },
  };
}

describe("Media filesystem storage runtime", () => {
  it("stores immutable media under tenant/place paths and serves it back", async () => {
    const root = await mkdtemp(join(tmpdir(), "morro-media-"));
    roots.push(root);
    const storage = createFilesystemMediaStorage({ basePath: root });
    const bytes = Buffer.from("canonical-media-fixture");

    const stored = await storage.upload({
      businessId: "business-a",
      placeId: "place-business-a",
      file: {
        mimeType: "image/png",
        bytes,
      },
    });

    expect(stored.provider).toBe("filesystem");
    expect(stored.providerReference).toMatch(
      /^\/media\/business-a\/place-business-a\/[0-9a-f-]+\.png$/u,
    );
    expect(stored.checksumSha256).toMatch(/^[a-f0-9]{64}$/u);

    const response = responseCapture();
    expect(
      await storage.handlePublic(
        { method: "GET" },
        response,
        new URL(`http://localhost${stored.providerReference}`),
      ),
    ).toBe(true);
    expect(response.statusCode).toBe(200);
    expect(response.header("content-type")).toBe("image/png");
    expect(Buffer.from(response.body).equals(bytes)).toBe(true);

    const relative = stored.providerReference.replace(/^\/media\//u, "");
    expect(
      (await readFile(join(root, ...relative.split("/")))).equals(bytes),
    ).toBe(true);
  });

  it("rejects provider mismatches and path traversal references", async () => {
    const root = await mkdtemp(join(tmpdir(), "morro-media-"));
    roots.push(root);
    const storage = createFilesystemMediaStorage({ basePath: root });

    await expect(
      storage.delete({
        provider: "other",
        providerReference: "/media/business-a/place-a/file.png",
      }),
    ).rejects.toThrow("MEDIA_STORAGE_PROVIDER_MISMATCH");

    await expect(
      storage.delete({
        provider: "filesystem",
        providerReference: "/media/business-a/place-a/../escape.png",
      }),
    ).rejects.toThrow("MEDIA_STORAGE_REFERENCE_INVALID");
  });
});

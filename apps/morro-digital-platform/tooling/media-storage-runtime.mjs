import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  lstat,
  readFile,
  realpath,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";

const MIME_EXTENSIONS = Object.freeze({
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/avif": ".avif",
});
const EXTENSION_MIME = Object.freeze({
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
});
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/u;

function isMissing(error) {
  return Boolean(
    error &&
    typeof error === "object" &&
    ["ENOENT", "ENOTDIR"].includes(error.code),
  );
}

function inside(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function safeSegment(value, code) {
  const normalized = String(value ?? "").trim();
  if (!SEGMENT.test(normalized)) throw new Error(code);
  return normalized;
}

function checksum(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function createFilesystemMediaStorage({
  basePath,
  publicPrefix = "/media",
} = {}) {
  const configuredRoot = String(basePath ?? "").trim();
  if (!configuredRoot) throw new Error("MEDIA_STORAGE_BASE_PATH_REQUIRED");
  const root = resolve(configuredRoot);
  const prefix = `/${String(publicPrefix).replace(/^\/+|\/+$/gu, "")}`;

  async function resolveObject(reference, ensureParent = false) {
    const value = String(reference ?? "");
    if (!value.startsWith(`${prefix}/`)) {
      throw new Error("MEDIA_STORAGE_REFERENCE_INVALID");
    }
    const relative = value.slice(prefix.length + 1);
    const segments = relative.split("/");
    if (segments.length !== 3)
      throw new Error("MEDIA_STORAGE_REFERENCE_INVALID");
    for (const segment of segments) {
      if (
        !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/u.test(segment) ||
        segment === "." ||
        segment === ".."
      ) {
        throw new Error("MEDIA_STORAGE_REFERENCE_INVALID");
      }
    }
    const target = resolve(root, ...segments);
    if (!inside(root, target))
      throw new Error("MEDIA_STORAGE_PATH_ESCAPE_REJECTED");

    if (ensureParent) await mkdir(dirname(target), { recursive: true });

    let existingAncestor = dirname(target);
    while (inside(root, existingAncestor)) {
      try {
        const actual = await realpath(existingAncestor);
        let actualRoot;
        try {
          actualRoot = await realpath(root);
        } catch (error) {
          if (!isMissing(error)) throw error;
          await mkdir(root, { recursive: true });
          actualRoot = await realpath(root);
        }
        if (!inside(actualRoot, actual)) {
          throw new Error("MEDIA_STORAGE_PATH_ESCAPE_REJECTED");
        }
        break;
      } catch (error) {
        if (!isMissing(error)) throw error;
        if (existingAncestor === root) break;
        existingAncestor = dirname(existingAncestor);
      }
    }

    try {
      const stat = await lstat(target);
      if (stat.isSymbolicLink())
        throw new Error("MEDIA_STORAGE_PATH_ESCAPE_REJECTED");
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    return target;
  }

  return Object.freeze({
    async upload({ businessId, placeId, file }) {
      const business = safeSegment(businessId, "INVALID_BUSINESS_ID");
      const place = safeSegment(placeId, "INVALID_PLACE_ID");
      const extension = MIME_EXTENSIONS[file.mimeType];
      if (!extension) throw new Error("MEDIA_INVALID_MIME");
      const reference = `${prefix}/${business}/${place}/${randomUUID()}${extension}`;
      const target = await resolveObject(reference, true);
      const bytes = Buffer.from(file.bytes);
      await writeFile(target, bytes, { flag: "wx" });
      return Object.freeze({
        provider: "filesystem",
        providerReference: reference,
        checksumSha256: checksum(bytes),
      });
    },

    async delete({ provider, providerReference }) {
      if (provider !== "filesystem")
        throw new Error("MEDIA_STORAGE_PROVIDER_MISMATCH");
      const target = await resolveObject(providerReference);
      try {
        await unlink(target);
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
    },

    async handlePublic(request, response, requestUrl) {
      if (!requestUrl.pathname.startsWith(`${prefix}/`)) return false;
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.statusCode = 405;
        response.setHeader("Allow", "GET, HEAD");
        response.end();
        return true;
      }
      try {
        const target = await resolveObject(requestUrl.pathname);
        const bytes = await readFile(target);
        response.statusCode = 200;
        response.setHeader(
          "Content-Type",
          EXTENSION_MIME[extname(target).toLowerCase()] ||
            "application/octet-stream",
        );
        response.setHeader("Content-Length", String(bytes.length));
        response.setHeader(
          "Cache-Control",
          "public, max-age=31536000, immutable",
        );
        response.setHeader("X-Content-Type-Options", "nosniff");
        if (request.method === "HEAD") response.end();
        else response.end(bytes);
      } catch (error) {
        if (isMissing(error)) {
          response.statusCode = 404;
          response.end();
          return true;
        }
        throw error;
      }
      return true;
    },
  });
}

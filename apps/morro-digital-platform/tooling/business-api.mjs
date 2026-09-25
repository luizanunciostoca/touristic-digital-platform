import { hasAuthCapability } from "@touristic/auth";
import { createAuthorizedBusinessProfileService } from "@touristic/business";

const businessProfilePattern = /^\/api\/business\/([^/]+)\/profile$/u;
const businessCatalogPattern = /^\/api\/business\/([^/]+)\/catalog$/u;
const businessMediaPattern = /^\/api\/business\/([^/]+)\/media$/u;
const businessMediaOrderPattern = /^\/api\/business\/([^/]+)\/media\/order$/u;
const businessMediaEntryPattern =
  /^\/api\/business\/([^/]+)\/media\/([A-Za-z0-9][A-Za-z0-9:_-]{1,159})$/u;
const businessCatalogCreatePattern =
  /^\/api\/business\/([^/]+)\/catalog\/(product|offer|menu|menu-category|menu-item)$/u;
const businessCatalogUpdatePattern =
  /^\/api\/business\/([^/]+)\/catalog\/(product|offer|menu|menu-category|menu-item)\/([a-z0-9][a-z0-9_-]{0,159})$/u;
const maxBodyBytes = 64 * 1024;

function json(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request, limit = maxBodyBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > limit) throw new Error("REQUEST_BODY_TOO_LARGE");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function createMemoryBusinessProfileRepository() {
  const profiles = new Map();
  return Object.freeze({
    async getProfile(businessId) {
      return profiles.get(businessId) ?? null;
    },
    async saveProfile(businessId, profile) {
      profiles.set(businessId, profile);
      return profile;
    },
  });
}

export function createBusinessApi({
  authApi,
  repository = createMemoryBusinessProfileRepository(),
  getPlacePlatformRuntime = () => null,
}) {
  if (!authApi?.authorizeBusinessRequest) {
    throw new Error("BUSINESS_AUTH_BOUNDARY_REQUIRED");
  }
  const profiles = createAuthorizedBusinessProfileService(repository);

  function decodedBusinessId(value) {
    try {
      return decodeURIComponent(value || "");
    } catch {
      return "";
    }
  }

  function profileRoute(pathname) {
    const match = businessProfilePattern.exec(pathname);
    return match ? { businessId: decodedBusinessId(match[1]) } : null;
  }

  function mediaRoute(pathname) {
    const order = businessMediaOrderPattern.exec(pathname);
    if (order) {
      return {
        businessId: decodedBusinessId(order[1]),
        mediaId: null,
        mode: "order",
      };
    }
    const entry = businessMediaEntryPattern.exec(pathname);
    if (entry) {
      return {
        businessId: decodedBusinessId(entry[1]),
        mediaId: entry[2],
        mode: "entry",
      };
    }
    const root = businessMediaPattern.exec(pathname);
    if (root) {
      return {
        businessId: decodedBusinessId(root[1]),
        mediaId: null,
        mode: "root",
      };
    }
    return null;
  }

  function catalogRoute(pathname) {
    const update = businessCatalogUpdatePattern.exec(pathname);
    if (update) {
      return {
        businessId: decodedBusinessId(update[1]),
        kind: update[2],
        id: update[3],
        mode: "update",
      };
    }
    const create = businessCatalogCreatePattern.exec(pathname);
    if (create) {
      return {
        businessId: decodedBusinessId(create[1]),
        kind: create[2],
        id: null,
        mode: "create",
      };
    }
    const read = businessCatalogPattern.exec(pathname);
    if (read) {
      return {
        businessId: decodedBusinessId(read[1]),
        kind: null,
        id: null,
        mode: "read",
      };
    }
    return null;
  }

  function mediaCapability(response, session, capability) {
    if (hasAuthCapability(session.role, capability)) return true;
    json(response, 403, { error: "CAPABILITY_DENIED", capability });
    return false;
  }

  function mediaError(response, error) {
    const code =
      error instanceof Error ? error.message : "MEDIA_REQUEST_FAILED";
    const status = code.includes("NOT_FOUND")
      ? 404
      : code.includes("STALE_REVISION") ||
          code.includes("ALREADY_EXISTS") ||
          code.includes("DUPLICATE") ||
          code.includes("CURRENTLY_PUBLISHED")
        ? 409
        : code.includes("DENIED") ||
            code.includes("OWNER_MISMATCH") ||
            code.includes("CROSS_")
          ? 403
          : code.includes("INVALID") ||
              code.includes("REQUIRED") ||
              code.includes("REORDER_SET_MISMATCH")
            ? 400
            : code.includes("UNAVAILABLE") || code.includes("DATABASE")
              ? 503
              : 500;
    json(response, status, { error: code });
  }

  function catalogError(response, error) {
    const code =
      error instanceof Error ? error.message : "CATALOG_REQUEST_FAILED";
    const status = code.includes("NOT_FOUND")
      ? 404
      : code.includes("ALREADY_EXISTS") || code.includes("STALE_REVISION")
        ? 409
        : code.includes("DENIED") ||
            code.includes("MISMATCH") ||
            code.includes("CROSS_")
          ? 403
          : code.includes("INVALID") || code.includes("REQUIRED")
            ? 400
            : code.includes("UNAVAILABLE") || code.includes("DATABASE")
              ? 503
              : 500;
    json(response, status, { error: code });
  }

  return Object.freeze({
    matches(pathname) {
      return (
        businessProfilePattern.test(pathname) ||
        businessMediaPattern.test(pathname) ||
        businessMediaOrderPattern.test(pathname) ||
        businessMediaEntryPattern.test(pathname) ||
        businessCatalogPattern.test(pathname) ||
        businessCatalogCreatePattern.test(pathname) ||
        businessCatalogUpdatePattern.test(pathname)
      );
    },

    async handle(request, response, pathname) {
      const media = mediaRoute(pathname);
      if (media) {
        const runtime = getPlacePlatformRuntime();
        if (
          !runtime?.getMediaDraft ||
          !runtime?.uploadMediaDraft ||
          !runtime?.updateMediaDraft ||
          !runtime?.reorderMediaDraft ||
          !runtime?.deleteMediaDraft
        ) {
          json(response, 503, { error: "PLACE_PLATFORM_UNAVAILABLE" });
          return;
        }

        const mutation = request.method !== "GET";
        const access = await authApi.authorizeBusinessRequest(
          request,
          response,
          media.businessId,
          {
            mutation,
            auditAction: mutation
              ? "business.media.write"
              : "business.media.read",
          },
        );
        if (!access) return;
        if (
          !mediaCapability(
            response,
            access.session,
            mutation ? "content.manage" : "content.read",
          )
        ) {
          return;
        }

        try {
          if (media.mode === "root" && request.method === "GET") {
            response.setHeader("Vary", "Cookie");
            json(response, 200, await runtime.getMediaDraft(access.businessId));
            return;
          }
          if (media.mode === "root" && request.method === "POST") {
            const body = await readJsonBody(request, 18 * 1024 * 1024);
            const data = await runtime.uploadMediaDraft(
              access.session,
              access.businessId,
              body,
            );
            response.setHeader("Vary", "Cookie");
            json(response, 201, { data });
            return;
          }
          if (media.mode === "order" && request.method === "PUT") {
            const body = await readJsonBody(request);
            const data = await runtime.reorderMediaDraft(
              access.session,
              access.businessId,
              body.orderedMediaIds,
            );
            response.setHeader("Vary", "Cookie");
            json(response, 200, { data });
            return;
          }
          if (media.mode === "entry" && request.method === "PUT") {
            const body = await readJsonBody(request);
            const data = await runtime.updateMediaDraft(
              access.session,
              access.businessId,
              media.mediaId,
              body,
            );
            response.setHeader("Vary", "Cookie");
            json(response, 200, { data });
            return;
          }
          if (media.mode === "entry" && request.method === "DELETE") {
            await runtime.deleteMediaDraft(
              access.session,
              access.businessId,
              media.mediaId,
            );
            response.setHeader("Vary", "Cookie");
            json(response, 200, { data: { deleted: true } });
            return;
          }
          json(response, 405, { error: "METHOD_NOT_ALLOWED" });
          return;
        } catch (error) {
          mediaError(response, error);
          return;
        }
      }

      const catalog = catalogRoute(pathname);
      if (catalog) {
        const runtime = getPlacePlatformRuntime();
        if (
          !runtime?.getCatalogDraft ||
          !runtime?.createCatalogDraft ||
          !runtime?.updateCatalogDraft
        ) {
          json(response, 503, { error: "PLACE_PLATFORM_UNAVAILABLE" });
          return;
        }

        const mutation = catalog.mode !== "read";
        const access = await authApi.authorizeBusinessRequest(
          request,
          response,
          catalog.businessId,
          {
            mutation,
            auditAction:
              catalog.mode === "read"
                ? "business.catalog.read"
                : "business.catalog.write",
          },
        );
        if (!access) return;

        try {
          if (catalog.mode === "read" && request.method === "GET") {
            response.setHeader("Vary", "Cookie");
            json(
              response,
              200,
              await runtime.getCatalogDraft(access.businessId),
            );
            return;
          }

          if (catalog.mode === "create" && request.method === "POST") {
            const body = await readJsonBody(request);
            const data = await runtime.createCatalogDraft(
              access.session,
              access.businessId,
              catalog.kind,
              body,
            );
            response.setHeader("Vary", "Cookie");
            json(response, 201, { data });
            return;
          }

          if (catalog.mode === "update" && request.method === "PUT") {
            const body = await readJsonBody(request);
            const data = await runtime.updateCatalogDraft(
              access.session,
              access.businessId,
              catalog.kind,
              catalog.id,
              body,
            );
            response.setHeader("Vary", "Cookie");
            json(response, 200, { data });
            return;
          }

          json(response, 405, { error: "METHOD_NOT_ALLOWED" });
          return;
        } catch (error) {
          catalogError(response, error);
          return;
        }
      }

      const matched = profileRoute(pathname);
      if (!matched) {
        json(response, 404, { error: "BUSINESS_RESOURCE_NOT_FOUND" });
        return;
      }

      if (request.method === "GET") {
        const access = await authApi.authorizeBusinessRequest(
          request,
          response,
          matched.businessId,
          { mutation: false, auditAction: "business.profile.read" },
        );
        if (!access) return;
        const profile = await profiles.getProfile(
          access.session,
          access.businessId,
        );
        response.setHeader("Vary", "Cookie");
        if (!profile) {
          json(response, 404, { error: "BUSINESS_PROFILE_NOT_FOUND" });
          return;
        }
        json(response, 200, { profile });
        return;
      }

      if (request.method === "PUT") {
        const access = await authApi.authorizeBusinessRequest(
          request,
          response,
          matched.businessId,
          { mutation: true, auditAction: "business.profile.write" },
        );
        if (!access) return;

        let body;
        try {
          body = await readJsonBody(request);
        } catch {
          json(response, 400, { error: "INVALID_BUSINESS_PROFILE" });
          return;
        }

        const profile = await profiles.saveProfile(
          access.session,
          access.businessId,
          body,
        );
        response.setHeader("Vary", "Cookie");
        json(response, 200, { success: true, profile });
        return;
      }

      json(response, 405, { error: "METHOD_NOT_ALLOWED" });
    },
  });
}

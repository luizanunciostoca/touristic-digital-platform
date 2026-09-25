import { createAuthorizedBusinessProfileService } from "@touristic/business";

const businessProfilePattern = /^\/api\/business\/([^/]+)\/profile$/u;
const businessCatalogPattern = /^\/api\/business\/([^/]+)\/catalog$/u;
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

async function readJsonBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBodyBytes) throw new Error("REQUEST_BODY_TOO_LARGE");
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

  function catalogError(response, error) {
    const code = error instanceof Error ? error.message : "CATALOG_REQUEST_FAILED";
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
        businessCatalogPattern.test(pathname) ||
        businessCatalogCreatePattern.test(pathname) ||
        businessCatalogUpdatePattern.test(pathname)
      );
    },

    async handle(request, response, pathname) {
      const catalog = catalogRoute(pathname);
      if (catalog) {
        const runtime = getPlacePlatformRuntime();
        if (!runtime?.getCatalogDraft || !runtime?.createCatalogDraft || !runtime?.updateCatalogDraft) {
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

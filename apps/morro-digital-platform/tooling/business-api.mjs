import { createAuthorizedBusinessProfileService } from "@touristic/business";

const businessProfilePattern = /^\/api\/business\/([^/]+)\/profile$/u;
const businessCatalogPattern = /^\/api\/business\/([^/]+)\/catalog$/u;
const businessCatalogDraftPattern =
  /^\/api\/business\/([^/]+)\/catalog\/(product|offer|menu|menu-category|menu-item)$/u;
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
  placePlatformRuntime = null,
}) {
  if (!authApi?.authorizeBusinessRequest) {
    throw new Error("BUSINESS_AUTH_BOUNDARY_REQUIRED");
  }
  const profiles = createAuthorizedBusinessProfileService(repository);

  function route(pathname) {
    const profile = businessProfilePattern.exec(pathname);
    const catalog = businessCatalogPattern.exec(pathname);
    const catalogDraft = businessCatalogDraftPattern.exec(pathname);
    const match = profile ?? catalog ?? catalogDraft;
    if (!match) return null;
    try {
      return {
        businessId: decodeURIComponent(match[1] || ""),
        resource: profile ? "profile" : catalog ? "catalog" : "catalog-draft",
        kind: catalogDraft?.[2] ?? null,
      };
    } catch {
      return { businessId: "", resource: "invalid", kind: null };
    }
  }

  return Object.freeze({
    matches(pathname) {
      return Boolean(route(pathname));
    },

    async handle(request, response, pathname) {
      const matched = route(pathname);
      if (!matched) {
        json(response, 404, { error: "BUSINESS_RESOURCE_NOT_FOUND" });
        return;
      }

      if (matched.resource === "catalog") {
        if (!placePlatformRuntime?.getBusinessCatalog) {
          json(response, 503, { error: "BUSINESS_CATALOG_UNAVAILABLE" });
          return;
        }
        if (request.method !== "GET") {
          json(response, 405, { error: "METHOD_NOT_ALLOWED" });
          return;
        }
        const access = await authApi.authorizeBusinessRequest(
          request,
          response,
          matched.businessId,
          { mutation: false, auditAction: "business.catalog.read" },
        );
        if (!access) return;
        try {
          const catalog = await placePlatformRuntime.getBusinessCatalog(
            access.businessId,
          );
          response.setHeader("Vary", "Cookie");
          json(response, 200, { catalog });
        } catch (error) {
          const code =
            error instanceof Error ? error.message : "BUSINESS_CATALOG_FAILED";
          json(
            response,
            code.includes("NOT_FOUND") ? 404 : 503,
            { error: code },
          );
        }
        return;
      }

      if (matched.resource === "catalog-draft") {
        if (!placePlatformRuntime?.createCatalogDraft) {
          json(response, 503, { error: "BUSINESS_CATALOG_UNAVAILABLE" });
          return;
        }
        if (request.method !== "POST") {
          json(response, 405, { error: "METHOD_NOT_ALLOWED" });
          return;
        }
        const access = await authApi.authorizeBusinessRequest(
          request,
          response,
          matched.businessId,
          { mutation: true, auditAction: "business.catalog.write" },
        );
        if (!access) return;
        let body;
        try {
          body = await readJsonBody(request);
          const draft = await placePlatformRuntime.createCatalogDraft(
            access.businessId,
            matched.kind,
            body,
          );
          response.setHeader("Vary", "Cookie");
          json(response, 201, { data: draft });
        } catch (error) {
          const code =
            error instanceof Error ? error.message : "BUSINESS_CATALOG_FAILED";
          const status = code.includes("NOT_FOUND")
            ? 404
            : code.includes("DENIED") || code.includes("MISMATCH")
              ? 403
              : code.includes("INVALID") || code.includes("REQUIRED")
                ? 400
                : 409;
          json(response, status, { error: code });
        }
        return;
      }

      if (matched.resource !== "profile") {
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

import { createAuthorizedBusinessProfileService } from "@touristic/business";

const businessProfilePattern = /^\/api\/business\/([^/]+)\/profile$/u;
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
}) {
  if (!authApi?.authorizeBusinessRequest) {
    throw new Error("BUSINESS_AUTH_BOUNDARY_REQUIRED");
  }
  const profiles = createAuthorizedBusinessProfileService(repository);

  function route(pathname) {
    const match = businessProfilePattern.exec(pathname);
    if (!match) return null;
    try {
      return { businessId: decodeURIComponent(match[1] || "") };
    } catch {
      return { businessId: "" };
    }
  }

  return Object.freeze({
    matches(pathname) {
      return businessProfilePattern.test(pathname);
    },

    async handle(request, response, pathname) {
      const matched = route(pathname);
      if (!matched) {
        json(response, 404, { error: "BUSINESS_RESOURCE_NOT_FOUND" });
        return;
      }

      if (request.method === "GET") {
        const access = authApi.authorizeBusinessRequest(
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
        const access = authApi.authorizeBusinessRequest(
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

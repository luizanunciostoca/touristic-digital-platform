import { randomBytes } from "node:crypto";

import { CrmLeadServerBoundary } from "@touristic/crm/leads-boundary";
import { CrmMeetingServerBoundary } from "@touristic/crm/meetings-boundary";
import { CrmProposalServerBoundary } from "@touristic/crm/proposals-boundary";
import {
  applyCrmM71Schema,
  createCrmMySqlPoolFromEnvironment,
  CrmLeadHttpTransport,
  CrmMeetingHttpTransport,
  CrmProposalHttpTransport,
  MySqlCrmLeadAuditPort,
  MySqlCrmLeadRepository,
  MySqlCrmMeetingAuditPort,
  MySqlCrmMeetingRepository,
  MySqlCrmProposalAuditPort,
  MySqlCrmProposalRepository,
} from "@touristic/crm-server";

const crmPrefixes = [
  "/api/crm/leads",
  "/api/crm/meetings",
  "/api/crm/proposals",
];
const maxBodyBytes = 64 * 1024;

function matchesCrmPath(pathname) {
  return crmPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

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
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function queryObject(searchParams) {
  const query = {};
  for (const [key, value] of searchParams.entries()) {
    if ((key === "limit" || key === "offset") && /^\d+$/u.test(value)) {
      query[key] = Number(value);
    } else {
      query[key] = value;
    }
  }
  return query;
}

function createUnavailableApi() {
  return Object.freeze({
    matches: matchesCrmPath,
    async handle(_request, response) {
      json(response, 503, { error: "CRM_DATABASE_NOT_CONFIGURED" });
    },
  });
}

function createProposalShareToken() {
  return randomBytes(24).toString("base64url");
}

export function createCrmApi({ authApi, getEnvironmentValue }) {
  if (!authApi?.resolveSession || !authApi?.authorizeMutation) {
    throw new Error("CRM_AUTH_BOUNDARY_REQUIRED");
  }

  const databaseUrl = String(
    getEnvironmentValue("CRM_DATABASE_URL") || "",
  ).trim();
  if (!databaseUrl) return createUnavailableApi();

  const pool = createCrmMySqlPoolFromEnvironment({
    CRM_DATABASE_URL: databaseUrl,
  });
  const leadBoundary = new CrmLeadServerBoundary(
    new MySqlCrmLeadRepository(pool),
    new MySqlCrmLeadAuditPort(pool),
  );
  const meetingBoundary = new CrmMeetingServerBoundary(
    new MySqlCrmMeetingRepository(pool),
    new MySqlCrmMeetingAuditPort(pool),
  );
  const proposalBoundary = new CrmProposalServerBoundary(
    new MySqlCrmProposalRepository(pool),
    new MySqlCrmProposalAuditPort(pool),
    createProposalShareToken,
  );
  let schemaReady;

  async function ensureSchema() {
    schemaReady ??= applyCrmM71Schema(pool);
    return schemaReady;
  }

  return Object.freeze({
    matches: matchesCrmPath,

    async handle(request, response, requestUrl) {
      await ensureSchema();
      let body;
      if (request.method !== "GET" && request.method !== "HEAD") {
        try {
          body = await readJsonBody(request);
        } catch {
          json(response, 400, { error: "INVALID_REQUEST" });
          return;
        }
      }

      const session = authApi.resolveSession(request);
      const mutationSecurity =
        session && request.method !== "GET" && request.method !== "HEAD"
          ? authApi.authorizeMutation(request, session, "crm.resource")
          : { allowed: true };
      const authPort = {
        async resolveSession() {
          return session;
        },
        async authorizeMutation() {
          return mutationSecurity;
        },
      };
      const transports = [
        new CrmLeadHttpTransport(leadBoundary, authPort),
        new CrmMeetingHttpTransport(meetingBoundary, authPort),
        new CrmProposalHttpTransport(proposalBoundary, authPort),
      ];
      const transport = transports.find((candidate) =>
        candidate.matches(requestUrl.pathname),
      );
      if (!transport) {
        json(response, 404, { error: "NOT_FOUND" });
        return;
      }

      const result = await transport.handle({
        method: String(request.method || "GET"),
        pathname: requestUrl.pathname,
        query: queryObject(requestUrl.searchParams),
        ...(body === undefined ? {} : { body }),
      });
      response.setHeader("Vary", "Cookie");
      json(response, result.status, result.body);
    },
  });
}

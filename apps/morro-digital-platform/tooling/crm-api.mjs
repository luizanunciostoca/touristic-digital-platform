import { randomBytes } from "node:crypto";

import { CrmContractServerBoundary } from "@touristic/crm/contracts-boundary";
import { CrmContractPublicBoundary } from "@touristic/crm/contracts-public-boundary";
import { CrmFollowUpServerBoundary } from "@touristic/crm/followups-boundary";
import { CrmLeadDetailServerBoundary } from "@touristic/crm/lead-detail-boundary";
import { CrmLeadServerBoundary } from "@touristic/crm/leads-boundary";
import { CrmMeetingServerBoundary } from "@touristic/crm/meetings-boundary";
import { CrmMetricsServerBoundary } from "@touristic/crm/metrics-boundary";
import { CrmProposalServerBoundary } from "@touristic/crm/proposals-boundary";
import { CrmProposalPublicBoundary } from "@touristic/crm/proposals-public-boundary";
import { CrmReferralServerBoundary } from "@touristic/crm/referrals-boundary";
import { CrmTrialServerBoundary } from "@touristic/crm/trials-boundary";
import {
  applyCrmM99Schema,
  createCrmMySqlPoolFromEnvironment,
  createCrmTrialSchedulerHost,
  CrmContractHttpTransport,
  CrmContractPublicHttpTransport,
  CrmFollowUpHttpTransport,
  CrmLeadDetailHttpTransport,
  CrmLeadHttpTransport,
  CrmMeetingHttpTransport,
  CrmMetricsHttpTransport,
  CrmProposalHttpTransport,
  CrmProposalPublicHttpTransport,
  CrmReferralHttpTransport,
  CrmTrialHttpTransport,
  MySqlCrmContractAuditPort,
  MySqlCrmContractRepository,
  MySqlCrmFollowUpAuditPort,
  MySqlCrmFollowUpRepository,
  MySqlCrmLeadAuditPort,
  MySqlCrmLeadDetailAuditPort,
  MySqlCrmLeadDetailRepository,
  MySqlCrmLeadRepository,
  MySqlCrmMeetingAuditPort,
  MySqlCrmMeetingRepository,
  MySqlCrmMetricsAuditPort,
  MySqlCrmMetricsRepository,
  MySqlCrmProposalAuditPort,
  MySqlCrmProposalRepository,
  MySqlCrmReferralAuditPort,
  MySqlCrmReferralRepository,
  MySqlCrmTrialAuditPort,
  MySqlCrmTrialRepository,
} from "@touristic/crm-server";

const crmPrefixes = [
  "/api/crm/public/contracts",
  "/api/crm/public/proposals",
  "/api/crm/contracts",
  "/api/crm/follow-ups",
  "/api/crm/leads",
  "/api/crm/meetings",
  "/api/crm/metrics",
  "/api/crm/proposals",
  "/api/crm/referrals",
  "/api/crm/trials",
];
const maxBodyBytes = 128 * 1024;
const defaultTrialSchedulerIntervalMs = 60_000;

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

function clientIp(request) {
  const forwarded = request.headers?.["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof first === "string" && first.trim()) {
    return first.split(",")[0]?.trim();
  }
  return (
    request.socket?.remoteAddress ||
    request.connection?.remoteAddress ||
    "unknown"
  );
}

function createUnavailableApi() {
  return Object.freeze({
    matches: matchesCrmPath,
    async start() {},
    async stop() {},
    async handle(_request, response) {
      json(response, 503, { error: "CRM_DATABASE_NOT_CONFIGURED" });
    },
  });
}

function createShareToken() {
  return randomBytes(24).toString("base64url");
}

function createTaskUid() {
  return randomBytes(18).toString("base64url");
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
  const contractRepository = new MySqlCrmContractRepository(pool);
  const contractBoundary = new CrmContractServerBoundary(
    contractRepository,
    new MySqlCrmContractAuditPort(pool),
    createShareToken,
  );
  const contractPublicBoundary = new CrmContractPublicBoundary(
    contractRepository,
  );
  const followUpBoundary = new CrmFollowUpServerBoundary(
    new MySqlCrmFollowUpRepository(pool),
    new MySqlCrmFollowUpAuditPort(pool),
  );
  const leadBoundary = new CrmLeadServerBoundary(
    new MySqlCrmLeadRepository(pool),
    new MySqlCrmLeadAuditPort(pool),
  );
  const leadDetailBoundary = new CrmLeadDetailServerBoundary(
    new MySqlCrmLeadDetailRepository(pool),
    new MySqlCrmLeadDetailAuditPort(pool),
  );
  const meetingBoundary = new CrmMeetingServerBoundary(
    new MySqlCrmMeetingRepository(pool),
    new MySqlCrmMeetingAuditPort(pool),
  );
  const metricsBoundary = new CrmMetricsServerBoundary(
    new MySqlCrmMetricsRepository(pool),
    new MySqlCrmMetricsAuditPort(pool),
  );
  const proposalRepository = new MySqlCrmProposalRepository(pool);
  const proposalBoundary = new CrmProposalServerBoundary(
    proposalRepository,
    new MySqlCrmProposalAuditPort(pool),
    createShareToken,
  );
  const proposalPublicBoundary = new CrmProposalPublicBoundary(
    proposalRepository,
  );
  const referralBoundary = new CrmReferralServerBoundary(
    new MySqlCrmReferralRepository(pool),
    new MySqlCrmReferralAuditPort(pool),
  );
  const trialBoundary = new CrmTrialServerBoundary(
    new MySqlCrmTrialRepository(pool),
    new MySqlCrmTrialAuditPort(pool),
  );
  const trialScheduler = createCrmTrialSchedulerHost(pool, {
    intervalMs: Number(
      getEnvironmentValue("CRM_TRIAL_SCHEDULER_INTERVAL_MS") ||
        defaultTrialSchedulerIntervalMs,
    ),
    createTaskUid,
    actorSubject: "crm-system:trial-scheduler",
    onError(error) {
      console.error(
        "CRM trial scheduler failure.",
        error instanceof Error ? error.stack || error.message : error,
      );
    },
  });
  let schemaReady;
  let started = false;
  let stopped = false;

  async function ensureSchema() {
    schemaReady ??= applyCrmM99Schema(pool);
    return schemaReady;
  }

  return Object.freeze({
    matches: matchesCrmPath,

    async start() {
      if (started) return;
      if (stopped) throw new Error("CRM_RUNTIME_ALREADY_STOPPED");
      await ensureSchema();
      trialScheduler.start();
      started = true;
    },

    async stop() {
      if (stopped) return;
      stopped = true;
      await trialScheduler.stop();
      await pool.end();
    },

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
        new CrmContractPublicHttpTransport(contractPublicBoundary),
        new CrmProposalPublicHttpTransport(proposalPublicBoundary),
        new CrmContractHttpTransport(contractBoundary, authPort),
        new CrmFollowUpHttpTransport(followUpBoundary, authPort),
        new CrmLeadDetailHttpTransport(leadDetailBoundary, authPort),
        new CrmLeadHttpTransport(leadBoundary, authPort),
        new CrmMeetingHttpTransport(meetingBoundary, authPort),
        new CrmMetricsHttpTransport(metricsBoundary, authPort),
        new CrmProposalHttpTransport(proposalBoundary, authPort),
        new CrmReferralHttpTransport(referralBoundary, authPort),
        new CrmTrialHttpTransport(trialBoundary, authPort),
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
        clientIp: clientIp(request),
        ...(body === undefined ? {} : { body }),
      });
      response.setHeader("Vary", "Cookie");
      json(response, result.status, result.body);
    },
  });
}

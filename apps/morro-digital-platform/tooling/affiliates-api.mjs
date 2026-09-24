import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
export const affiliatesApiPrefix = "/api/affiliates/v1";

const maxBodyBytes = 16 * 1024;
const maxReferralTtlSeconds = 30 * 24 * 60 * 60;
const minReferralTtlSeconds = 5 * 60;
const captureActorReference = "affiliate-referral-capture:v1";
const attributionSubjectCookie = "md_aff_subject";
const forbiddenReferralAuthorityFields = new Set([
  "affiliateId",
  "destinationId",
  "commissionMinor",
  "commission",
  "revenue",
  "revenueMinor",
  "eligibleRevenueMinor",
  "rateBasisPoints",
  "payout",
  "payoutId",
  "settlement",
  "settlementId",
  "wallet",
  "walletId",
]);

function forbiddenReferralAuthority(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  return Object.keys(body).some((key) =>
    forbiddenReferralAuthorityFields.has(key),
  );
}

function firstHeader(value) {
  return Array.isArray(value) ? value[0] : value;
}

function header(request, name) {
  return String(
    firstHeader(request.headers?.[name.toLowerCase()]) || "",
  ).trim();
}

function cookieValue(request, name) {
  const raw = header(request, "cookie");
  for (const part of raw.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return "";
    }
  }
  return "";
}

function referralSubjectReference(request) {
  const existing = cookieValue(request, attributionSubjectCookie);
  if (
    safeReference(existing, 180) &&
    existing.startsWith("visitor_") &&
    existing.length >= 24
  ) {
    return existing;
  }
  return `visitor_${randomUUID().replaceAll("-", "")}`;
}

function serializeAttributionSubjectCookie(value, secure) {
  const attributes = [
    `${attributionSubjectCookie}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${maxReferralTtlSeconds}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

function json(response, statusCode, payload, correlationId) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Correlation-ID", correlationId);
  response.end(JSON.stringify(payload));
}

function correlationId(request) {
  const supplied = header(request, "x-correlation-id");
  if (/^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/u.test(supplied)) return supplied;
  return `corr_aff_${randomUUID().replaceAll("-", "")}`;
}

async function readJsonBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBodyBytes) throw new Error("AFFILIATE_REQUEST_TOO_LARGE");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function enabledValue(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function configuredTtl(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return maxReferralTtlSeconds;
  return Math.max(
    minReferralTtlSeconds,
    Math.min(maxReferralTtlSeconds, parsed),
  );
}

function normalizeOrigin(value) {
  try {
    return new URL(String(value || "").trim()).origin;
  } catch {
    return "";
  }
}

function requestOrigin(request) {
  const proto = header(request, "x-forwarded-proto") || "http";
  const host = header(request, "x-forwarded-host") || header(request, "host");
  return host ? normalizeOrigin(`${proto}://${host}`) : "";
}

function safeReturnPath(value) {
  if (value === undefined || value === null || value === "") return "/";
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("\0")
  ) {
    return null;
  }
  try {
    const parsed = new URL(value, "https://morro.invalid");
    if (parsed.origin !== "https://morro.invalid") return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function safeReference(value, max = 180) {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value) &&
    value.length <= max
  );
}

function encodeTokenPayload(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function signatureFor(encodedPayload, secret) {
  return createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function issueAffiliateReferralToken(
  input,
  secret,
  nowEpochSeconds = Math.floor(Date.now() / 1000),
) {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("AFFILIATE_REFERRAL_SECRET_INVALID");
  }
  const ttlSeconds = configuredTtl(input.ttlSeconds);
  const payload = Object.freeze({
    v: 1,
    affiliateId: input.affiliateId,
    programId: input.programId,
    destinationId: input.destinationId,
    nonce: randomUUID(),
    issuedAt: nowEpochSeconds,
    expiresAt: nowEpochSeconds + ttlSeconds,
  });
  const encoded = encodeTokenPayload(payload);
  return Object.freeze({
    token: `${encoded}.${signatureFor(encoded, secret)}`,
    payload,
  });
}

export function verifyAffiliateReferralToken(
  token,
  secret,
  nowEpochSeconds = Math.floor(Date.now() / 1000),
) {
  if (
    typeof token !== "string" ||
    token.length < 32 ||
    token.length > 4096 ||
    typeof secret !== "string" ||
    secret.length < 32
  ) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, suppliedSignature] = parts;
  const expectedSignature = signatureFor(encoded, secret);
  if (!safeEqual(suppliedSignature, expectedSignature)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    !payload ||
    payload.v !== 1 ||
    !safeReference(payload.affiliateId, 120) ||
    !safeReference(payload.programId, 120) ||
    !safeReference(payload.destinationId, 120) ||
    typeof payload.nonce !== "string" ||
    payload.nonce.length < 16 ||
    !Number.isInteger(payload.issuedAt) ||
    !Number.isInteger(payload.expiresAt) ||
    payload.issuedAt > nowEpochSeconds + 300 ||
    payload.expiresAt <= nowEpochSeconds ||
    payload.expiresAt - payload.issuedAt > maxReferralTtlSeconds
  ) {
    return null;
  }
  return Object.freeze(payload);
}

function tokenDigest(token) {
  return createHash("sha256").update(token).digest("hex");
}

function createDigestPort() {
  return Object.freeze({
    async sha256(canonicalInput) {
      return createHash("sha256").update(canonicalInput).digest("hex");
    },
  });
}

function createAuthorizationPort() {
  return Object.freeze({
    async authorize(action, context) {
      const allowed =
        action === "affiliate.establish_attribution" &&
        context.actorKind === "service" &&
        context.actorReference === captureActorReference &&
        Boolean(context.affiliateId) &&
        Boolean(context.programId);
      return Object.freeze({
        allowed,
        decisionReference: allowed
          ? `affiliate-runtime:v1:${context.correlationId}`.slice(0, 180)
          : "affiliate-runtime:denied",
      });
    },
  });
}

function createEvidenceVerifier(secret, ReferralEvidenceVerificationAdapter) {
  return new ReferralEvidenceVerificationAdapter(async (input) => {
    if (
      input.source !== "platform_link" ||
      !input.evidence ||
      typeof input.evidence !== "object"
    ) {
      return Object.freeze({ accepted: false, code: "INVALID_SOURCE" });
    }
    const token = input.evidence.token;
    const payload = verifyAffiliateReferralToken(token, secret);
    if (
      !payload ||
      payload.affiliateId !== input.affiliateId ||
      payload.programId !== input.programId
    ) {
      return Object.freeze({ accepted: false, code: "INVALID_TOKEN" });
    }
    return Object.freeze({
      accepted: true,
      canonicalEvidence: Object.freeze({
        version: 1,
        tokenDigest: tokenDigest(token),
        destinationId: payload.destinationId,
        issuedAt: payload.issuedAt,
        expiresAt: payload.expiresAt,
      }),
    });
  });
}

async function accountForIdentity(pool, identityReference) {
  const [rows] = await pool.execute(
    `SELECT affiliate_id, identity_reference, account_type, role_category,
            status, identity_verified, contact_verified, fraud_blocked,
            created_at, updated_at
       FROM affiliate_accounts
      WHERE identity_reference = ?
      LIMIT 1`,
    [identityReference],
  );
  return rows[0] ?? null;
}

async function membershipsForAffiliate(pool, affiliateId, destinationId) {
  const [rows] = await pool.execute(
    `SELECT m.membership_id, m.program_id,
            CASE m.status
              WHEN 'active' THEN 'approved'
              WHEN 'inactive' THEN 'closed'
              ELSE m.status
            END AS status,
            m.accepted_terms_version, m.financial_onboarding_status,
            m.joined_at, m.ended_at, m.updated_at,
            p.destination_id, p.status AS program_status, p.terms_version
       FROM affiliate_memberships m
       JOIN affiliate_programs p ON p.program_id = m.program_id
      WHERE m.affiliate_id = ?
        AND p.destination_id = ?
      ORDER BY m.joined_at ASC`,
    [affiliateId, destinationId],
  );
  return rows;
}

async function commercialProjection(pool, account, destinationId) {
  const affiliateId = account.affiliate_id;
  const [
    memberships,
    summaryRows,
    activityRows,
    attributionRows,
    materializationRows,
  ] = await Promise.all([
      membershipsForAffiliate(pool, affiliateId, destinationId),
      pool.execute(
        `SELECT e.currency AS currency,
                COUNT(*) AS entitlement_count,
                CAST(SUM(CASE WHEN e.status = 'pending' THEN e.commission_minor ELSE 0 END) AS CHAR) AS pending_minor,
                CAST(SUM(CASE WHEN e.status = 'earned' THEN e.commission_minor ELSE 0 END) AS CHAR) AS earned_minor,
                CAST(SUM(CASE WHEN e.status = 'reversed' THEN e.commission_minor ELSE 0 END) AS CHAR) AS reversed_minor,
                CAST(SUM(CASE WHEN e.status = 'disputed' THEN e.commission_minor ELSE 0 END) AS CHAR) AS disputed_minor
           FROM affiliate_entitlements e
           JOIN affiliate_programs p ON p.program_id = e.program_id
          WHERE e.affiliate_id = ?
            AND p.destination_id = ?
          GROUP BY e.currency
          ORDER BY e.currency ASC`,
        [affiliateId, destinationId],
      ),
      pool.execute(
        `SELECT c.conversion_id, c.order_id, c.currency,
                CAST(c.eligible_revenue_minor AS CHAR) AS eligible_revenue_minor,
                c.payment_confirmed_at, c.service_occurred_at, c.created_at,
                e.entitlement_id, e.revision, e.status AS entitlement_status,
                CAST(e.commission_minor AS CHAR) AS commission_minor,
                e.rate_basis_points, e.maturity_at,
                mr.state AS materialization_state,
                mr.financial_reference, mr.rejection_code
           FROM affiliate_conversions c
           JOIN affiliate_entitlements e ON e.conversion_id = c.conversion_id
      LEFT JOIN affiliate_materialization_requests mr
             ON mr.entitlement_id = e.entitlement_id
            AND mr.entitlement_revision = e.revision
           JOIN affiliate_programs p ON p.program_id = c.program_id
          WHERE c.affiliate_id = ?
            AND p.destination_id = ?
          ORDER BY c.created_at DESC
          LIMIT 50`,
        [affiliateId, destinationId],
      ),
      pool.execute(
        `SELECT COUNT(*) AS attribution_count,
                MAX(established_at) AS latest_attribution_at
           FROM affiliate_attributions a
           JOIN affiliate_programs p ON p.program_id = a.program_id
          WHERE a.affiliate_id = ?
            AND p.destination_id = ?`,
        [affiliateId, destinationId],
      ),
      pool.execute(
        `SELECT mr2.request_id, mr2.entitlement_id, mr2.entitlement_revision, mr2.conversion_id,
                mr2.state, mr2.financial_reference, mr2.rejection_code, mr2.retryable, mr2.attempts,
                mr2.created_at, mr2.updated_at
           FROM affiliate_materialization_requests mr2
           JOIN affiliate_conversions c2 ON c2.conversion_id = mr2.conversion_id
           JOIN affiliate_programs p2 ON p2.program_id = c2.program_id
          WHERE mr2.affiliate_id = ?
            AND p2.destination_id = ?
          ORDER BY mr2.updated_at DESC
          LIMIT 50`,
        [affiliateId, destinationId],
      ),
    ]);

  const summaries = summaryRows[0].map((row) => ({
    currency: row.currency,
    entitlementCount: Number(row.entitlement_count),
    pendingMinor: row.pending_minor ?? "0",
    earnedMinor: row.earned_minor ?? "0",
    reversedMinor: row.reversed_minor ?? "0",
    disputedMinor: row.disputed_minor ?? "0",
  }));
  const activity = activityRows[0].map((row) => ({
    conversionId: row.conversion_id,
    orderId: row.order_id,
    currency: row.currency,
    eligibleRevenueMinor: row.eligible_revenue_minor,
    paymentConfirmedAt: row.payment_confirmed_at,
    serviceOccurredAt: row.service_occurred_at,
    createdAt: row.created_at,
    entitlementId: row.entitlement_id,
    revision: Number(row.revision),
    entitlementStatus: row.entitlement_status,
    commissionMinor: row.commission_minor,
    rateBasisPoints: Number(row.rate_basis_points),
    maturityAt: row.maturity_at,
    materializationState: row.materialization_state ?? "not_requested",
    financialReference: row.financial_reference ?? null,
    rejectionCode: row.rejection_code ?? null,
  }));
  const attribution = attributionRows[0][0] ?? {};
  const materializations = materializationRows[0].map((row) => ({
    requestId: row.request_id,
    entitlementId: row.entitlement_id,
    entitlementRevision: Number(row.entitlement_revision),
    conversionId: row.conversion_id,
    state: row.state,
    financialReference: row.financial_reference ?? null,
    rejectionCode: row.rejection_code ?? null,
    retryable: row.retryable === 1,
    attempts: Number(row.attempts),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  if (memberships.length === 0) return null;

  return Object.freeze({
    affiliate: Object.freeze({
      affiliateId,
      accountType: account.account_type,
      roleCategory: account.role_category,
      status: account.status,
      identityVerified: account.identity_verified === 1,
      contactVerified: account.contact_verified === 1,
      fraudBlocked: account.fraud_blocked === 1,
      createdAt: account.created_at,
      updatedAt: account.updated_at,
    }),
    memberships,
    summaryByCurrency: summaries,
    attribution: Object.freeze({
      count: Number(attribution.attribution_count ?? 0),
      latestAt: attribution.latest_attribution_at ?? null,
    }),
    conversions: activity,
    materializations,
    payoutAuthority: Object.freeze({
      owner: "Financial",
      affiliateCanInitiatePayout: false,
      note:
        "Repasse, wallet, settlement e payout permanecem autoridade exclusiva do domínio Financial.",
    }),
  });
}

function linkEligibility(account, membership) {
  return (
    account.status === "active" &&
    account.identity_verified === 1 &&
    account.contact_verified === 1 &&
    account.fraud_blocked !== 1 &&
    membership &&
    membership.status === "approved" &&
    typeof membership.accepted_terms_version === "string" &&
    membership.accepted_terms_version.length > 0 &&
    membership.program_status === "active"
  );
}

export function createAffiliatesApi({
  authApi,
  getEnvironmentValue = (key) => process.env[key] ?? "",
  runtimeDependencies = {},
} = {}) {
  if (!authApi?.resolveSession || !authApi?.authorizeMutation) {
    throw new Error("AFFILIATES_AUTH_API_REQUIRED");
  }

  const runtimeEnabled = enabledValue(
    getEnvironmentValue("AFFILIATES_RUNTIME_ENABLED"),
  );
  const production = getEnvironmentValue("NODE_ENV") === "production";
  const configuredDestinationId =
    safeReference(getEnvironmentValue("AFFILIATE_DESTINATION_ID"), 120)
      ? String(getEnvironmentValue("AFFILIATE_DESTINATION_ID")).trim()
      : production
        ? ""
        : "morro-de-sao-paulo";
  const configuredPublicOrigin = normalizeOrigin(
    getEnvironmentValue("AFFILIATE_PUBLIC_ORIGIN"),
  );
  const referralSecret = String(
    getEnvironmentValue("AFFILIATE_REFERRAL_SECRET") || "",
  );
  const referralTtlSeconds = configuredTtl(
    getEnvironmentValue("AFFILIATE_REFERRAL_TTL_SECONDS"),
  );

  let pool = null;
  let application = null;
  let started = false;
  let startError = runtimeEnabled ? "AFFILIATES_RUNTIME_NOT_STARTED" : null;

  function readinessCheck() {
    if (!runtimeEnabled) {
      return Object.freeze({
        status: "pass",
        critical: false,
        detail: "disabled-by-configuration",
      });
    }
    return Object.freeze({
      status: started ? "pass" : "fail",
      critical: true,
      detail: started ? "affiliates-runtime-ready" : startError,
    });
  }

  async function start() {
    if (!runtimeEnabled) return true;
    if (started) return true;
    try {
      if (!configuredDestinationId) {
        throw new Error("AFFILIATE_DESTINATION_ID_REQUIRED");
      }
      if (referralSecret.length < 32) {
        throw new Error("AFFILIATE_REFERRAL_SECRET_INVALID");
      }
      if (production && !configuredPublicOrigin) {
        throw new Error("AFFILIATE_PUBLIC_ORIGIN_REQUIRED");
      }
      const needsServerModule =
        !runtimeDependencies.createPool ||
        !runtimeDependencies.applySchema ||
        !runtimeDependencies.applyIdentitySchema ||
        !runtimeDependencies.createApplication;
      const server =
        runtimeDependencies.serverModule ??
        (needsServerModule
          ? await import("@touristic/affiliates-server")
          : null);
      const createPool =
        runtimeDependencies.createPool ?? server.createAffiliatePool;
      const applySchema =
        runtimeDependencies.applySchema ?? server.applyAffiliatesM154Schema;
      const applyIdentitySchema =
        runtimeDependencies.applyIdentitySchema ??
        server.applyAffiliatesIdentityEligibilityM155;
      const createApplication =
        runtimeDependencies.createApplication ??
        ((activePool) =>
          new server.AffiliateApplicationService(
            activePool,
            createAuthorizationPort(),
            createDigestPort(),
            createEvidenceVerifier(
              referralSecret,
              server.ReferralEvidenceVerificationAdapter,
            ),
          ));

      pool = createPool(getEnvironmentValue("AFFILIATES_DATABASE_URL"));
      await applySchema(pool);
      await applyIdentitySchema(pool);
      application = createApplication(pool);
      started = true;
      startError = null;
      return true;
    } catch (error) {
      startError =
        error instanceof Error
          ? error.message.slice(0, 160)
          : "AFFILIATES_RUNTIME_START_FAILED";
      if (pool) await pool.end().catch(() => undefined);
      pool = null;
      application = null;
      started = false;
      return false;
    }
  }

  async function stop() {
    const activePool = pool;
    pool = null;
    application = null;
    started = false;
    if (activePool) await activePool.end();
  }

  async function authenticatedAccount(request, response, correlation) {
    const session = await authApi.resolveSession(request);
    if (!session) {
      json(response, 401, { error: "AUTH_REQUIRED" }, correlation);
      return null;
    }
    const account = await accountForIdentity(pool, session.subject);
    if (!account) {
      json(response, 404, { error: "AFFILIATE_NOT_FOUND" }, correlation);
      return null;
    }
    return Object.freeze({ session, account });
  }

  async function handleMe(request, response, correlation) {
    if (request.method !== "GET") {
      json(response, 405, { error: "METHOD_NOT_ALLOWED" }, correlation);
      return;
    }
    const active = await authenticatedAccount(request, response, correlation);
    if (!active) return;
    response.setHeader("Vary", "Cookie");
    const projection = await commercialProjection(
      pool,
      active.account,
      configuredDestinationId,
    );
    if (!projection) {
      json(
        response,
        403,
        { error: "AFFILIATE_DESTINATION_FORBIDDEN" },
        correlation,
      );
      return;
    }
    json(response, 200, projection, correlation);
  }

  async function handleReferralLink(request, response, correlation) {
    if (request.method !== "POST") {
      json(response, 405, { error: "METHOD_NOT_ALLOWED" }, correlation);
      return;
    }
    const active = await authenticatedAccount(request, response, correlation);
    if (!active) return;
    if (active.session.role === "viewer") {
      json(response, 403, { error: "READ_ONLY_ROLE" }, correlation);
      return;
    }
    const mutation = authApi.authorizeMutation(
      request,
      active.session,
      "affiliate.referral_link.issue",
    );
    if (!mutation.allowed) {
      json(
        response,
        403,
        {
          error:
            mutation.reason === "invalid_csrf"
              ? "INVALID_CSRF"
              : "ORIGIN_DENIED",
        },
        correlation,
      );
      return;
    }

    let body;
    try {
      body = await readJsonBody(request);
    } catch {
      json(
        response,
        400,
        { error: "INVALID_REFERRAL_LINK_REQUEST" },
        correlation,
      );
      return;
    }
    if (forbiddenReferralAuthority(body)) {
      json(
        response,
        400,
        { error: "REFERRAL_AUTHORITY_FORBIDDEN" },
        correlation,
      );
      return;
    }
    const programId = body?.programId;
    const path = safeReturnPath(body?.path);
    if (!safeReference(programId, 120) || path === null) {
      json(
        response,
        400,
        { error: "INVALID_REFERRAL_LINK_REQUEST" },
        correlation,
      );
      return;
    }

    const memberships = await membershipsForAffiliate(
      pool,
      active.account.affiliate_id,
      configuredDestinationId,
    );
    const membership = memberships.find(
      (item) => item.program_id === programId,
    );
    if (!linkEligibility(active.account, membership)) {
      json(response, 409, { error: "AFFILIATE_NOT_ELIGIBLE" }, correlation);
      return;
    }

    const origin =
      configuredPublicOrigin || (production ? "" : requestOrigin(request));
    if (!origin) {
      json(
        response,
        503,
        { error: "AFFILIATE_PUBLIC_ORIGIN_UNAVAILABLE" },
        correlation,
      );
      return;
    }
    const issued = issueAffiliateReferralToken(
      {
        affiliateId: active.account.affiliate_id,
        programId,
        destinationId: membership.destination_id,
        ttlSeconds: referralTtlSeconds,
      },
      referralSecret,
    );
    const url = new URL("/affiliate-portal-capture.html", origin);
    url.searchParams.set("aff_ref", issued.token);
    url.searchParams.set("return", path);
    json(
      response,
      201,
      {
        referral: {
          url: url.toString(),
          programId,
          destinationId: membership.destination_id,
          expiresAt: new Date(issued.payload.expiresAt * 1000).toISOString(),
        },
      },
      correlation,
    );
  }

  async function handleReferralCapture(request, response, correlation) {
    if (request.method !== "POST") {
      json(response, 405, { error: "METHOD_NOT_ALLOWED" }, correlation);
      return;
    }
    const expectedOrigin =
      configuredPublicOrigin || (production ? "" : requestOrigin(request));
    const suppliedOrigin = normalizeOrigin(header(request, "origin"));
    if (
      !expectedOrigin ||
      !suppliedOrigin ||
      suppliedOrigin !== expectedOrigin
    ) {
      json(response, 403, { error: "ORIGIN_DENIED" }, correlation);
      return;
    }

    let body;
    try {
      body = await readJsonBody(request);
    } catch {
      json(response, 400, { error: "INVALID_REFERRAL_CAPTURE" }, correlation);
      return;
    }
    const payload = verifyAffiliateReferralToken(body?.token, referralSecret);
    if (!payload) {
      json(response, 400, { error: "INVALID_REFERRAL_CAPTURE" }, correlation);
      return;
    }
    if (payload.destinationId !== configuredDestinationId) {
      json(
        response,
        403,
        { error: "AFFILIATE_DESTINATION_FORBIDDEN" },
        correlation,
      );
      return;
    }
    const subjectReference = referralSubjectReference(request);

    try {
      const result = await application.recordReferralAndEstablishAttribution({
        requestId: `capture:${tokenDigest(body.token).slice(0, 40)}:${tokenDigest(
          subjectReference,
        ).slice(0, 40)}`,
        affiliateId: payload.affiliateId,
        programId: payload.programId,
        destinationId: payload.destinationId,
        subjectId: subjectReference,
        source: "platform_link",
        evidence: { token: body.token },
        actorReference: captureActorReference,
        correlationId: correlation,
      });
      response.setHeader(
        "Set-Cookie",
        serializeAttributionSubjectCookie(subjectReference, production),
      );
      response.setHeader("Vary", "Cookie");
      json(
        response,
        200,
        {
          accepted: true,
          attributionId: result.attribution.id,
          expiresAt: result.attribution.expiresAt,
          replayed: result.replayed,
        },
        correlation,
      );
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      const status = code.includes("NOT_ELIGIBLE") ? 409 : 400;
      json(
        response,
        status,
        {
          error:
            status === 409
              ? "AFFILIATE_NOT_ELIGIBLE"
              : "REFERRAL_CAPTURE_REJECTED",
        },
        correlation,
      );
    }
  }

  return Object.freeze({
    start,
    stop,
    readinessCheck,
    matches(pathname) {
      return (
        pathname === affiliatesApiPrefix ||
        pathname.startsWith(`${affiliatesApiPrefix}/`)
      );
    },
    async handle(request, response, requestUrl) {
      const correlation = correlationId(request);
      if (!runtimeEnabled) {
        json(
          response,
          503,
          { error: "AFFILIATES_RUNTIME_DISABLED" },
          correlation,
        );
        return;
      }
      if (!started || !pool || !application) {
        json(
          response,
          503,
          { error: "AFFILIATES_RUNTIME_UNAVAILABLE" },
          correlation,
        );
        return;
      }
      if (requestUrl.pathname === `${affiliatesApiPrefix}/me`) {
        await handleMe(request, response, correlation);
        return;
      }
      if (requestUrl.pathname === `${affiliatesApiPrefix}/referral-links`) {
        await handleReferralLink(request, response, correlation);
        return;
      }
      if (requestUrl.pathname === `${affiliatesApiPrefix}/referral-capture`) {
        await handleReferralCapture(request, response, correlation);
        return;
      }
      json(response, 404, { error: "NOT_FOUND" }, correlation);
    },
  });
}

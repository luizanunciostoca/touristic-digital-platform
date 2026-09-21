import {
  createRefundIdempotencyKey,
  normalizePaymentId,
  normalizeReconciliationFindingId,
  normalizeReconciliationRunId,
} from "@touristic/financial";

const adminPrefix = "/api/admin/v1";

function mappedUrl(requestUrl, pathname) {
  const target = new URL(requestUrl.toString());
  target.pathname = pathname;
  target.search = requestUrl.search;
  return target;
}

function requireDelegationBoundary(authApi) {
  if (!authApi?.withDelegatedSession) {
    throw new Error("ADMIN_SUPPORT_DELEGATION_BOUNDARY_REQUIRED");
  }
  return authApi;
}

async function withEffectiveUser(authApi, request, effectiveUser, operation) {
  if (!effectiveUser) return operation();
  return authApi.withDelegatedSession(request, effectiveUser.id, operation);
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function notFound(response, error = "ADMIN_ROUTE_NOT_FOUND") {
  response.statusCode = 404;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify({ error }));
}

export function createAffiliateAdminAdapter(affiliateAdminRuntime) {
  if (
    !affiliateAdminRuntime?.adminList ||
    !affiliateAdminRuntime?.adminRead ||
    !affiliateAdminRuntime?.adminChangeMembershipStatus
  ) {
    throw new Error("AFFILIATE_ADMIN_OWNER_BOUNDARY_REQUIRED");
  }

  async function ownerResult(
    response,
    result,
    notFoundCode = "AFFILIATE_NOT_FOUND",
  ) {
    if (result.status === "denied") {
      sendJson(response, 403, { error: "CAPABILITY_DENIED" });
      return;
    }
    if (result.status === "invalid") {
      sendJson(response, 400, { error: "INVALID_AFFILIATE_ADMIN_QUERY" });
      return;
    }
    if (result.status === "unavailable") {
      sendJson(response, 503, { error: "AFFILIATE_ADMIN_UNAVAILABLE" });
      return;
    }
    if (result.status === "not_found") {
      sendJson(response, 404, { error: notFoundCode });
      return;
    }
    sendJson(response, 200, { data: result.data });
  }

  return Object.freeze({
    state: "partial",
    coverage: Object.freeze([
      "list",
      "detail",
      "membership-suspend",
      "membership-reactivate",
      "commission-readback",
      "conversion-readback",
    ]),

    async search({ query, actor }) {
      const result = await affiliateAdminRuntime.adminList(actor, {
        query,
        limit: 10,
      });
      if (result.status !== "found") return [];
      return Object.freeze(
        result.data.map((affiliate) =>
          Object.freeze({
            type: "affiliate",
            id: affiliate.affiliateId,
            title: affiliate.identityReference || affiliate.affiliateId,
            context: `${affiliate.status} · ${affiliate.approvedMembershipCount} programa(s) aprovado(s)`,
            href: `#affiliates:${encodeURIComponent(affiliate.affiliateId)}`,
          }),
        ),
      );
    },

    async handle({ request, response, requestUrl, actor }) {
      const detailMatch =
        /^\/api\/admin\/v1\/affiliates\/(aff_[A-Za-z0-9._:-]{8,116})$/u.exec(
          requestUrl.pathname,
        );
      if (request.method === "GET" && detailMatch?.[1]) {
        await ownerResult(
          response,
          await affiliateAdminRuntime.adminRead(actor, detailMatch[1]),
        );
        return;
      }
      if (
        request.method === "GET" &&
        requestUrl.pathname === `${adminPrefix}/affiliates`
      ) {
        await ownerResult(
          response,
          await affiliateAdminRuntime.adminList(actor, {
            query: requestUrl.searchParams.get("query") ?? "",
            limit: requestUrl.searchParams.get("limit") ?? 100,
          }),
          "AFFILIATE_NOT_FOUND",
        );
        return;
      }
      notFound(response, "AFFILIATE_ADMIN_ROUTE_NOT_AVAILABLE");
    },

    async changeMembershipStatus({
      actor,
      affiliateId,
      programId,
      status,
      correlationId,
    }) {
      const detail = await affiliateAdminRuntime.adminRead(actor, affiliateId);
      if (detail.status !== "found") return detail;
      const membership = detail.data.memberships.find(
        (candidate) => candidate.programId === programId,
      );
      if (!membership) {
        return Object.freeze({ status: "not_found", data: null });
      }
      return affiliateAdminRuntime.adminChangeMembershipStatus(actor, {
        affiliateId,
        programId,
        destinationId: membership.destinationId,
        status,
        correlationId,
      });
    },
  });
}

async function readAdminJsonBody(request, maxBytes = 32 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) throw new Error("ADMIN_REQUEST_BODY_TOO_LARGE");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function adminReason(value) {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 240);
  return normalized.length >= 8 ? normalized : null;
}

function contentResponse(response, result, successStatus = 200) {
  if (
    result?.status === "found" ||
    result?.status === "created" ||
    result?.status === "updated"
  ) {
    sendJson(response, result.status === "created" ? 201 : successStatus, {
      data: result.data,
    });
    return;
  }
  if (result?.status === "not_found") {
    sendJson(response, 404, { error: result.error || "CONTENT_NOT_FOUND" });
    return;
  }
  if (result?.status === "invalid") {
    sendJson(response, 400, {
      error: result.error || "CONTENT_INVALID_REQUEST",
    });
    return;
  }
  if (result?.status === "conflict") {
    sendJson(response, 409, { error: result.error || "CONTENT_CONFLICT" });
    return;
  }
  sendJson(response, 503, {
    error: result?.error || "CONTENT_ADMIN_UNAVAILABLE",
  });
}

export function createCrmAdminAdapter(crmApi, authApi) {
  if (!crmApi?.handle) throw new Error("CRM_ADMIN_OWNER_BOUNDARY_REQUIRED");
  const delegation = requireDelegationBoundary(authApi);
  const allowedRoots = Object.freeze([
    "contracts",
    "follow-ups",
    "leads",
    "meetings",
    "metrics",
    "proposals",
    "referrals",
    "trials",
  ]);

  return Object.freeze({
    state: "partial",
    coverage: Object.freeze([
      "contracts",
      "follow-ups",
      "leads",
      "meetings",
      "metrics",
      "proposals",
      "referrals",
      "trials",
    ]),
    async handle({ request, response, requestUrl, effectiveUser }) {
      const relative = requestUrl.pathname.slice(`${adminPrefix}/crm`.length);
      if (!relative || relative === "/") {
        await withEffectiveUser(delegation, request, effectiveUser, () =>
          crmApi.handle(
            request,
            response,
            mappedUrl(requestUrl, "/api/crm/metrics"),
          ),
        );
        return;
      }
      const root = relative.slice(1).split("/", 1)[0];
      if (!allowedRoots.includes(root)) {
        notFound(response, "CRM_ADMIN_ROUTE_NOT_ALLOWED");
        return;
      }
      await withEffectiveUser(delegation, request, effectiveUser, () =>
        crmApi.handle(
          request,
          response,
          mappedUrl(requestUrl, `/api/crm${relative}`),
        ),
      );
    },
  });
}

export function createBusinessAdminAdapter(businessApi, authApi) {
  if (!businessApi?.handle) {
    throw new Error("BUSINESS_ADMIN_OWNER_BOUNDARY_REQUIRED");
  }
  const delegation = requireDelegationBoundary(authApi);
  const pattern =
    /^\/api\/admin\/v1\/businesses\/([a-z0-9][a-z0-9_-]{1,79})\/profile$/u;

  return Object.freeze({
    state: "partial",
    coverage: Object.freeze(["profile"]),
    async handle({ request, response, requestUrl, effectiveUser }) {
      const match = pattern.exec(requestUrl.pathname);
      if (!match?.[1]) {
        notFound(response, "BUSINESS_ADMIN_ROUTE_NOT_ALLOWED");
        return;
      }
      await withEffectiveUser(delegation, request, effectiveUser, () =>
        businessApi.handle(
          request,
          response,
          `/api/business/${encodeURIComponent(match[1])}/profile`,
        ),
      );
    },
  });
}

function ticketingAdminOwnerResult(
  response,
  result,
  notFoundCode = "TICKETING_ADMIN_NOT_FOUND",
) {
  if (result?.status === "invalid") {
    sendJson(response, 400, { error: result.error || "INVALID_ADMIN_QUERY" });
    return;
  }
  if (result?.status === "conflict") {
    sendJson(response, 409, { error: result.error || "ADMIN_STATE_CONFLICT" });
    return;
  }
  if (result?.status === "unavailable") {
    sendJson(response, 503, {
      error: result.error || "TICKETING_ADMIN_UNAVAILABLE",
    });
    return;
  }
  if (result?.status === "not_found") {
    sendJson(response, 404, { error: result.error || notFoundCode });
    return;
  }
  sendJson(response, 200, { data: result?.data ?? null });
}

function adminListQuery(requestUrl) {
  const rawLimit = requestUrl.searchParams.get("limit");
  return Object.freeze({
    query: requestUrl.searchParams.get("q") ?? "",
    destinationId: requestUrl.searchParams.get("destinationId") ?? "",
    businessId: requestUrl.searchParams.get("businessId") ?? "",
    ...(rawLimit ? { limit: Number(rawLimit) } : {}),
  });
}

export function createProductsAdminAdapter(ticketingApi) {
  if (!ticketingApi?.adminListInventory || !ticketingApi?.adminReadInventory) {
    throw new Error("PRODUCTS_ADMIN_OWNER_BOUNDARY_REQUIRED");
  }
  const detailPattern =
    /^\/api\/admin\/v1\/products\/([A-Za-z0-9._:-]{2,120})$/u;
  return Object.freeze({
    state: "partial",
    coverage: Object.freeze([
      "list",
      "search",
      "detail",
      "business-relation",
      "destination-relation",
      "availability",
      "inventory-state",
    ]),
    async search({ query }) {
      const result = await ticketingApi.adminListInventory({
        query,
        limit: 20,
      });
      if (result.status !== "found") return [];
      return Object.freeze(
        result.data.map(({ offer, businessId, availableQuantity }) =>
          Object.freeze({
            type: "product",
            id: offer.id,
            title: offer.label,
            context: `${offer.product.kind} · ${businessId ?? "sem empresa"} · ${availableQuantity} disponível(is)`,
            href: `#products:${encodeURIComponent(offer.id)}`,
          }),
        ),
      );
    },
    async handle({ request, response, requestUrl }) {
      if (
        request.method === "GET" &&
        requestUrl.pathname === `${adminPrefix}/products`
      ) {
        await ticketingAdminOwnerResult(
          response,
          await ticketingApi.adminListInventory(adminListQuery(requestUrl)),
        );
        return;
      }
      const detail = detailPattern.exec(requestUrl.pathname);
      if (request.method === "GET" && detail?.[1]) {
        await ticketingAdminOwnerResult(
          response,
          await ticketingApi.adminReadInventory(detail[1]),
          "PRODUCT_NOT_FOUND",
        );
        return;
      }
      notFound(response, "PRODUCTS_ADMIN_ROUTE_NOT_AVAILABLE");
    },
  });
}

export function createReservationsAdminAdapter(ticketingApi) {
  if (
    !ticketingApi?.adminListReservations ||
    !ticketingApi?.adminReadReservation
  ) {
    throw new Error("RESERVATIONS_ADMIN_OWNER_BOUNDARY_REQUIRED");
  }
  const detailPattern =
    /^\/api\/admin\/v1\/reservations\/([A-Za-z0-9._:-]{2,120})$/u;
  return Object.freeze({
    state: "partial",
    coverage: Object.freeze([
      "list",
      "search",
      "detail",
      "business-relation",
      "destination-relation",
      "customer-reference",
      "order-relation",
      "payment-relation",
      "history",
    ]),
    async search({ query }) {
      const result = await ticketingApi.adminListReservations({
        query,
        limit: 20,
      });
      if (result.status !== "found") return [];
      return Object.freeze(
        result.data.map(({ reservation, businessId, inventoryLabel }) =>
          Object.freeze({
            type: "reservation",
            id: reservation.id,
            title: inventoryLabel || reservation.id,
            context: `${reservation.status} · ${businessId ?? "sem empresa"} · ${reservation.holderReference}`,
            href: `#reservations:${encodeURIComponent(reservation.id)}`,
          }),
        ),
      );
    },
    async handle({ request, response, requestUrl }) {
      if (
        request.method === "GET" &&
        requestUrl.pathname === `${adminPrefix}/reservations`
      ) {
        const input = {
          ...adminListQuery(requestUrl),
          status: requestUrl.searchParams.get("status") ?? "",
        };
        await ticketingAdminOwnerResult(
          response,
          await ticketingApi.adminListReservations(input),
        );
        return;
      }
      const detail = detailPattern.exec(requestUrl.pathname);
      if (request.method === "GET" && detail?.[1]) {
        await ticketingAdminOwnerResult(
          response,
          await ticketingApi.adminReadReservation(detail[1]),
          "RESERVATION_NOT_FOUND",
        );
        return;
      }
      notFound(response, "RESERVATIONS_ADMIN_ROUTE_NOT_AVAILABLE");
    },
  });
}

export function createTicketingAdminAdapter(ticketingApi, authApi) {
  if (!ticketingApi?.handle) {
    throw new Error("TICKETING_ADMIN_OWNER_BOUNDARY_REQUIRED");
  }
  const delegation = requireDelegationBoundary(authApi);
  const allowed = Object.freeze([
    "/inventory",
    "/operator/check-in",
    "/operator/offline-devices",
  ]);

  return Object.freeze({
    state: "partial",
    coverage: Object.freeze([
      "inventory",
      "operator/check-in",
      "operator/offline-devices",
    ]),
    async handle({ request, response, requestUrl, effectiveUser }) {
      const relative = requestUrl.pathname.slice(
        `${adminPrefix}/ticketing`.length,
      );
      if (!allowed.includes(relative)) {
        notFound(response, "TICKETING_ADMIN_ROUTE_NOT_AVAILABLE");
        return;
      }
      await withEffectiveUser(delegation, request, effectiveUser, () =>
        ticketingApi.handle(
          request,
          response,
          mappedUrl(requestUrl, `/api/ticketing/v1${relative}`),
        ),
      );
    },
  });
}

export function createContentAdminAdapter(contentRuntime) {
  if (
    !contentRuntime?.adminList ||
    !contentRuntime?.adminRead ||
    !contentRuntime?.adminCreate ||
    !contentRuntime?.adminRevise ||
    !contentRuntime?.adminTransition
  ) {
    throw new Error("CONTENT_ADMIN_OWNER_BOUNDARY_REQUIRED");
  }

  async function bodyWithReason(request, response) {
    let body;
    try {
      body = await readAdminJsonBody(request);
    } catch {
      sendJson(response, 400, { error: "INVALID_REQUEST" });
      return null;
    }
    const reason = adminReason(body?.reason);
    if (!reason) {
      sendJson(response, 400, { error: "REASON_REQUIRED" });
      return null;
    }
    return Object.freeze({ body, reason });
  }

  return Object.freeze({
    state: "partial",
    coverage: Object.freeze([
      "list",
      "search",
      "detail",
      "create-draft",
      "revise-draft-preview",
      "lifecycle-transition",
    ]),

    async search({ query }) {
      const result = await contentRuntime.adminList({ query, limit: 20 });
      if (result.status !== "found") return [];
      return Object.freeze(
        result.data.map((document) =>
          Object.freeze({
            type: "content",
            id: document.id,
            title:
              typeof document.fields?.title === "string"
                ? document.fields.title
                : document.id,
            context: `${document.kind} · ${document.status} · ${document.destinationId}`,
            href: `#content:${encodeURIComponent(document.id)}`,
          }),
        ),
      );
    },

    async handle({ request, response, requestUrl }) {
      const root = `${adminPrefix}/content`;
      const itemMatch = /^\/api\/admin\/v1\/content\/([^/]+)$/u.exec(
        requestUrl.pathname,
      );
      const transitionMatch =
        /^\/api\/admin\/v1\/content\/([^/]+)\/transition$/u.exec(
          requestUrl.pathname,
        );

      if (requestUrl.pathname === root && request.method === "GET") {
        const limitValue = requestUrl.searchParams.get("limit");
        const result = await contentRuntime.adminList({
          query: requestUrl.searchParams.get("q") ?? "",
          destinationId: requestUrl.searchParams.get("destinationId") ?? "",
          kind: requestUrl.searchParams.get("kind") ?? "",
          status: requestUrl.searchParams.get("status") ?? "",
          ...(limitValue ? { limit: Number(limitValue) } : {}),
        });
        contentResponse(response, result);
        return;
      }

      if (requestUrl.pathname === root && request.method === "POST") {
        const parsed = await bodyWithReason(request, response);
        if (!parsed) return;
        const result = await contentRuntime.adminCreate({
          id: parsed.body?.id,
          destinationId: parsed.body?.destinationId,
          kind: parsed.body?.kind,
          locale: parsed.body?.locale,
          sourceReference: parsed.body?.sourceReference,
          fields: parsed.body?.fields,
        });
        contentResponse(response, result, 201);
        return Object.freeze({
          audit: Object.freeze({
            reason: parsed.reason,
            entityType: "content_document",
            entityId: result.data?.id ?? null,
            previousState: null,
            newState: result.data ?? null,
          }),
        });
      }

      if (transitionMatch?.[1] && request.method === "POST") {
        let id;
        try {
          id = decodeURIComponent(transitionMatch[1]);
        } catch {
          sendJson(response, 400, { error: "CONTENT_INVALID_ID" });
          return;
        }
        const parsed = await bodyWithReason(request, response);
        if (!parsed) return;
        const previous = await contentRuntime.adminRead(id);
        if (previous.status === "not_found") {
          contentResponse(response, previous);
          return;
        }
        if (previous.status !== "found") {
          contentResponse(response, previous);
          return;
        }
        const result = await contentRuntime.adminTransition(id, {
          status: parsed.body?.status,
          scheduledFor: parsed.body?.scheduledFor,
        });
        contentResponse(response, result);
        return Object.freeze({
          audit: Object.freeze({
            reason: parsed.reason,
            entityType: "content_document",
            entityId: id,
            previousState: previous.data,
            newState: result.data ?? null,
          }),
        });
      }

      if (itemMatch?.[1]) {
        let id;
        try {
          id = decodeURIComponent(itemMatch[1]);
        } catch {
          sendJson(response, 400, { error: "CONTENT_INVALID_ID" });
          return;
        }

        if (request.method === "GET") {
          const result = await contentRuntime.adminRead(id);
          contentResponse(response, result);
          return;
        }

        if (request.method === "PATCH") {
          const parsed = await bodyWithReason(request, response);
          if (!parsed) return;
          const previous = await contentRuntime.adminRead(id);
          if (previous.status !== "found") {
            contentResponse(response, previous);
            return;
          }
          const result = await contentRuntime.adminRevise(
            id,
            parsed.body?.fields,
          );
          contentResponse(response, result);
          return Object.freeze({
            audit: Object.freeze({
              reason: parsed.reason,
              entityType: "content_document",
              entityId: id,
              previousState: previous.data,
              newState: result.data ?? null,
            }),
          });
        }
      }

      notFound(response, "CONTENT_ADMIN_ROUTE_NOT_ALLOWED");
    },
  });
}

export function createFinancialAdminAdapter(paymentsApi) {
  if (
    !paymentsApi?.handle ||
    !paymentsApi?.adminFindOrder ||
    !paymentsApi?.adminFindPayment ||
    !paymentsApi?.adminResolvePaymentTenant ||
    !paymentsApi?.adminResolveFindingTenant ||
    !paymentsApi?.adminFindLedger
  ) {
    throw new Error("FINANCIAL_ADMIN_OWNER_BOUNDARY_REQUIRED");
  }

  function delegatedRequest(request, body, extraHeaders = {}) {
    const payload = Buffer.from(JSON.stringify(body), "utf8");
    return Object.freeze({
      method: request.method,
      headers: Object.freeze({
        ...(request.headers ?? {}),
        "content-type": "application/json",
        "content-length": String(payload.length),
        ...extraHeaders,
      }),
      socket: request.socket,
      morroCorrelationId: request.morroCorrelationId,
      async *[Symbol.asyncIterator]() {
        yield payload;
      },
    });
  }

  async function ownerRead(response, result, notFoundCode) {
    if (result.status === "invalid") {
      sendJson(response, 400, { error: "INVALID_ADMIN_QUERY" });
      return;
    }
    if (result.status === "unavailable") {
      sendJson(response, 503, { error: "FINANCIAL_ADMIN_READ_UNAVAILABLE" });
      return;
    }
    if (result.status === "not_found") {
      sendJson(response, 404, { error: notFoundCode });
      return;
    }
    sendJson(response, 200, { data: result.data });
  }

  return Object.freeze({
    state: "partial",
    coverage: Object.freeze([
      "orders-by-id",
      "payments-by-id",
      "ledger-by-external-key",
      "reconciliation-findings",
      "reconciliation-run",
      "reconciliation-acknowledge",
      "refund",
    ]),

    async search({ query }) {
      const normalized = String(query || "").trim();
      if (!normalized) return [];
      const [order, payment] = await Promise.all([
        paymentsApi.adminFindOrder(normalized),
        paymentsApi.adminFindPayment(normalized),
      ]);
      const results = [];
      if (order.status === "found") {
        results.push({
          type: "order",
          id: order.data.id,
          title: order.data.id,
          context: `${order.data.status} · ${order.data.pricing.amount.minorUnits} ${order.data.pricing.amount.currency}`,
          href: `#orders:${encodeURIComponent(order.data.id)}`,
        });
      }
      if (payment.status === "found") {
        results.push({
          type: "payment",
          id: payment.data.id,
          title: payment.data.id,
          context: `${payment.data.status} · ${payment.data.amount.minorUnits} ${payment.data.amount.currency}`,
          href: `#financial:${encodeURIComponent(payment.data.id)}`,
        });
      }
      return Object.freeze(results);
    },

    async handle({ request, response, requestUrl }) {
      const orderMatch = /^\/api\/admin\/v1\/orders\/([A-Za-z0-9_-]+)$/u.exec(
        requestUrl.pathname,
      );
      if (orderMatch?.[1] && request.method === "GET") {
        await ownerRead(
          response,
          await paymentsApi.adminFindOrder(orderMatch[1]),
          "ORDER_NOT_FOUND",
        );
        return;
      }

      const paymentMatch =
        /^\/api\/admin\/v1\/payments\/([A-Za-z0-9_-]+)$/u.exec(
          requestUrl.pathname,
        );
      if (paymentMatch?.[1] && request.method === "GET") {
        await ownerRead(
          response,
          await paymentsApi.adminFindPayment(paymentMatch[1]),
          "PAYMENT_NOT_FOUND",
        );
        return;
      }

      const ledgerPrefix = `${adminPrefix}/financial/ledger/`;
      if (
        request.method === "GET" &&
        requestUrl.pathname.startsWith(ledgerPrefix)
      ) {
        const externalKey = decodeURIComponent(
          requestUrl.pathname.slice(ledgerPrefix.length),
        );
        await ownerRead(
          response,
          await paymentsApi.adminFindLedger(externalKey),
          "LEDGER_TRANSACTION_NOT_FOUND",
        );
        return;
      }

      const findingsMatch =
        /^\/api\/admin\/v1\/financial\/reconciliation\/payments\/([A-Za-z0-9_-]+)\/findings$/u.exec(
          requestUrl.pathname,
        );
      if (findingsMatch?.[1] && request.method === "GET") {
        const paymentId = normalizePaymentId(findingsMatch[1]);
        if (!paymentId) {
          sendJson(response, 400, { error: "INVALID_PAYMENT_ID" });
          return;
        }
        await paymentsApi.handle(
          request,
          response,
          mappedUrl(
            requestUrl,
            `/api/payments/v1/reconciliation/payments/${paymentId}/findings`,
          ),
        );
        return;
      }

      notFound(response, "FINANCIAL_ADMIN_ROUTE_NOT_AVAILABLE");
    },

    async resolvePaymentTenant(paymentId) {
      return paymentsApi.adminResolvePaymentTenant(paymentId);
    },

    async resolveFindingTenant(findingId) {
      return paymentsApi.adminResolveFindingTenant(findingId);
    },

    async refund({ request, response, requestUrl, paymentId }) {
      const normalizedPaymentId = normalizePaymentId(paymentId);
      const idempotencyKey = createRefundIdempotencyKey(normalizedPaymentId);
      if (!normalizedPaymentId || !idempotencyKey) {
        sendJson(response, 400, { error: "INVALID_PAYMENT_ID" });
        return;
      }
      const tenant =
        await paymentsApi.adminResolvePaymentTenant(normalizedPaymentId);
      if (tenant.status === "unavailable") {
        sendJson(response, 503, { error: "FINANCIAL_ADMIN_READ_UNAVAILABLE" });
        return;
      }
      if (tenant.status !== "found" || !tenant.tenantId) {
        sendJson(response, 404, { error: "PAYMENT_TENANT_NOT_FOUND" });
        return;
      }
      const delegated = delegatedRequest(
        request,
        { reason: "requested_by_business" },
        {
          "idempotency-key": idempotencyKey,
          "x-business-id": tenant.tenantId,
        },
      );
      await paymentsApi.handle(
        delegated,
        response,
        mappedUrl(
          requestUrl,
          `/api/payments/v1/payments/${normalizedPaymentId}/refunds`,
        ),
      );
    },

    async reconciliationRun({
      request,
      response,
      requestUrl,
      paymentId,
      runId,
    }) {
      const normalizedPaymentId = normalizePaymentId(paymentId);
      const normalizedRunId = normalizeReconciliationRunId(runId);
      if (!normalizedPaymentId || !normalizedRunId) {
        sendJson(response, 400, { error: "INVALID_RECONCILIATION_RUN" });
        return;
      }
      const delegated = delegatedRequest(
        request,
        { runId: normalizedRunId },
        { "idempotency-key": `reconciliation:v1:${normalizedRunId}` },
      );
      await paymentsApi.handle(
        delegated,
        response,
        mappedUrl(
          requestUrl,
          `/api/payments/v1/reconciliation/payments/${normalizedPaymentId}/runs`,
        ),
      );
    },

    async reconciliationAcknowledge({
      request,
      response,
      requestUrl,
      findingId,
    }) {
      const normalizedFindingId = normalizeReconciliationFindingId(findingId);
      if (!normalizedFindingId) {
        sendJson(response, 400, { error: "INVALID_RECONCILIATION_FINDING" });
        return;
      }
      const delegated = delegatedRequest(
        request,
        {},
        {
          "idempotency-key": `reconciliation-ack:v1:${normalizedFindingId}`,
        },
      );
      await paymentsApi.handle(
        delegated,
        response,
        mappedUrl(
          requestUrl,
          `/api/payments/v1/reconciliation/findings/${normalizedFindingId}/acknowledgements`,
        ),
      );
    },
  });
}

export function createAdminDomainAdapters({
  authApi,
  businessApi,
  crmApi,
  ticketingApi,
  paymentsApi,
  affiliateAdminRuntime,
  contentRuntime,
  destinationRuntime,
} = {}) {
  return Object.freeze({
    ...(affiliateAdminRuntime
      ? { affiliates: createAffiliateAdminAdapter(affiliateAdminRuntime) }
      : {}),
    ...(destinationRuntime
      ? { destinations: createDestinationAdminAdapter(destinationRuntime) }
      : {}),
    ...(businessApi
      ? { businesses: createBusinessAdminAdapter(businessApi, authApi) }
      : {}),
    ...(crmApi ? { crm: createCrmAdminAdapter(crmApi, authApi) } : {}),
    ...(ticketingApi
      ? {
          products: createProductsAdminAdapter(ticketingApi),
          reservations: createReservationsAdminAdapter(ticketingApi),
          ticketing: createTicketingAdminAdapter(ticketingApi, authApi),
        }
      : {}),
    ...(paymentsApi
      ? {
          financial: createFinancialAdminAdapter(paymentsApi),
          orders: createFinancialAdminAdapter(paymentsApi),
          payments: createFinancialAdminAdapter(paymentsApi),
        }
      : {}),
    ...(contentRuntime
      ? { content: createContentAdminAdapter(contentRuntime) }
      : {}),
  });
}

export function createDestinationAdminAdapter(destinationRuntime) {
  const service = destinationRuntime?.service;
  if (!service) {
    return Object.freeze({
      state: "unavailable",
      coverage: Object.freeze([]),
      async handle({ response }) {
        sendJson(response, 503, {
          error: "DESTINATION_ADMIN_OWNER_UNAVAILABLE",
        });
      },
    });
  }

  const detailPattern =
    /^\/api\/admin\/v1\/destinations\/([a-z0-9]+(?:-[a-z0-9]+)*)$/u;

  async function body(request) {
    const chunks = [];
    let total = 0;
    for await (const chunk of request) {
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += value.length;
      if (total > 32 * 1024) throw new Error("REQUEST_BODY_TOO_LARGE");
      chunks.push(value);
    }
    return chunks.length
      ? JSON.parse(Buffer.concat(chunks).toString("utf8"))
      : {};
  }

  return Object.freeze({
    state: "ready",
    coverage: Object.freeze(["list", "detail", "create", "replace", "status"]),
    async search({ query }) {
      const needle = String(query ?? "")
        .trim()
        .toLocaleLowerCase();
      if (!needle) return [];
      const destinations = await service.list();
      return destinations
        .filter((item) =>
          [item.id, item.branding.name, item.branding.shortName].some((value) =>
            value.toLocaleLowerCase().includes(needle),
          ),
        )
        .map((item) => ({
          type: "destination",
          id: item.id,
          title: item.branding.name,
          context: item.status,
          href: `#destinations:${encodeURIComponent(item.id)}`,
        }));
    },
    async handle({ request, response, requestUrl }) {
      if (requestUrl.pathname === `${adminPrefix}/destinations`) {
        if (request.method === "GET") {
          sendJson(response, 200, { destinations: await service.list() });
          return;
        }
        if (request.method !== "POST") {
          sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
          return;
        }
        let payload;
        try {
          payload = await body(request);
        } catch {
          sendJson(response, 400, { error: "INVALID_REQUEST" });
          return;
        }
        const reason = String(payload?.reason ?? "").trim();
        if (reason.length < 8) {
          sendJson(response, 400, { error: "REASON_REQUIRED" });
          return;
        }
        const result = await service.create(payload.destination ?? {});
        const statusCode =
          result.status === "created"
            ? 201
            : result.status === "conflict"
              ? 409
              : result.status === "invalid"
                ? 400
                : 500;
        sendJson(response, statusCode, result);
        return Object.freeze({
          reason,
          entityType: "destination",
          entityId: result.data?.id ?? payload.destination?.id ?? null,
          previousState: null,
          newState: result.data ?? null,
        });
      }

      const match = detailPattern.exec(requestUrl.pathname);
      if (!match?.[1]) {
        notFound(response, "DESTINATION_ADMIN_ROUTE_NOT_AVAILABLE");
        return;
      }
      const id = match[1];
      if (request.method === "GET") {
        const result = await service.read(id);
        sendJson(
          response,
          result.status === "found"
            ? 200
            : result.status === "not_found"
              ? 404
              : 400,
          result,
        );
        return;
      }
      if (request.method !== "PUT" && request.method !== "PATCH") {
        sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
        return;
      }
      let payload;
      try {
        payload = await body(request);
      } catch {
        sendJson(response, 400, { error: "INVALID_REQUEST" });
        return;
      }
      const reason = String(payload?.reason ?? "").trim();
      if (reason.length < 8) {
        sendJson(response, 400, { error: "REASON_REQUIRED" });
        return;
      }
      const before = await service.read(id);
      if (before.status !== "found") {
        sendJson(response, before.status === "not_found" ? 404 : 400, before);
        return;
      }
      const result = payload.status
        ? await service.setStatus(id, payload.status)
        : await service.replace(id, payload.destination ?? {});
      const statusCode =
        result.status === "updated"
          ? 200
          : result.status === "conflict"
            ? 409
            : result.status === "not_found"
              ? 404
              : 400;
      sendJson(response, statusCode, result);
      return Object.freeze({
        reason,
        entityType: "destination",
        entityId: id,
        previousState: before.data,
        newState: result.data ?? null,
      });
    },
  });
}

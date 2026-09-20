const adminPrefix = "/api/admin/v1";

function mappedUrl(requestUrl, pathname) {
  const target = new URL(requestUrl.toString());
  target.pathname = pathname;
  target.search = requestUrl.search;
  return target;
}

function notFound(response, error = "ADMIN_ROUTE_NOT_FOUND") {
  response.statusCode = 404;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify({ error }));
}

export function createCrmAdminAdapter(crmApi) {
  if (!crmApi?.handle) throw new Error("CRM_ADMIN_OWNER_BOUNDARY_REQUIRED");
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
    async handle({ request, response, requestUrl }) {
      const relative = requestUrl.pathname.slice(
        `${adminPrefix}/crm`.length,
      );
      if (!relative || relative === "/") {
        await crmApi.handle(
          request,
          response,
          mappedUrl(requestUrl, "/api/crm/metrics"),
        );
        return;
      }
      const root = relative.slice(1).split("/", 1)[0];
      if (!allowedRoots.includes(root)) {
        notFound(response, "CRM_ADMIN_ROUTE_NOT_ALLOWED");
        return;
      }
      await crmApi.handle(
        request,
        response,
        mappedUrl(requestUrl, `/api/crm${relative}`),
      );
    },
  });
}

export function createBusinessAdminAdapter(businessApi) {
  if (!businessApi?.handle) {
    throw new Error("BUSINESS_ADMIN_OWNER_BOUNDARY_REQUIRED");
  }
  const pattern =
    /^\/api\/admin\/v1\/businesses\/([a-z0-9][a-z0-9_-]{1,79})\/profile$/u;

  return Object.freeze({
    state: "partial",
    coverage: Object.freeze(["profile"]),
    async handle({ request, response, requestUrl }) {
      const match = pattern.exec(requestUrl.pathname);
      if (!match?.[1]) {
        notFound(response, "BUSINESS_ADMIN_ROUTE_NOT_ALLOWED");
        return;
      }
      await businessApi.handle(
        request,
        response,
        `/api/business/${encodeURIComponent(match[1])}/profile`,
      );
    },
  });
}

export function createTicketingAdminAdapter(ticketingApi) {
  if (!ticketingApi?.handle) {
    throw new Error("TICKETING_ADMIN_OWNER_BOUNDARY_REQUIRED");
  }
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
    async handle({ request, response, requestUrl }) {
      const relative = requestUrl.pathname.slice(
        `${adminPrefix}/ticketing`.length,
      );
      if (!allowed.includes(relative)) {
        notFound(response, "TICKETING_ADMIN_ROUTE_NOT_AVAILABLE");
        return;
      }
      await ticketingApi.handle(
        request,
        response,
        mappedUrl(requestUrl, `/api/ticketing/v1${relative}`),
      );
    },
  });
}

export function createAdminDomainAdapters({
  businessApi,
  crmApi,
  ticketingApi,
} = {}) {
  return Object.freeze({
    ...(businessApi
      ? { businesses: createBusinessAdminAdapter(businessApi) }
      : {}),
    ...(crmApi ? { crm: createCrmAdminAdapter(crmApi) } : {}),
    ...(ticketingApi
      ? { ticketing: createTicketingAdminAdapter(ticketingApi) }
      : {}),
  });
}

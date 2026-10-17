/**
 * Public navigation context only. Authentication/tenant authorization is separate.
 *
 * Trusted host rules are provided by the operator, never X-Forwarded-Host,
 * browser query parameters or unvalidated user-selected values.
 */
const DESTINATION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const HOST =
  /^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:]+\])(?::\d{1,5})?$/iu;
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:]+\])$/iu;
const CONTEXT_ROUTE =
  /^\/d\/([a-z0-9]+(?:-[a-z0-9]+)*)\/api\/runtime\/destination\/?$/u;
const LEGACY_ROUTE = "/api/runtime/destination";

function destinationId(value) {
  return typeof value === "string" &&
    DESTINATION_ID.test(value) &&
    value.length <= 120
    ? value
    : null;
}

export function normalizePublicDestinationHost(rawHost) {
  if (typeof rawHost !== "string") return null;
  const raw = rawHost.trim().toLowerCase();
  if (!HOST.test(raw)) return null;
  const host = raw.startsWith("[")
    ? raw.slice(0, raw.indexOf("]") + 1)
    : raw.split(":")[0];
  return HOSTNAME.test(host) ? host.replace(/\.$/u, "") : null;
}

/**
 * Strict allowlist: a host maps to ordered permitted public destination IDs.
 * The first ID is the default; other entries are accessible at /d/:id.
 */
export function parsePublicDestinationHosts(raw) {
  if (raw === "" || raw === undefined || raw === null) return Object.freeze({});
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("PUBLIC_DESTINATION_HOSTS_INVALID_JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("PUBLIC_DESTINATION_HOSTS_INVALID");
  }
  const entries = Object.entries(parsed);
  if (entries.length === 0 || entries.length > 50)
    throw new Error("PUBLIC_DESTINATION_HOSTS_EMPTY_OR_EXCESSIVE");
  const result = Object.create(null);
  for (const [rawHost, ids] of entries) {
    const host = normalizePublicDestinationHost(rawHost);
    if (!host || host !== rawHost || Object.hasOwn(result, host)) {
      throw new Error("PUBLIC_DESTINATION_HOSTS_INVALID_HOST");
    }
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 20) {
      throw new Error("PUBLIC_DESTINATION_HOSTS_INVALID_IDS");
    }
    const clean = ids.map(destinationId);
    if (clean.some((id) => !id) || new Set(clean).size !== clean.length) {
      throw new Error("PUBLIC_DESTINATION_HOSTS_INVALID_IDS");
    }
    result[host] = Object.freeze(clean);
  }
  return Object.freeze(result);
}

/**
 * Returns a destination ID only for an explicitly allowlisted host/path pair.
 * In legacy mode, when no host config has been supplied, only the Morro root
 * endpoint remains available. An explicit Itacaré URL never falls back to Morro.
 */
export function resolvePublicDestinationRequest({
  host,
  pathname,
  allowedHosts,
  legacyDestinationId = "morro-de-sao-paulo",
}) {
  const normalizedHost = normalizePublicDestinationHost(host);
  if (!normalizedHost)
    return Object.freeze({ status: 400, error: "DESTINATION_HOST_INVALID" });
  const explicit = CONTEXT_ROUTE.exec(pathname);
  if (pathname !== LEGACY_ROUTE && !explicit) {
    return Object.freeze({ status: 404, error: "DESTINATION_ROUTE_UNKNOWN" });
  }
  const configured = Object.keys(allowedHosts ?? {}).length > 0;
  const allowlist = allowedHosts?.[normalizedHost];
  if (configured && !allowlist) {
    return Object.freeze({
      status: 404,
      error: "DESTINATION_HOST_NOT_ALLOWED",
    });
  }
  if (!configured && explicit) {
    return Object.freeze({
      status: 404,
      error: "DESTINATION_CONTEXT_NOT_CONFIGURED",
    });
  }
  const selectedId = explicit?.[1] ?? allowlist?.[0] ?? legacyDestinationId;
  if (
    !destinationId(selectedId) ||
    (configured && !allowlist.includes(selectedId))
  ) {
    return Object.freeze({ status: 404, error: "DESTINATION_NOT_ALLOWED" });
  }
  return Object.freeze({
    status: 200,
    destinationId: selectedId,
    legacyMorroFallbackAllowed:
      selectedId === legacyDestinationId &&
      (!configured || allowlist?.[0] === legacyDestinationId),
  });
}

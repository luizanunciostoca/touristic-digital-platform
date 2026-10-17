const PUBLIC_MODULE_KEYS = Object.freeze([
  "marketplace",
  "map",
  "navigation",
  "assistant",
  "businessPortal",
  "adminCrm",
  "booking",
  "payments",
  "affiliates",
]);

function booleanRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

/** Destination identity must match the trusted, same-destination public template. */
export function projectPublicDestination(document, fallback) {
  if (!document || document.status !== "active" || document.id !== fallback?.id)
    return null;
  const flags = booleanRecord(document.featureFlags);
  const enabled = new Set(
    Array.isArray(document.modules) ? document.modules : [],
  );
  const modules = Object.fromEntries(
    PUBLIC_MODULE_KEYS.map((key) => [
      key,
      typeof flags[key] === "boolean" ? flags[key] : enabled.has(key),
    ]),
  );
  const latitude = Number(document.center?.lat);
  const longitude = Number(document.center?.lng);
  if (
    !Number.isFinite(latitude) ||
    latitude < -89 ||
    latitude > 89 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  )
    return null;
  return Object.freeze({
    id: fallback.id,
    name: String(document.branding?.name || fallback.name),
    countryCode: fallback.countryCode,
    timezone: String(document.timezone || fallback.timezone),
    currency: String(document.currency || fallback.currency),
    center: Object.freeze({ latitude, longitude }),
    radiusMeters: fallback.radiusMeters,
    modules: Object.freeze(modules),
  });
}

/**
 * An owner outage may fall back to Morro only, preserving the current V1.
 * An unproven new destination must never silently render another destination.
 */
export async function resolvePublicDestination(
  destinationRuntime,
  fallback,
  { requireOwner = false } = {},
) {
  const fallbackResult = requireOwner ? null : fallback;
  try {
    if (
      destinationRuntime?.state !== "configured" ||
      !destinationRuntime.service
    )
      return fallbackResult;
    const result = await destinationRuntime.service.read(fallback.id);
    const document = result?.destination ?? result?.data ?? result;
    return projectPublicDestination(document, fallback) ?? fallbackResult;
  } catch {
    return fallbackResult;
  }
}

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CC = /^[A-Z]{2}$/u;
const CURRENCY = /^[A-Z]{3}$/u;

function fail(message = "PUBLIC_DESTINATION_TEMPLATE_INVALID") {
  throw new Error(message);
}

function finiteCoordinate(value, low, high) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= low &&
    value <= high
  );
}

function validateTemplate(id, value) {
  if (
    !ID.test(id) ||
    id.length > 120 ||
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.id !== id ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.length > 160 ||
    typeof value.countryCode !== "string" ||
    !CC.test(value.countryCode) ||
    typeof value.currency !== "string" ||
    !CURRENCY.test(value.currency) ||
    typeof value.timezone !== "string" ||
    !value.timezone ||
    value.timezone.length > 80 ||
    !value.center ||
    typeof value.center !== "object" ||
    !finiteCoordinate(value.center.latitude, -89, 89) ||
    !finiteCoordinate(value.center.longitude, -180, 180) ||
    !Number.isSafeInteger(value.radiusMeters) ||
    value.radiusMeters < 100 ||
    value.radiusMeters > 100_000 ||
    !value.modules ||
    typeof value.modules !== "object" ||
    Array.isArray(value.modules) ||
    Object.keys(value.modules).length > 30 ||
    Object.values(value.modules).some((flag) => typeof flag !== "boolean")
  )
    fail();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.timezone }).format(0);
  } catch {
    fail("PUBLIC_DESTINATION_TEMPLATE_TIMEZONE_INVALID");
  }
  return Object.freeze({
    id,
    name: value.name.trim(),
    countryCode: value.countryCode,
    currency: value.currency,
    timezone: value.timezone,
    center: Object.freeze({
      latitude: value.center.latitude,
      longitude: value.center.longitude,
    }),
    radiusMeters: value.radiusMeters,
    modules: Object.freeze({ ...value.modules }),
  });
}

/**
 * Accept only operator-authored non-secret public configuration. The MySQL
 * Destination owner still controls whether a new destination is active.
 */
export function parsePublicDestinationTemplates(raw, legacyMorro) {
  const result = Object.create(null);
  result[legacyMorro.id] = validateTemplate(legacyMorro.id, legacyMorro);
  if (raw === "" || raw === undefined || raw === null)
    return Object.freeze(result);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail("PUBLIC_DESTINATION_TEMPLATES_INVALID_JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail();
  const entries = Object.entries(parsed);
  if (entries.length > 24) fail("PUBLIC_DESTINATION_TEMPLATES_EXCESSIVE");
  for (const [id, value] of entries) {
    if (Object.hasOwn(result, id))
      fail("PUBLIC_DESTINATION_TEMPLATE_DUPLICATE");
    result[id] = validateTemplate(id, value);
  }
  return Object.freeze(result);
}

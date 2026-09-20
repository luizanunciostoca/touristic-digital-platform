import { createHash } from "node:crypto";

const analyticsPath = "/api/analytics/v1/events";
const maxBodyBytes = 32 * 1024;

const eventAttributes = Object.freeze({
  session_started: ["entryPoint", "returningVisitor"],
  category_viewed: ["categoryId", "resultCount"],
  place_viewed: ["placeId", "categoryId"],
  search_submitted: ["queryLength", "resultCount", "filterCount"],
  assistant_query: [
    "queryLength",
    "inputMode",
    "hasPlaceContext",
    "hasNavigationContext",
  ],
  directions_started: ["placeId", "travelMode"],
  tour_started: ["tourId", "stopCount"],
  tour_completed: ["tourId", "completedStops", "durationSeconds"],
  commerce_clicked: ["placeId", "offerId", "surface"],
  offer_selected: ["placeId", "offerId", "quantity"],
  reservation_started: ["placeId", "offerId", "quantity"],
  checkout_started: ["orderId", "itemCount", "currency"],
  payment_approved: ["orderId", "paymentMethod", "currency"],
  ticket_issued: ["orderId", "ticketCount", "ticketType"],
});

class AnalyticsInputError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function firstHeader(value) {
  if (Array.isArray(value)) return firstHeader(value[0]);
  return typeof value === "string" ? value.trim() : "";
}

function header(request, name) {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(request.headers ?? {})) {
    if (key.toLowerCase() === target) return firstHeader(value);
  }
  return "";
}

function boundedText(value, maxLength) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function isIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  );
}

function safePrimitive(value) {
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "string" && value.length <= 240;
}

function validateAttributes(eventName, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AnalyticsInputError(400, "ANALYTICS_INVALID_ATTRIBUTES");
  }

  const allowed = new Set(eventAttributes[eventName]);
  const entries = Object.entries(value);
  if (entries.length > 16) {
    throw new AnalyticsInputError(400, "ANALYTICS_INVALID_ATTRIBUTES");
  }

  const sanitized = {};
  for (const [key, attribute] of entries) {
    if (!allowed.has(key) || !safePrimitive(attribute)) {
      throw new AnalyticsInputError(400, "ANALYTICS_INVALID_ATTRIBUTES");
    }
    sanitized[key] = attribute;
  }
  return Object.freeze(sanitized);
}

function validateEvent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AnalyticsInputError(400, "ANALYTICS_INVALID_EVENT");
  }

  const allowedTopLevel = new Set([
    "schemaVersion",
    "eventId",
    "name",
    "occurredAt",
    "sessionId",
    "destinationId",
    "locale",
    "source",
    "attributes",
  ]);
  if (Object.keys(value).some((key) => !allowedTopLevel.has(key))) {
    throw new AnalyticsInputError(400, "ANALYTICS_INVALID_EVENT");
  }

  if (value.schemaVersion !== "1") {
    throw new AnalyticsInputError(400, "ANALYTICS_UNSUPPORTED_SCHEMA");
  }

  const eventId = boundedText(value.eventId, 160);
  const sessionId = boundedText(value.sessionId, 160);
  const eventName = boundedText(value.name, 80);
  if (!eventId || !sessionId || !eventName || !(eventName in eventAttributes)) {
    throw new AnalyticsInputError(400, "ANALYTICS_INVALID_EVENT");
  }
  if (!isIsoTimestamp(value.occurredAt)) {
    throw new AnalyticsInputError(400, "ANALYTICS_INVALID_TIMESTAMP");
  }

  const destinationId =
    value.destinationId === undefined
      ? undefined
      : boundedText(value.destinationId, 160);
  const locale =
    value.locale === undefined ? undefined : boundedText(value.locale, 32);
  const source =
    value.source === undefined ? undefined : boundedText(value.source, 80);

  if (
    (value.destinationId !== undefined && !destinationId) ||
    (value.locale !== undefined && !locale) ||
    (value.source !== undefined && !source)
  ) {
    throw new AnalyticsInputError(400, "ANALYTICS_INVALID_CONTEXT");
  }

  return Object.freeze({
    schemaVersion: "1",
    eventId,
    name: eventName,
    occurredAt: value.occurredAt,
    visitorHash: createHash("sha256").update(sessionId).digest("hex"),
    ...(destinationId ? { destinationId } : {}),
    ...(locale ? { locale } : {}),
    ...(source ? { source } : {}),
    attributes: validateAttributes(eventName, value.attributes ?? {}),
  });
}

async function readJson(request) {
  const declaredLength = Number(header(request, "content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
    throw new AnalyticsInputError(413, "ANALYTICS_REQUEST_TOO_LARGE");
  }

  const chunks = [];
  let total = 0;
  for await (const rawChunk of request) {
    const chunk =
      typeof rawChunk === "string"
        ? Buffer.from(rawChunk)
        : rawChunk instanceof Uint8Array
          ? Buffer.from(rawChunk)
          : null;
    if (!chunk) throw new AnalyticsInputError(400, "ANALYTICS_INVALID_JSON");
    total += chunk.length;
    if (total > maxBodyBytes) {
      throw new AnalyticsInputError(413, "ANALYTICS_REQUEST_TOO_LARGE");
    }
    chunks.push(chunk);
  }
  if (total === 0) throw new AnalyticsInputError(400, "ANALYTICS_EMPTY_BODY");

  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks),
    );
    return JSON.parse(decoded);
  } catch {
    throw new AnalyticsInputError(400, "ANALYTICS_INVALID_JSON");
  }
}

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

export function createAnalyticsApi({ record }) {
  if (typeof record !== "function") {
    throw new Error("Analytics recorder is required.");
  }

  return Object.freeze({
    matches(pathname) {
      return pathname === analyticsPath;
    },

    async handle(request, response) {
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
        return;
      }

      const contentType = header(request, "content-type")
        .split(";", 1)[0]
        .trim()
        .toLowerCase();
      if (contentType !== "application/json") {
        sendJson(response, 415, { error: "ANALYTICS_JSON_REQUIRED" });
        return;
      }

      try {
        const event = validateEvent(await readJson(request));
        await record(event);
        sendJson(response, 202, {
          data: Object.freeze({ accepted: true, eventId: event.eventId }),
        });
      } catch (error) {
        if (error instanceof AnalyticsInputError) {
          sendJson(response, error.status, { error: error.code });
          return;
        }
        sendJson(response, 503, { error: "ANALYTICS_RECORDER_UNAVAILABLE" });
      }
    },
  });
}

export { analyticsPath };

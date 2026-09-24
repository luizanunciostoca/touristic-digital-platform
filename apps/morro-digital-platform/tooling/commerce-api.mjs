import { createHash, randomUUID } from "node:crypto";

import { createRestaurantReservationSlot } from "@touristic/commerce/restaurant-availability";
import { resolveTicketedAdmissionOfferings } from "@touristic/commerce/ticketed-admission-resolver";
import { createRestaurantReservationRequestKey } from "@touristic/commerce/restaurant-reservations";
import {
  MySqlRestaurantReservationRepository,
  applyCommerceRestaurantReservationSchema,
  createCommerceMySqlPoolFromEnvironment,
} from "@touristic/commerce-server";
import {
  CommerceSessionAuthority,
  MySqlTicketReservationRepository,
  MySqlTicketingPublicReadRepository,
  createTicketingMySqlPoolFromEnvironment,
} from "@touristic/ticketing-server";

const prefix = "/api/commerce/v1";
const maxBodyBytes = 32 * 1024;
const businessIdPattern = /^[a-z0-9][a-z0-9_-]{0,119}$/u;
const placeIdPattern = /^[A-Za-z0-9][A-Za-z0-9:_-]{1,119}$/u;
const slotIdPattern = /^rsl_[A-Za-z0-9_-]{8,116}$/u;
const reservationIdPattern = /^rrv_[A-Za-z0-9_-]{8,116}$/u;
const idempotencyKeyPattern = /^[A-Za-z0-9_-]{8,120}$/u;

class CommerceHttpInputError extends Error {
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

function json(response, status, body, correlationId, extraHeaders = {}) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Correlation-ID", correlationId);
  for (const [name, value] of Object.entries(extraHeaders)) {
    response.setHeader(name, value);
  }
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  const declared = Number(header(request, "content-length") || "0");
  if (Number.isFinite(declared) && declared > maxBodyBytes) {
    throw new CommerceHttpInputError(413, "COMMERCE_REQUEST_TOO_LARGE");
  }
  const chunks = [];
  let total = 0;
  for await (const raw of request) {
    const chunk =
      typeof raw === "string"
        ? Buffer.from(raw)
        : raw instanceof Uint8Array
          ? Buffer.from(raw)
          : null;
    if (!chunk) {
      throw new CommerceHttpInputError(400, "INVALID_COMMERCE_REQUEST");
    }
    total += chunk.length;
    if (total > maxBodyBytes) {
      throw new CommerceHttpInputError(413, "COMMERCE_REQUEST_TOO_LARGE");
    }
    chunks.push(chunk);
  }
  if (total === 0) {
    throw new CommerceHttpInputError(400, "INVALID_COMMERCE_REQUEST");
  }
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    );
  } catch {
    throw new CommerceHttpInputError(400, "INVALID_COMMERCE_JSON");
  }
}

function featureEnabled(value, ticketingValue) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return (
      String(ticketingValue || "")
        .trim()
        .toLowerCase() === "true"
    );
  }
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error("COMMERCE_FEATURE_ENABLED_INVALID");
}

function correlationId(request) {
  const provided = header(request, "x-correlation-id");
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/u.test(provided)
    ? provided
    : `corr_${randomUUID()}`;
}

function reservationIdFor(requestKey) {
  return `rrv_${createHash("sha256")
    .update(`restaurant-reservation:v1:${requestKey}`)
    .digest("hex")
    .slice(0, 32)}`;
}

function depositPricingVersion(reservation) {
  if (reservation.depositPolicy.kind !== "required") return null;
  return `rdep_${createHash("sha256")
    .update(
      [
        reservation.slotId,
        reservation.depositPolicy.amount.minorUnits,
        reservation.depositPolicy.amount.currency,
      ].join(":"),
    )
    .digest("hex")
    .slice(0, 32)}`;
}

function safeError(error) {
  const raw = error instanceof Error ? error.message : "COMMERCE_UNAVAILABLE";
  return /^[A-Z0-9_:-]{3,160}$/u.test(raw) ? raw : "COMMERCE_UNAVAILABLE";
}

function statusForError(code) {
  if (code.includes("NOT_FOUND")) return 404;
  if (
    code.includes("INVALID") ||
    code.includes("SCOPE_INVALID") ||
    code.includes("NOT_BOOKABLE")
  ) {
    return 400;
  }
  if (
    code.includes("EXHAUSTED") ||
    code.includes("REPLAY_CONFLICT") ||
    code.includes("CAPACITY_BELOW_COMMITTED")
  ) {
    return 409;
  }
  if (code.includes("DENIED") || code.includes("PAYMENT_REQUIRED")) return 403;
  return 503;
}

function publicReservationProjection(reservation) {
  return Object.freeze({
    id: reservation.id,
    slotId: reservation.slotId,
    businessId: reservation.businessId,
    placeId: reservation.placeId,
    destinationId: reservation.destinationId,
    serviceDate: reservation.serviceDate,
    startsAt: reservation.startsAt,
    endsAt: reservation.endsAt,
    partySize: reservation.partySize,
    seatingArea: reservation.seatingArea,
    status: reservation.status,
    depositPolicy: reservation.depositPolicy,
    holdExpiresAt: reservation.holdExpiresAt,
  });
}

export function createCommerceApi({
  authApi,
  getEnvironmentValue = (key) => process.env[key] ?? "",
  now = () => new Date().toISOString(),
} = {}) {
  let runtime = null;
  let started = false;
  let startAttempted = false;

  async function start() {
    if (started || startAttempted) return started;
    startAttempted = true;
    let pool = null;
    let orderingPool = null;
    let ticketingPool = null;
    try {
      if (!authApi) throw new Error("COMMERCE_AUTH_API_REQUIRED");
      const enabled = featureEnabled(
        getEnvironmentValue("COMMERCE_FEATURE_ENABLED"),
        getEnvironmentValue("TICKETING_FEATURE_ENABLED"),
      );
      if (!enabled) {
        runtime = Object.freeze({
          enabled: false,
          pool: null,
          repository: null,
          sessions: null,
        });
        started = true;
        return true;
      }
      const databaseUrl = String(
        getEnvironmentValue("COMMERCE_DATABASE_URL") ||
          getEnvironmentValue("TICKETING_DATABASE_URL") ||
          "",
      ).trim();
      const sessionSecret = String(
        getEnvironmentValue("TICKETING_OFFLINE_PROVISIONING_SECRET") || "",
      ).trim();
      pool = createCommerceMySqlPoolFromEnvironment({
        COMMERCE_DATABASE_URL: databaseUrl,
      });
      orderingPool = createOrderingMySqlPoolFromEnvironment({
        ORDERING_DATABASE_URL: String(
          getEnvironmentValue("ORDERING_DATABASE_URL") || "",
        ).trim(),
      });
      const ticketingDatabaseUrl = String(
        getEnvironmentValue("TICKETING_DATABASE_URL") || "",
      ).trim();
      ticketingPool = ticketingDatabaseUrl
        ? createTicketingMySqlPoolFromEnvironment({
            TICKETING_DATABASE_URL: ticketingDatabaseUrl,
          })
        : null;
      await Promise.all([
        applyCommerceRestaurantReservationSchema(pool),
        applyOrderingRestaurantReservationSchema(orderingPool),
      ]);
      const orders = new MySqlOrderRepository(orderingPool);
      const orderBindings =
        new MySqlRestaurantReservationOrderBindingRepository(orderingPool);
      runtime = Object.freeze({
        enabled: true,
        pool,
        orderingPool,
        ticketingPool,
        ticketingReads: ticketingPool
          ? new MySqlTicketingPublicReadRepository(ticketingPool)
          : null,
        ticketingInventory: ticketingPool
          ? new MySqlTicketReservationRepository(ticketingPool)
          : null,
        repository: new MySqlRestaurantReservationRepository(pool),
        reservationOrders: createRestaurantReservationOrderApplicationService({
          orders,
          bindings: orderBindings,
          identities: createNodeCheckoutIdentityPort(),
        }),
        sessions: new CommerceSessionAuthority(sessionSecret),
      });
      started = true;
      return true;
    } catch {
      await Promise.allSettled([
        pool?.end(),
        orderingPool?.end(),
        ticketingPool?.end(),
      ]);
      runtime = null;
      return false;
    }
  }

  async function stop() {
    const pools = [
      runtime?.pool,
      runtime?.orderingPool,
      runtime?.ticketingPool,
    ].filter(Boolean);
    runtime = null;
    started = false;
    await Promise.allSettled(pools.map((candidate) => candidate.end()));
  }

  async function consumerActor(request, { mutation = true } = {}) {
    const active = await authApi.resolveSession(request);
    if (active) {
      if (mutation) {
        const decision = authApi.authorizeMutation(
          request,
          active,
          "commerce.restaurant.reserve",
        );
        if (!decision.allowed) {
          return Object.freeze({ allowed: false, reason: decision.reason });
        }
      }
      return Object.freeze({
        allowed: true,
        subject: active.subject,
        source: "authenticated",
      });
    }
    const session = runtime?.sessions?.fromRequest({
      method: String(request.method || "GET"),
      pathname: String(request.url || "/").split("?", 1)[0],
      headers: request.headers ?? {},
    });
    if (!session) {
      return Object.freeze({
        allowed: false,
        reason: "authentication_required",
      });
    }
    if (mutation) {
      const decision = runtime.sessions.authorizeMutation(
        {
          method: String(request.method || "GET"),
          pathname: String(request.url || "/").split("?", 1)[0],
          headers: request.headers ?? {},
        },
        session,
      );
      if (!decision.allowed) return decision;
    }
    return Object.freeze({
      allowed: true,
      subject: session.claims.subject,
      source: "commerce_session",
    });
  }

  function denyConsumer(response, actor, correlation) {
    if (actor.reason === "authentication_required") {
      json(response, 401, { error: "AUTH_REQUIRED" }, correlation);
      return;
    }
    if (actor.reason === "invalid_csrf") {
      json(response, 403, { error: "INVALID_CSRF" }, correlation);
      return;
    }
    json(response, 403, { error: "ORIGIN_DENIED" }, correlation);
  }

  async function handlePlaceOfferings(
    request,
    response,
    placeId,
  ) {
    const correlation = correlationId(request);
    if (!placeIdPattern.test(placeId)) {
      json(
        response,
        400,
        { error: "COMMERCE_PLACE_ID_INVALID" },
        correlation,
      );
      return;
    }
    const observedAt = now();
    const [restaurantRows, inventoryRows] = await Promise.all([
      runtime.repository.listRestaurantOfferingsForPlace(placeId, observedAt),
      runtime.ticketingReads
        ? runtime.ticketingReads.listInventory()
        : Promise.resolve([]),
    ]);
    const ticketingRows =
      runtime.ticketingInventory && inventoryRows.length > 0
        ? await Promise.all(
            inventoryRows.map(async (inventory) => {
              const availability =
                await runtime.ticketingInventory.availability(
                  inventory.id,
                  observedAt,
                );
              return Object.freeze({
                ...inventory,
                availableQuantity: availability.remainingQuantity,
                sellable: availability.sellable,
                observedAt: availability.observedAt,
              });
            }),
          )
        : [];
    const admissions = resolveTicketedAdmissionOfferings(ticketingRows).filter(
      ({ offering }) => offering.identity.placeId === placeId,
    );
    const data = [
      ...admissions.map(({ offering, subtype, variants }) =>
        Object.freeze({
          commerceMode: "ticketed_admission",
          offerId: offering.identity.offerId,
          placeId,
          businessId: offering.identity.businessId,
          destinationId: offering.identity.destinationId,
          subtype,
          title: offering.presentation.title,
          variantCount: variants.length,
          startsAt: variants[0]?.startsAt ?? null,
          sellable: variants.some((variant) => variant.sellable),
        }),
      ),
      ...restaurantRows.map((restaurant) =>
        Object.freeze({
          commerceMode: "table_reservation",
          offerId: `restaurant:${restaurant.businessId}:${restaurant.placeId}`,
          placeId: restaurant.placeId,
          businessId: restaurant.businessId,
          destinationId: restaurant.destinationId,
          subtype: null,
          title: "Reservar mesa",
          variantCount: 1,
          startsAt: null,
          nextServiceDate: restaurant.nextServiceDate,
          sellable: restaurant.hasAvailability,
        }),
      ),
    ];
    json(response, 200, { data }, correlation);
  }

  async function handleAvailability(request, response, requestUrl, businessId) {
    const date = requestUrl.searchParams.get("date") ?? "";
    const placeId = requestUrl.searchParams.get("placeId");
    if (placeId && !placeIdPattern.test(placeId)) {
      json(
        response,
        400,
        { error: "COMMERCE_RESTAURANT_SCOPE_INVALID" },
        correlationId(request),
      );
      return;
    }
    const observedAt = now();
    const data = await runtime.repository.listAvailabilityForDate({
      businessId,
      placeId,
      serviceDate: date,
      observedAt,
    });
    json(
      response,
      200,
      {
        data: data.map(({ slot, availability }) => ({
          slot: {
            id: slot.id,
            businessId: slot.businessId,
            placeId: slot.placeId,
            destinationId: slot.destinationId,
            serviceDate: slot.serviceDate,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            seatingArea: slot.seatingArea,
            minPartySize: slot.minPartySize,
            maxPartySize: slot.maxPartySize,
            depositPolicy: slot.depositPolicy,
          },
          availability,
        })),
      },
      correlationId(request),
    );
  }

  async function handleReservationRead(
    request,
    response,
    businessId,
    reservationId,
  ) {
    const correlation = correlationId(request);
    const actor = await consumerActor(request, { mutation: false });
    if (!actor.allowed) {
      denyConsumer(response, actor, correlation);
      return;
    }
    const reservation = await runtime.repository.findForHolder({
      reservationId,
      businessId,
      holderReference: actor.subject,
    });
    if (!reservation) {
      json(
        response,
        404,
        { error: "COMMERCE_RESTAURANT_RESERVATION_NOT_FOUND" },
        correlation,
      );
      return;
    }
    json(
      response,
      200,
      { data: publicReservationProjection(reservation) },
      correlation,
    );
  }

  async function handleReservationCreate(request, response, businessId) {
    const correlation = correlationId(request);
    const actor = await consumerActor(request);
    if (!actor.allowed) {
      denyConsumer(response, actor, correlation);
      return;
    }
    const key = header(request, "idempotency-key");
    if (!idempotencyKeyPattern.test(key)) {
      json(response, 400, { error: "INVALID_IDEMPOTENCY_KEY" }, correlation);
      return;
    }
    const body = await readJsonBody(request);
    if (!slotIdPattern.test(String(body?.slotId || ""))) {
      json(
        response,
        400,
        { error: "COMMERCE_RESTAURANT_SLOT_INVALID" },
        correlation,
      );
      return;
    }
    const requestKey = createRestaurantReservationRequestKey(body.slotId, key);
    if (!requestKey) {
      json(
        response,
        400,
        { error: "COMMERCE_RESTAURANT_REQUEST_KEY_INVALID" },
        correlation,
      );
      return;
    }
    const held = await runtime.repository.hold({
      reservationId: reservationIdFor(requestKey),
      requestKey,
      slotId: body.slotId,
      businessId,
      holderReference: actor.subject,
      partySize: body.partySize,
      notes: body.notes ?? null,
      heldAt: now(),
      actorReference: actor.subject,
    });
    if (held.reservation.depositPolicy.kind === "none") {
      const confirmed = await runtime.repository.confirmWithoutDeposit({
        reservationId: held.reservation.id,
        businessId,
        confirmedAt: now(),
        actorReference: actor.subject,
      });
      json(
        response,
        held.replayed && confirmed.replayed ? 200 : 201,
        {
          data: publicReservationProjection(confirmed.reservation),
          paymentRequired: false,
        },
        correlation,
      );
      return;
    }
    const pricingVersion = depositPricingVersion(held.reservation);
    if (!pricingVersion) {
      throw new Error("COMMERCE_RESTAURANT_DEPOSIT_INVALID");
    }
    const orderResult = await runtime.reservationOrders.placeReservationOrder({
      reservationReference: held.reservation.id,
      businessId,
      amount: held.reservation.depositPolicy.amount,
      pricingVersion,
      capturedAt: held.reservation.createdAt,
    });
    const handoff = normalizeRestaurantCheckoutHandoff({
      reservationReference: held.reservation.id,
      customer: body.customer,
      returnUrl: body.returnUrl,
      requiresPaymentsCapability: true,
    });
    if (!handoff) {
      json(
        response,
        400,
        { error: "COMMERCE_RESTAURANT_CHECKOUT_CUSTOMER_INVALID" },
        correlation,
      );
      return;
    }
    const token = createRestaurantCheckoutHandoffCapability(
      handoff,
      {
        actorSubject: actor.subject,
        destinationId: held.reservation.destinationId,
        tenantId: businessId,
        requesterKind:
          actor.source === "commerce_session"
            ? "guest_capability"
            : "authenticated",
      },
      String(getEnvironmentValue("PAYMENTS_HANDOFF_SECRET") || "").trim(),
    );
    if (!token) {
      throw new Error("COMMERCE_RESTAURANT_CHECKOUT_CAPABILITY_INVALID");
    }
    json(
      response,
      held.replayed && orderResult.replayed ? 200 : 202,
      {
        data: publicReservationProjection(held.reservation),
        paymentRequired: true,
        checkout: {
          handoff,
          token,
          idempotencyKey: orderResult.order.requestKey,
        },
      },
      correlation,
    );
  }

  async function handleOperatorSlotCreate(request, response, businessId) {
    const correlation = correlationId(request);
    const authorization = await authApi.authorizeBusinessRequest(
      request,
      response,
      businessId,
      {
        mutation: true,
        auditAction: "commerce.restaurant_slot.mutate",
      },
    );
    if (!authorization) return;
    const body = await readJsonBody(request);
    const timestamp = now();
    const slot = createRestaurantReservationSlot({
      id:
        typeof body?.id === "string" && body.id
          ? body.id
          : `rsl_${randomUUID().replaceAll("-", "")}`,
      businessId: authorization.businessId,
      placeId: body?.placeId,
      destinationId:
        String(getEnvironmentValue("PAYMENTS_DESTINATION_ID") || "").trim() ||
        "morro-de-sao-paulo",
      serviceDate: body?.serviceDate,
      startsAt: body?.startsAt,
      endsAt: body?.endsAt,
      seatingArea: body?.seatingArea ?? null,
      capacity: body?.capacity,
      minPartySize: body?.minPartySize,
      maxPartySize: body?.maxPartySize,
      minimumLeadMinutes: body?.minimumLeadMinutes,
      maximumAdvanceDays: body?.maximumAdvanceDays,
      holdDurationSeconds: body?.holdDurationSeconds,
      depositPolicy: body?.depositPolicy,
      enabled: body?.enabled,
      createdAt: body?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });
    if (!slot) {
      json(
        response,
        400,
        { error: "COMMERCE_RESTAURANT_SLOT_INVALID" },
        correlation,
      );
      return;
    }
    const saved = await runtime.repository.saveSlot(slot);
    json(response, 201, { data: saved }, correlation);
  }

  return Object.freeze({
    matches(pathname) {
      return pathname === prefix || pathname.startsWith(`${prefix}/`);
    },
    readinessCheck() {
      return Object.freeze({
        status: started ? "pass" : "fail",
        critical: false,
        detail: started
          ? runtime?.enabled
            ? "commerce-runtime-ready"
            : "commerce-feature-disabled"
          : "COMMERCE_RUNTIME_UNAVAILABLE",
      });
    },
    start,
    stop,
    async handle(request, response, requestUrl) {
      const correlation = correlationId(request);
      if (!started || !runtime) {
        json(response, 503, { error: "COMMERCE_UNAVAILABLE" }, correlation);
        return;
      }
      if (!runtime.enabled || !runtime.repository) {
        json(
          response,
          503,
          { error: "COMMERCE_FEATURE_DISABLED" },
          correlation,
        );
        return;
      }
      const method = String(request.method || "GET").toUpperCase();
      try {
        const placeOfferingsMatch =
          /^\/api\/commerce\/v1\/places\/([A-Za-z0-9][A-Za-z0-9:_-]{1,119})\/offerings$/u.exec(
            requestUrl.pathname,
          );
        if (placeOfferingsMatch?.[1] && method === "GET") {
          await handlePlaceOfferings(
            request,
            response,
            placeOfferingsMatch[1],
          );
          return;
        }
        const availabilityMatch =
          /^\/api\/commerce\/v1\/restaurants\/([a-z0-9][a-z0-9_-]{0,119})\/availability$/u.exec(
            requestUrl.pathname,
          );
        if (availabilityMatch?.[1] && method === "GET") {
          await handleAvailability(
            request,
            response,
            requestUrl,
            availabilityMatch[1],
          );
          return;
        }
        const reservationReadMatch =
          /^\/api\/commerce\/v1\/restaurants\/([a-z0-9][a-z0-9_-]{0,119})\/reservations\/(rrv_[A-Za-z0-9_-]{8,116})$/u.exec(
            requestUrl.pathname,
          );
        if (
          reservationReadMatch?.[1] &&
          reservationReadMatch[2] &&
          method === "GET"
        ) {
          await handleReservationRead(
            request,
            response,
            reservationReadMatch[1],
            reservationReadMatch[2],
          );
          return;
        }
        const reservationMatch =
          /^\/api\/commerce\/v1\/restaurants\/([a-z0-9][a-z0-9_-]{0,119})\/reservations$/u.exec(
            requestUrl.pathname,
          );
        if (reservationMatch?.[1] && method === "POST") {
          await handleReservationCreate(request, response, reservationMatch[1]);
          return;
        }
        const operatorSlotMatch =
          /^\/api\/commerce\/v1\/operator\/businesses\/([a-z0-9][a-z0-9_-]{0,119})\/restaurant-slots$/u.exec(
            requestUrl.pathname,
          );
        if (operatorSlotMatch?.[1] && method === "POST") {
          await handleOperatorSlotCreate(
            request,
            response,
            operatorSlotMatch[1],
          );
          return;
        }
        json(response, 405, { error: "METHOD_NOT_ALLOWED" }, correlation);
      } catch (error) {
        if (error instanceof CommerceHttpInputError) {
          json(response, error.status, { error: error.code }, correlation);
          return;
        }
        const code = safeError(error);
        json(response, statusForError(code), { error: code }, correlation);
      }
    },
  });
}

export const commerceHttpPrefix = prefix;

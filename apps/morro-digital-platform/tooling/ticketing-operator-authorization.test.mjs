import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "@touristic/auth-server";
import { createCrmMySqlPoolFromEnvironment } from "@touristic/crm-server";
import { createAuthApi } from "./auth-api.mjs";
import {
  createTicketingAuthorizationPort,
  createTicketingOperatorOwnerPort,
} from "./ticketing-api.mjs";

// Exercise the built production services; the dedicated CI step builds first.
const require = createRequire(import.meta.url);
const { createPlacePlatformRuntime } = require("./place-platform-runtime.mjs");
const T = require("@touristic/ticketing-server");
const O = require("@touristic/ordering-server");
const { createTicket, createTicketQrPayload } = require("@touristic/ticketing");
const {
  createTicketReservation,
  createTicketReservationRequestKey,
} = require("@touristic/ticketing/reservations");
const {
  createTicketingReservationOrderApplicationService,
} = require("@touristic/ordering/ticketing-reservation");
const sourceUrl = process.env.MORRO_TEST_AUTH_DATABASE_URL;
const sql = sourceUrl ? describe : describe.skip;
const at = "2026-11-01T10:00:00.000Z";
const confirmedAt = "2026-11-01T10:01:00.000Z";
const until = "2026-11-01T12:00:00.000Z";
const clock = { now: () => "2026-11-01T11:30:00.000Z" };
const secret = "d02-isolated-signing-secret-000000000000";

function databaseUrl(schema) {
  const url = new URL(sourceUrl);
  if (
    url.protocol !== "mysql:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "33384" ||
    url.search ||
    url.hash ||
    !/^\/auth_826_/u.test(url.pathname)
  )
    throw new Error("D02_ISOLATED_DATABASE_REQUIRED");
  url.pathname = `/${schema}`;
  return url.toString();
}
function pool(schema) {
  return createCrmMySqlPoolFromEnvironment({
    CRM_DATABASE_URL: databaseUrl(schema),
  });
}
function request(pathname, body, session = {}) {
  return {
    method: "POST",
    pathname,
    url: pathname,
    headers: {
      host: "localhost",
      origin: "http://localhost",
      cookie: session.cookie ?? "",
      "x-csrf-token": session.csrf ?? "",
    },
    body,
    socket: { remoteAddress: session.remoteAddress ?? "127.0.0.1" },
    correlationId: "d02:isolated-sql",
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify(body ?? {}));
    },
  };
}
async function authRequest(auth, action, body, session) {
  const headers = {};
  const response = {
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
    end(value) {
      this.body = JSON.parse(value);
    },
  };
  await auth.handle(
    request(`/api/dashboard/auth/${action}`, body, session),
    response,
    `/api/dashboard/auth/${action}`,
  );
  return {
    status: response.statusCode,
    body: response.body,
    cookie: String(headers["set-cookie"] ?? "").split(";")[0],
    csrf: response.body?.csrfToken,
  };
}

sql.sequential("D02 composed SQL operator authorization", () => {
  const tag = randomUUID().slice(0, 8);
  const businesses = ["a", "b", "c"].map((key) => `d02-${key}-${tag}`);
  const password = "d02 isolated operator password";
  const passwordHash = hashPassword(password, Buffer.alloc(16, 13));
  const roles = {
    manager: "BUSINESS_MANAGER",
    affiliate: "AFFILIATE",
    viewer: "BUSINESS_VIEWER",
    platform: "PLATFORM_ADMIN",
  };
  const users = Object.entries(roles).map(([key, role]) => ({
    id: `d02-${key}-${tag}`,
    email: `${key}-${tag}@d02.invalid`,
    role,
    businessIds: role === "PLATFORM_ADMIN" ? [] : [businesses[0]],
    passwordHash,
  }));
  let auth, place, ticketPool, orderPool, service, transport;
  let loginSequence = 0;
  const fixtures = [];
  async function openAuth(scope = businesses[0]) {
    const values = {
      DASHBOARD_AUTH_SECRET: secret,
      DASHBOARD_AUTH_ORIGIN: "http://localhost",
      AUTH_DATABASE_URL: databaseUrl("auth_826_d02"),
      DASHBOARD_USERS_JSON: JSON.stringify(
        users.map((user) => ({
          ...user,
          businessIds: user.role === "PLATFORM_ADMIN" ? [] : [scope],
        })),
      ),
    };
    auth = createAuthApi({ getEnvironmentValue: (key) => values[key] ?? "" });
    await auth.start();
    expect(auth.readinessCheck().status).toBe("pass");
    expect(auth.readinessCheck().detail).toBe("shared-durable");
  }
  async function login(key = "manager") {
    // Independent simulated clients keep the real durable login limiter enabled.
    const session = await authRequest(
      auth,
      "login",
      { email: `${key}-${tag}@d02.invalid`, password },
      {
        remoteAddress: `fd00:${tag.slice(0, 4)}:${tag.slice(4)}::${++loginSequence}`,
      },
    );
    expect(session.status).toBe(200);
    return session;
  }
  const checkIn = (session, index = 0, extra = {}) =>
    transport.handle(
      request(
        "/api/ticketing/v1/operator/check-in",
        {
          qrPayload: createTicketQrPayload(fixtures[index].ticket.id, secret),
          ...extra,
        },
        session,
      ),
    );
  async function state(index = 0) {
    const read = pool("ticketing_d02_test");
    try {
      const ticket = await new T.MySqlTicketRepository(read).findById(
        fixtures[index].ticket.id,
      );
      const checkIns = await new T.MySqlTicketCheckInRepository(
        read,
      ).listByTicketId(ticket.id);
      return { ticket, checkIns };
    } finally {
      await read.end();
    }
  }
  async function deniedUnchanged(session, index, status, extra = {}) {
    const before = await state(index);
    const response = await checkIn(session, index, extra);
    expect(response.status).toBe(status);
    expect(await state(index)).toEqual(before);
    return response;
  }
  beforeAll(async () => {
    const admin = pool("mysql");
    try {
      for (const name of [
        "auth_826_d02",
        "ticketing_d02_test",
        "ordering_d02_test",
        "business_d02_test",
      ])
        await admin.query(
          `CREATE DATABASE IF NOT EXISTS ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
        );
    } finally {
      await admin.end();
    }
    await openAuth();
    ticketPool = pool("ticketing_d02_test");
    orderPool = pool("ordering_d02_test");
    await T.applyTicketingPublicApiSchema(ticketPool);
    await O.applyOrderingTicketingReservationSchema(orderPool);
    place = createPlacePlatformRuntime({
      poolFactory: (url) =>
        createCrmMySqlPoolFromEnvironment({ CRM_DATABASE_URL: url }),
      getEnvironmentValue: (key) =>
        key === "BUSINESS_DATABASE_URL" ? databaseUrl("business_d02_test") : "",
    });
    await place.start();
    expect(place.readinessCheck().status, place.readinessCheck().detail).toBe(
      "pass",
    );
    const inventory = new T.MySqlTicketingBusinessInventoryRepository(
      ticketPool,
    );
    const orders = new O.MySqlOrderRepository(orderPool);
    const bindings = new O.MySqlTicketingOrderBindingRepository(orderPool);
    const reservations = new T.MySqlTicketReservationRepository(ticketPool);
    const tickets = new T.MySqlTicketRepository(ticketPool);
    const actor = await auth.resolveSession(
      request("/", {}, await login("platform")),
    );
    for (let index = 0; index < businesses.length; index++) {
      const businessId = businesses[index],
        destinationId = index === 2 ? "itacare" : "morro-de-sao-paulo";
      const placeId = `place-${businessId}`;
      await place.createDraft(actor, {
        businessId,
        placeId,
        destinationId,
        categoryId: "nightlife",
        name: "D02 SQL Place",
      });
      const catalogProduct = await place.createCatalogDraft(
        actor,
        businessId,
        "product",
        { name: "D02 product" },
      );
      const catalogOffer = await place.createCatalogDraft(
        actor,
        businessId,
        "offer",
        { productId: catalogProduct.id, minorUnits: 10000 },
      );
      const product = {
        kind: "business_experience",
        reference: `legacy-${businessId}`,
      };
      const created = await inventory.createForBusiness({
        businessId,
        destinationId,
        requestKey: `d02-inventory-${index}-${tag}`,
        actorSubject: actor.subject,
        recordedAt: at,
        offer: {
          productKind: product.kind,
          productReference: product.reference,
          label: "D02 admission",
          unitAmountMinor: 10000,
          currency: "BRL",
          pricingVersion: "d02-v1",
          capacity: 10,
          maxPerReservation: 2,
          salesStartAt: "2026-11-01T09:00:00Z",
          salesEndAt: "2026-11-01T10:30:00Z",
          startsAt: "2026-11-01T11:00:00Z",
          endsAt: until,
          admission: {
            placeId,
            subtype: "event",
            ticketType: "standard",
            tierLabel: null,
            displayOrder: 0,
          },
        },
      });
      await inventory.bindCatalogOffer({
        businessId,
        inventoryId: created.offer.id,
        offerId: catalogOffer.id,
        actorSubject: actor.subject,
        recordedAt: at,
      });
      const reservationId = `trv_d02_${tag}_${index}`,
        orderId = `ord_d02_${tag}_${index}`,
        paymentId = `pay_d02_${tag}_${index}`;
      const amount = { minorUnits: 10000, currency: "BRL" };
      const reservation = createTicketReservation({
        id: reservationId,
        requestKey: createTicketReservationRequestKey(
          created.offer.id,
          `d02_attempt_${tag}_${index}`,
        ),
        inventoryId: created.offer.id,
        destinationId,
        product,
        unitAmount: amount,
        pricingVersion: "d02-v1",
        holderReference: `holder_${tag}`,
        quantity: 1,
        status: "confirmed",
        expiresAt: "2026-11-01T10:30:00Z",
        validUntil: until,
        orderId,
        paymentId,
        createdAt: at,
        confirmedAt,
        updatedAt: confirmedAt,
      });
      expect(reservation).not.toBeNull();
      // Seed the canonical confirmed snapshot without exercising unrelated payment/event writes.
      await ticketPool.execute(
        `INSERT INTO ticketing_reservations (reservation_id,request_key,inventory_id,destination_id,product_kind,product_reference,unit_amount_minor,currency,pricing_version,holder_reference,quantity,status,expires_at,valid_until,order_id,payment_id,created_at,confirmed_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,'confirmed',?,?,?,?,?,?,?)`,
        [
          reservation.id,
          reservation.requestKey,
          reservation.inventoryId,
          destinationId,
          product.kind,
          product.reference,
          amount.minorUnits,
          amount.currency,
          reservation.pricingVersion,
          reservation.holderReference,
          new Date(reservation.expiresAt),
          new Date(until),
          orderId,
          paymentId,
          new Date(at),
          new Date(confirmedAt),
          new Date(confirmedAt),
        ],
      );
      const reservationOrders =
        createTicketingReservationOrderApplicationService({
          orders,
          bindings,
          identities: { allocateOrderId: () => orderId },
        });
      const { order } = await reservationOrders.placeReservationOrder({
        reservationReference: reservationId,
        productReference: `${product.kind}:${product.reference}`,
        quantity: 1,
        amount,
        pricingVersion: "d02-v1",
        capturedAt: at,
      });
      await orders.save({
        ...order,
        status: "payment_confirmed",
        updatedAt: confirmedAt,
      });
      const ticket = createTicket({
        id: `tck_d02_${tag}_${index}`,
        orderId,
        paymentId,
        destinationId,
        product,
        holderName: "Visitante Teste",
        quantity: 1,
        amount,
        code: `D02${index}-${tag.slice(0, 4).toUpperCase()}-${tag.slice(4).toUpperCase()}-TCKT`,
        status: "issued",
        issuedAt: confirmedAt,
        validUntil: until,
        updatedAt: confirmedAt,
      });
      expect(ticket).not.toBeNull();
      await tickets.save(ticket);
      fixtures.push({ ticket, reservation });
    }
    service = T.createTicketingApplicationService({
      orders,
      payments: {},
      tickets,
      checkIns: new T.MySqlTicketCheckInRepository(ticketPool),
      offline: {},
      transactions: new T.MySqlTicketingTransactionalCommand(ticketPool),
      signingSecret: secret,
      clock,
      operatorAuthorization: T.createTicketingOperatorAuthorization({
        bindings,
        reservations,
        businessInventory: inventory,
        owner: createTicketingOperatorOwnerPort({
          getPlacePlatformRuntime: () => place,
        }),
      }),
    });
    const authorization = {
      authorize: (...args) =>
        createTicketingAuthorizationPort({ authApi: auth }).authorize(...args),
    };
    transport = new T.TicketingCommerceHttpTransport({
      enabled: true,
      ticketing: service,
      tickets,
      reservations,
      businessInventory: inventory,
      authorization,
      audit: { async record() {} },
      qrSigningSecret: secret,
      offlineProvisioningSecret: secret,
      destinationId: "morro-de-sao-paulo",
      clock,
    });
  }, 30000);
  afterAll(async () => {
    await auth?.stop();
    await place?.stop();
    await Promise.all([ticketPool?.end(), orderPool?.end()]);
  });

  it("D02 SQL A/A: canonical check-in and replay", async () => {
    const session = await login();
    const results = await Promise.all([checkIn(session), checkIn(session)]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    const authority = (
      await createTicketingAuthorizationPort({ authApi: auth }).authorize(
        request("/", {}, session),
        { mutation: true, admin: true },
      )
    ).actor.operatorAuthority;
    const saved = await state();
    expect(saved.ticket.status).toBe("validated");
    expect(saved.checkIns).toHaveLength(1);
    expect(saved.checkIns[0].operatorReference).toBe(users[0].id);
    const byCode = {
      code: fixtures[0].ticket.code,
      result: "used",
      operatorReference: authority.subject,
      operatorAuthority: authority,
      occurredAt: "2026-11-01T11:31:00.000Z",
    };
    expect((await service.checkInByCode(byCode)).replayed).toBe(false);
    expect((await service.checkInByCode(byCode)).replayed).toBe(true);
    const used = await state();
    expect(used.ticket.status).toBe("used");
    expect(used.checkIns).toHaveLength(2);
    expect(
      used.checkIns.every((entry) => entry.operatorReference === users[0].id),
    ).toBe(true);
  });
  it.each([
    ["A/B: same-destination denial", "manager", 1, 404],
    ["A/C: cross-destination denial", "manager", 2, 404],
    ["AFFILIATE: capability denied", "affiliate", 0, 403],
    ["VIEWER: capability denied", "viewer", 0, 403],
  ])("D02 SQL %s", async (_, role, index, status) => {
    const response = await deniedUnchanged(await login(role), index, status);
    if (status === 404) expect(response.body).toEqual({ error: "NOT_FOUND" });
  });
  it("D02 SQL guest: operator denied", async () => {
    const guest = await transport.handle(
      request("/api/ticketing/v1/consumer-session", {}),
    );
    expect(guest.status).toBe(201);
    await deniedUnchanged(
      {
        cookie: guest.headers["Set-Cookie"].split(";")[0],
        csrf: guest.body.data.csrfToken,
      },
      0,
      401,
    );
  });
  it("D02 SQL forged body: no authority escalation", async () => {
    await deniedUnchanged(await login(), 1, 404, {
      operatorReference: users[3].id,
      businessId: businesses[1],
      operatorAuthority: {
        subject: users[3].id,
        capabilities: ["ticketing.manage"],
        scope: { kind: "platform" },
      },
    });
  });
  it("D02 SQL owner unavailable: sanitized denial", async () => {
    const session = await login();
    await place.stop();
    const response = await deniedUnchanged(session, 0, 503);
    expect(response.body).toEqual({ error: "TICKETING_UNAVAILABLE" });
    expect(await place.start()).toBe(true);
  });
  it("D02 SQL revoked session: replay denied", async () => {
    const session = await login();
    expect((await authRequest(auth, "logout", {}, session)).status).toBe(200);
    await deniedUnchanged(session, 0, 401);
  });
  it("D02 SQL revoked capability: replay denied", async () => {
    const session = await login();
    await auth.updateUserRole(users[0].id, "AFFILIATE", users[3].id);
    await deniedUnchanged(session, 0, 401);
    await deniedUnchanged(await login(), 0, 403);
    await auth.updateUserRole(users[0].id, "BUSINESS_MANAGER", users[3].id);
  });
  it("D02 SQL removed scope: replay denied", async () => {
    const session = await login();
    await auth.stop();
    await openAuth(businesses[1]);
    await deniedUnchanged(session, 0, 404);
    await auth.stop();
    await openAuth();
  });
  it("D02 SQL platform: explicit global authority", async () => {
    expect((await checkIn(await login("platform"), 2)).status).toBe(200);
    expect((await state(2)).checkIns).toHaveLength(1);
  });
  it("D02 SQL missing ticket: indistinguishable response", async () => {
    const session = await login();
    const denied = await deniedUnchanged(session, 1, 404);
    const missing = await transport.handle(
      request(
        "/api/ticketing/v1/operator/check-in",
        { qrPayload: createTicketQrPayload(`tck_missing_${tag}`, secret) },
        session,
      ),
    );
    expect([missing.status, missing.body]).toEqual([
      denied.status,
      denied.body,
    ]);
  });
  it("D02 SQL cancelled ticket: authorized replay preserves cancellation", async () => {
    const session = await login("platform");
    const before = await state(2);
    expect(before.ticket.status).toBe("validated");
    const cancelled = createTicket({
      ...before.ticket,
      status: "cancelled",
      cancelledAt: "2026-11-01T11:32:00.000Z",
      updatedAt: "2026-11-01T11:32:00.000Z",
    });
    expect(cancelled).not.toBeNull();
    await new T.MySqlTicketRepository(ticketPool).save(cancelled);
    const snapshot = await state(2);
    const replay = await checkIn(session, 2);
    expect(replay.status).toBe(200);
    expect(replay.body.data.replayed).toBe(true);
    expect(await state(2)).toEqual(snapshot);
    const authority = (
      await createTicketingAuthorizationPort({ authApi: auth }).authorize(
        request("/", {}, session),
        { mutation: true, admin: true },
      )
    ).actor.operatorAuthority;
    await expect(
      service.checkInByQr({
        qrPayload: createTicketQrPayload(cancelled.id, secret),
        operatorAuthority: authority,
        occurredAt: "2026-11-01T11:33:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "TICKETING_TICKET_REVOKED" });
    expect(await state(2)).toEqual(snapshot);
  });
});

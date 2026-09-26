import { Readable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import { createCommerceApi } from "./commerce-api.mjs";

function makeReservation(overrides = {}) {
  return {
    id: "rrv_restaurant_api_12345678",
    slotId: "rsl_restaurant_api_12345678",
    businessId: "business-restaurant",
    placeId: "place_restaurant",
    destinationId: "morro-de-sao-paulo",
    serviceDate: "2026-10-10",
    startsAt: "2026-10-10T22:00:00.000Z",
    endsAt: "2026-10-11T00:00:00.000Z",
    partySize: 2,
    seatingArea: "varanda",
    status: "held",
    depositPolicy: { kind: "none" },
    holdExpiresAt: "2026-10-10T20:10:00.000Z",
    createdAt: "2026-10-10T20:00:00.000Z",
    updatedAt: "2026-10-10T20:00:00.000Z",
    ...overrides,
  };
}

function makeRuntime(overrides = {}) {
  return {
    pools: [],
    destinationId: "morro-de-sao-paulo",
    repository: {
      listAvailabilityForDate: vi.fn(async () => []),
      findForHolder: vi.fn(async () => null),
      hold: vi.fn(),
      confirmWithoutDeposit: vi.fn(),
      saveSlot: vi.fn(async (value) => value),
    },
    reservationOrders: { placeReservationOrder: vi.fn() },
    sessions: {
      fromRequest: vi.fn(() => null),
      authorizeMutation: vi.fn(() => ({ allowed: true })),
    },
    createSlot: vi.fn((value) => value),
    createReservationRequestKey: vi.fn(
      (slotId, key) => "restaurant:" + slotId + ":" + key,
    ),
    normalizeCheckoutHandoff: vi.fn((value) => value),
    createCheckoutCapability: vi.fn(() => "restaurant-checkout-token"),
    ...overrides,
  };
}

function makeAuth(overrides = {}) {
  return {
    resolveSession: vi.fn(async () => ({
      subject: "user:restaurant-owner",
      role: "owner",
      businessIds: ["business-restaurant"],
    })),
    authorizeMutation: vi.fn(() => ({ allowed: true })),
    authorizeBusinessRequest: vi.fn(async () => ({
      businessId: "business-restaurant",
    })),
    ...overrides,
  };
}

function env(key) {
  return (
    {
      COMMERCE_FEATURE_ENABLED: "true",
      COMMERCE_DATABASE_URL: "mysql://commerce",
      ORDERING_DATABASE_URL: "mysql://ordering",
      PAYMENTS_HANDOFF_SECRET: "x".repeat(40),
      PAYMENTS_DESTINATION_ID: "morro-de-sao-paulo",
      TICKETING_OFFLINE_PROVISIONING_SECRET: "y".repeat(40),
    }[key] ?? ""
  );
}

async function invoke(api, method, url, body, headers = {}) {
  const request = Readable.from(
    body === undefined ? [] : [JSON.stringify(body)],
  );
  request.method = method;
  request.url = url;
  request.headers = headers;
  let responseBody = null;
  const response = {
    statusCode: 0,
    setHeader() {},
    end(value) {
      responseBody = JSON.parse(String(value));
    },
  };
  await api.handle(request, response, new URL(url, "http://localhost"));
  return { status: response.statusCode, body: responseBody };
}

describe("Restaurant Commerce API", () => {
  it("is noncritical and disabled without Commerce configuration", async () => {
    const api = createCommerceApi({
      authApi: makeAuth(),
      getEnvironmentValue: () => "",
    });
    await expect(api.start()).resolves.toBe(true);
    expect(api.readinessCheck()).toEqual({
      status: "pass",
      critical: false,
      detail: "commerce-feature-disabled",
    });
    const result = await invoke(
      api,
      "GET",
      "/api/commerce/v1/restaurants/business-restaurant/availability?date=2026-10-10",
    );
    expect(result).toMatchObject({
      status: 503,
      body: { error: "COMMERCE_FEATURE_DISABLED" },
    });
  });

  it("projects public availability from the canonical repository", async () => {
    const active = makeRuntime();
    active.repository.listAvailabilityForDate.mockResolvedValue([
      {
        slot: {
          ...makeReservation(),
          id: "rsl_restaurant_api_12345678",
          capacity: 8,
          minPartySize: 1,
          maxPartySize: 4,
          depositPolicy: { kind: "none" },
        },
        availability: { remainingGuests: 6, bookable: true },
      },
    ]);
    const api = createCommerceApi({
      authApi: makeAuth(),
      getEnvironmentValue: env,
      now: () => "2026-10-10T20:00:00.000Z",
      runtimeFactory: vi.fn(async () => active),
    });
    await api.start();
    const result = await invoke(
      api,
      "GET",
      "/api/commerce/v1/restaurants/business-restaurant/availability?date=2026-10-10&placeId=place_restaurant",
    );
    expect(result.status).toBe(200);
    expect(result.body.data[0]).toMatchObject({
      slot: { id: "rsl_restaurant_api_12345678" },
      availability: { remainingGuests: 6, bookable: true },
    });
    expect(active.repository.listAvailabilityForDate).toHaveBeenCalledWith({
      businessId: "business-restaurant",
      placeId: "place_restaurant",
      serviceDate: "2026-10-10",
      observedAt: "2026-10-10T20:00:00.000Z",
    });
  });

  it("uses shared guest-session mutation authority for no-deposit reservations", async () => {
    const held = makeReservation();
    const confirmed = makeReservation({ status: "confirmed" });
    const active = makeRuntime();
    active.sessions.fromRequest.mockReturnValue({
      claims: { subject: "guest:0123456789abcdef0123456789abcdef" },
    });
    active.repository.hold.mockResolvedValue({
      reservation: held,
      availability: {},
      replayed: false,
    });
    active.repository.confirmWithoutDeposit.mockResolvedValue({
      reservation: confirmed,
      replayed: false,
    });
    const api = createCommerceApi({
      authApi: makeAuth({ resolveSession: vi.fn(async () => null) }),
      getEnvironmentValue: env,
      runtimeFactory: vi.fn(async () => active),
    });
    await api.start();
    const result = await invoke(
      api,
      "POST",
      "/api/commerce/v1/restaurants/business-restaurant/reservations",
      { slotId: held.slotId, partySize: 2 },
      { "idempotency-key": "attempt123", "x-csrf-token": "csrf" },
    );
    expect(result).toMatchObject({
      status: 201,
      body: {
        data: { status: "confirmed" },
        paymentRequired: false,
      },
    });
    expect(active.sessions.authorizeMutation).toHaveBeenCalledTimes(1);
  });

  it("returns a signed checkout handoff when a deposit is required", async () => {
    const held = makeReservation({
      holderReference: "user:restaurant-owner",
      depositPolicy: {
        kind: "required",
        amount: { minorUnits: 5000, currency: "BRL" },
      },
    });
    const active = makeRuntime();
    active.repository.hold.mockResolvedValue({
      reservation: held,
      availability: {},
      replayed: false,
    });
    active.reservationOrders.placeReservationOrder.mockResolvedValue({
      order: {
        id: "ord_restaurant_api_12345678",
        requestKey: "restaurant:rrv_restaurant_api_12345678",
      },
      replayed: false,
    });
    const api = createCommerceApi({
      authApi: makeAuth(),
      getEnvironmentValue: env,
      runtimeFactory: vi.fn(async () => active),
    });
    await api.start();
    const result = await invoke(
      api,
      "POST",
      "/api/commerce/v1/restaurants/business-restaurant/reservations",
      {
        slotId: held.slotId,
        partySize: 2,
        customer: {
          name: "Cliente",
          email: "cliente@example.com",
          phone: null,
          document: null,
        },
        returnUrl: "https://morro.digital/restaurants/reservation",
      },
      { "idempotency-key": "attempt123" },
    );
    expect(result).toMatchObject({
      status: 202,
      body: {
        paymentRequired: true,
        checkout: {
          token: "restaurant-checkout-token",
          idempotencyKey: "restaurant:rrv_restaurant_api_12345678",
        },
      },
    });
    expect(active.createCheckoutCapability).toHaveBeenCalledWith(
      expect.objectContaining({ reservationReference: held.id }),
      expect.objectContaining({
        tenantId: "business-restaurant",
        requesterKind: "authenticated",
      }),
    );
  });

  it("scopes reads to the consumer and slot creation to the operator business", async () => {
    const active = makeRuntime();
    const existing = makeReservation({
      holderReference: "user:restaurant-owner",
      status: "confirmed",
    });
    active.repository.findForHolder.mockResolvedValue(existing);
    const auth = makeAuth();
    const api = createCommerceApi({
      authApi: auth,
      getEnvironmentValue: env,
      now: () => "2026-09-26T21:00:00.000Z",
      runtimeFactory: vi.fn(async () => active),
    });
    await api.start();

    const read = await invoke(
      api,
      "GET",
      "/api/commerce/v1/restaurants/business-restaurant/reservations/" +
        existing.id,
    );
    expect(read.status).toBe(200);
    expect(active.repository.findForHolder).toHaveBeenCalledWith({
      reservationId: existing.id,
      businessId: "business-restaurant",
      holderReference: "user:restaurant-owner",
    });

    const created = await invoke(
      api,
      "POST",
      "/api/commerce/v1/operator/businesses/business-restaurant/restaurant-slots",
      {
        id: "rsl_restaurant_api_87654321",
        placeId: "place_restaurant",
        serviceDate: "2026-10-11",
        startsAt: "2026-10-11T22:00:00.000Z",
        endsAt: "2026-10-12T00:00:00.000Z",
        capacity: 8,
        minPartySize: 1,
        maxPartySize: 4,
        minimumLeadMinutes: 60,
        maximumAdvanceDays: 90,
        holdDurationSeconds: 600,
        depositPolicy: { kind: "none" },
        enabled: true,
      },
    );
    expect(created.status).toBe(201);
    expect(auth.authorizeBusinessRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "business-restaurant",
      expect.objectContaining({
        mutation: true,
        auditAction: "commerce.restaurant_slot.mutate",
      }),
    );
    expect(active.createSlot).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "business-restaurant",
        destinationId: "morro-de-sao-paulo",
      }),
    );
  });
});

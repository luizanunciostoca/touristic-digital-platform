import { describe, expect, it } from "vitest";

import { createTicketingApi } from "./ticketing-api.mjs";

function authApi() {
  return {
    resolveSession: async () => null,
    authorizeMutation: () => ({ allowed: false }),
  };
}

describe("ticketing startup configuration", () => {
  it("starts in a safe disabled state when the feature flag is omitted", async () => {
    const api = createTicketingApi({
      authApi: authApi(),
      getEnvironmentValue: () => "",
      audit: () => {},
    });

    await expect(api.start()).resolves.toBe(true);
    await api.stop();
  });

  it("rejects an invalid feature flag instead of silently disabling Ticketing", async () => {
    const api = createTicketingApi({
      authApi: authApi(),
      getEnvironmentValue: (key) =>
        key === "TICKETING_FEATURE_ENABLED" ? "TRUE" : "",
      audit: () => {},
    });

    await expect(api.start()).resolves.toBe(false);
  });

  it("fails closed when Ticketing is enabled without mandatory dependencies", async () => {
    const api = createTicketingApi({
      authApi: authApi(),
      getEnvironmentValue: (key) =>
        key === "TICKETING_FEATURE_ENABLED" ? "true" : "",
      audit: () => {},
    });

    await expect(api.start()).resolves.toBe(false);
  });

  it("delegates Control Center admin projections to the injected Ticketing owner service", async () => {
    const adminService = {
      listInventory: async () => [{ offer: { id: "tin_admin_0001" } }],
      readInventory: async () => ({
        projection: { offer: { id: "tin_admin_0001" } },
      }),
      listReservations: async () => [{ reservation: { id: "trv_admin_0001" } }],
      readReservation: async () => ({
        reservation: { id: "trv_admin_0001" },
        events: [],
      }),
      cancelHeldReservation: async () => ({
        previousState: { status: "held" },
        newState: { status: "cancelled" },
        replayed: false,
      }),
    };
    const transportCalls = [];
    const api = createTicketingApi({
      authApi: authApi(),
      publicTransport: {
        handle: async (request) => {
          transportCalls.push(request);
          if (request.pathname.endsWith("/disable")) {
            return {
              status: 200,
              headers: {},
              body: {
                data: {
                  id: "mpi_admin_000000000000000000000000",
                  businessId: "business-admin-0001",
                  enabled: false,
                },
              },
            };
          }
          if (request.pathname.includes("/operator/businesses/")) {
            return {
              status: 201,
              headers: {},
              body: {
                data: {
                  id: "mpi_admin_000000000000000000000000",
                  businessId: "business-admin-0001",
                  enabled: true,
                },
              },
            };
          }
          return { status: 404, headers: {}, body: {} };
        },
      },
      adminService,
      audit: () => {},
    });

    await expect(
      api.adminListInventory({ query: "admin" }),
    ).resolves.toMatchObject({
      status: "found",
      data: [{ offer: { id: "tin_admin_0001" } }],
    });
    await expect(
      api.adminReadReservation("trv_admin_0001"),
    ).resolves.toMatchObject({
      status: "found",
      data: { reservation: { id: "trv_admin_0001" } },
    });
    await expect(
      api.adminCancelHeldReservation({
        reservationId: "trv_admin_0001",
        cancelledAt: "2026-09-21T12:00:00.000Z",
        actorReference: "platform_owner",
      }),
    ).resolves.toMatchObject({
      status: "updated",
      data: { newState: { status: "cancelled" } },
    });

    const ownerRequest = {
      headers: {
        host: "localhost",
        origin: "http://localhost",
        "x-csrf-token": "csrf",
      },
      morroCorrelationId: "corr_admin_inventory_0001",
    };
    await expect(
      api.adminCreateBusinessOffer({
        request: ownerRequest,
        businessId: "business-admin-0001",
        requestKey: "offer_admin_0001",
        offer: { productKind: "tour" },
      }),
    ).resolves.toMatchObject({
      status: "created",
      data: { businessId: "business-admin-0001", enabled: true },
    });
    await expect(
      api.adminDisableBusinessOffer({
        request: ownerRequest,
        businessId: "business-admin-0001",
        inventoryId: "mpi_admin_000000000000000000000000",
      }),
    ).resolves.toMatchObject({
      status: "updated",
      data: { businessId: "business-admin-0001", enabled: false },
    });
    expect(transportCalls).toHaveLength(2);
    expect(transportCalls[0]).toMatchObject({
      method: "POST",
      body: { productKind: "tour" },
    });
    expect(transportCalls[0].headers["idempotency-key"]).toBe(
      "offer_admin_0001",
    );
    expect(transportCalls[1].pathname).toContain(
      "/mpi_admin_000000000000000000000000/disable",
    );
  });
});

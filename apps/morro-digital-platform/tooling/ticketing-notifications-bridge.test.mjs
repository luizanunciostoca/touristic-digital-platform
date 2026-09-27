import { describe, expect, it, vi } from "vitest";

import { createTicketingNotificationsBridge } from "./ticketing-notifications-bridge.mjs";

function destinationService(
  result = {
    status: "found",
    data: { locale: "pt-BR" },
  },
) {
  return { read: vi.fn(async () => result) };
}

function runtime(preferences) {
  return {
    listPreferences: vi.fn(async () => preferences),
    enqueueEvent: vi.fn(async () => "enqueued"),
  };
}

const input = Object.freeze({
  tenantId: "business-toca",
  destinationId: "morro-de-sao-paulo",
  recipientReference: "user:user-001",
  occurredAt: "2026-09-27T18:30:00.000Z",
  ticketReference: "tck_ticket_bridge_0001",
  experienceName: "Volta à Ilha",
});

describe("Ticketing notifications bridge", () => {
  it("enqueues ticket_issued only from explicit preference and Destination locale", async () => {
    const notificationsRuntime = runtime([
      {
        destinationId: input.destinationId,
        recipientReference: input.recipientReference,
        topic: "ticket",
        channel: "email",
        allowed: true,
        updatedAt: "2026-09-27T18:00:00.000Z",
      },
    ]);
    const destinations = destinationService();
    const bridge = createTicketingNotificationsBridge({
      notificationsRuntime,
      destinationService: destinations,
    });

    await expect(bridge.ticketIssued(input)).resolves.toBe("enqueued");
    expect(destinations.read).toHaveBeenCalledWith(input.destinationId);
    expect(notificationsRuntime.enqueueEvent).toHaveBeenCalledWith({
      tenantId: input.tenantId,
      event: expect.objectContaining({
        type: "ticket_issued",
        eventId: `ticket-issued:${input.ticketReference}`,
        locale: "pt-BR",
        channel: "email",
        ticketReference: input.ticketReference,
        experienceName: input.experienceName,
      }),
    });
  });

  it("suppresses when no ticket channel was explicitly allowed", async () => {
    const notificationsRuntime = runtime([
      {
        destinationId: input.destinationId,
        recipientReference: input.recipientReference,
        topic: "ticket",
        channel: "email",
        allowed: false,
        updatedAt: "2026-09-27T18:00:00.000Z",
      },
    ]);
    const bridge = createTicketingNotificationsBridge({
      notificationsRuntime,
      destinationService: destinationService(),
    });

    await expect(bridge.ticketIssued(input)).resolves.toBe("suppressed");
    expect(notificationsRuntime.enqueueEvent).not.toHaveBeenCalled();
  });

  it("fails closed when more than one channel is allowed", async () => {
    const notificationsRuntime = runtime([
      { topic: "ticket", channel: "email", allowed: true },
      { topic: "ticket", channel: "push", allowed: true },
    ]);
    const bridge = createTicketingNotificationsBridge({
      notificationsRuntime,
      destinationService: destinationService(),
    });

    await expect(bridge.ticketIssued(input)).resolves.toBe(
      "ambiguous_preferences",
    );
    expect(notificationsRuntime.enqueueEvent).not.toHaveBeenCalled();
  });

  it("fails closed when Destination locale is unavailable", async () => {
    const notificationsRuntime = runtime([
      { topic: "ticket", channel: "email", allowed: true },
    ]);
    const bridge = createTicketingNotificationsBridge({
      notificationsRuntime,
      destinationService: destinationService({ status: "not_found" }),
    });

    await expect(bridge.ticketIssued(input)).resolves.toBe("unavailable");
    expect(notificationsRuntime.enqueueEvent).not.toHaveBeenCalled();
  });
});

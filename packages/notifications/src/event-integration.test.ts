import { describe, expect, it, vi } from "vitest";

import {
  createNotificationEventRouter,
  createNotificationJobFromEvent,
  type NotificationDomainEvent,
} from "./event-integration.js";

const base = {
  eventId: "evt-ticket-001",
  destinationId: "morro-de-sao-paulo",
  recipientReference: "user:user-001",
  locale: "pt-BR",
  occurredAt: "2026-09-20T10:00:00.000Z",
  channel: "email" as const,
};

describe("notification event integration", () => {
  it.each([
    [
      {
        ...base,
        type: "ticket_issued",
        ticketReference: "ticket-001",
        experienceName: "Volta à Ilha",
      },
      "ticket_confirmation",
    ],
    [
      {
        ...base,
        type: "reservation_reminder_requested",
        eventId: "evt-reservation-001",
        deliverAt: "2026-09-21T10:00:00.000Z",
        reservationReference: "reservation-001",
        experienceName: "Volta à Ilha",
      },
      "reservation_reminder",
    ],
    [
      {
        ...base,
        type: "tour_reminder_requested",
        eventId: "evt-tour-001",
        deliverAt: "2026-09-21T10:00:00.000Z",
        tourReference: "tour-001",
        tourName: "Volta à Ilha",
      },
      "tour_reminder",
    ],
    [
      {
        ...base,
        type: "payment_issue_detected",
        eventId: "evt-payment-001",
        orderReference: "order-001",
        reasonCode: "provider_pending",
      },
      "payment_issue",
    ],
    [
      {
        ...base,
        type: "reservation_cancelled",
        eventId: "evt-cancel-001",
        reservationReference: "reservation-001",
        experienceName: "Volta à Ilha",
      },
      "cancellation",
    ],
    [
      {
        ...base,
        type: "refund_confirmed",
        eventId: "evt-refund-001",
        orderReference: "order-001",
        refundReference: "refund-001",
      },
      "refund",
    ],
  ] satisfies readonly [NotificationDomainEvent, string][])(
    "maps %s to %s",
    (event, template) => {
      expect(createNotificationJobFromEvent(event)?.request.template).toBe(
        template,
      );
    },
  );

  it("uses source-event identity in deterministic idempotency", () => {
    const event: NotificationDomainEvent = {
      ...base,
      type: "ticket_issued",
      ticketReference: "ticket-001",
      experienceName: "Volta à Ilha",
    };

    const first = createNotificationJobFromEvent(event);
    const replay = createNotificationJobFromEvent(event);

    expect(first?.request.idempotencyKey).toBe(replay?.request.idempotencyKey);
    expect(first?.sourceEventId).toBe("evt-ticket-001");
  });

  it("rejects reminder delivery before the authoritative event time", () => {
    const event: NotificationDomainEvent = {
      ...base,
      type: "reservation_reminder_requested",
      eventId: "evt-reminder-001",
      deliverAt: "2026-09-20T09:59:59.000Z",
      reservationReference: "reservation-001",
      experienceName: "Volta à Ilha",
    };

    expect(createNotificationJobFromEvent(event)).toBeNull();
  });

  it("keeps direct delivery addresses outside the event contract", () => {
    const event = {
      ...base,
      type: "ticket_issued",
      ticketReference: "ticket-001",
      experienceName: "Volta à Ilha",
      email: "guest@example.com",
    } as NotificationDomainEvent & { email: string };

    const job = createNotificationJobFromEvent(event);

    expect(job).not.toBeNull();
    expect(JSON.stringify(job)).not.toContain("guest@example.com");
  });

  it("enqueues only validated jobs", async () => {
    const enqueue = vi.fn(async () => undefined);
    const router = createNotificationEventRouter({ enqueue });
    const event: NotificationDomainEvent = {
      ...base,
      type: "refund_confirmed",
      eventId: "evt-refund-002",
      orderReference: "order-002",
      refundReference: "refund-002",
    };

    await expect(router.handle(event)).resolves.toBe("enqueued");
    expect(enqueue).toHaveBeenCalledOnce();

    await expect(
      router.handle({
        ...event,
        eventId: "bad id with spaces",
      }),
    ).resolves.toBe("rejected");
    expect(enqueue).toHaveBeenCalledOnce();
  });
});

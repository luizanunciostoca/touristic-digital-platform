import {
  createNotificationRequest,
  type NotificationChannel,
  type NotificationRequest,
  type NotificationTemplate,
} from "./index.js";

export type NotificationDomainEvent =
  | Readonly<{
      type: "ticket_issued";
      eventId: string;
      destinationId: string;
      recipientReference: string;
      locale: string;
      occurredAt: string;
      channel: NotificationChannel;
      ticketReference: string;
      experienceName: string;
    }>
  | Readonly<{
      type: "reservation_reminder_requested";
      eventId: string;
      destinationId: string;
      recipientReference: string;
      locale: string;
      occurredAt: string;
      deliverAt: string;
      channel: NotificationChannel;
      reservationReference: string;
      experienceName: string;
    }>
  | Readonly<{
      type: "tour_reminder_requested";
      eventId: string;
      destinationId: string;
      recipientReference: string;
      locale: string;
      occurredAt: string;
      deliverAt: string;
      channel: NotificationChannel;
      tourReference: string;
      tourName: string;
    }>
  | Readonly<{
      type: "payment_issue_detected";
      eventId: string;
      destinationId: string;
      recipientReference: string;
      locale: string;
      occurredAt: string;
      channel: NotificationChannel;
      orderReference: string;
      reasonCode: string;
    }>
  | Readonly<{
      type: "reservation_cancelled";
      eventId: string;
      destinationId: string;
      recipientReference: string;
      locale: string;
      occurredAt: string;
      channel: NotificationChannel;
      reservationReference: string;
      experienceName: string;
    }>
  | Readonly<{
      type: "refund_confirmed";
      eventId: string;
      destinationId: string;
      recipientReference: string;
      locale: string;
      occurredAt: string;
      channel: NotificationChannel;
      orderReference: string;
      refundReference: string;
    }>;

export interface NotificationJob {
  readonly request: NotificationRequest;
  readonly deliverAt: string;
  readonly sourceEventId: string;
}

export interface NotificationJobPort {
  enqueue(job: NotificationJob): Promise<void>;
}

function isIsoTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function templateForEvent(
  event: NotificationDomainEvent,
): NotificationTemplate {
  switch (event.type) {
    case "ticket_issued":
      return "ticket_confirmation";
    case "reservation_reminder_requested":
      return "reservation_reminder";
    case "tour_reminder_requested":
      return "tour_reminder";
    case "payment_issue_detected":
      return "payment_issue";
    case "reservation_cancelled":
      return "cancellation";
    case "refund_confirmed":
      return "refund";
  }
}

function variablesForEvent(
  event: NotificationDomainEvent,
): Readonly<Record<string, unknown>> {
  switch (event.type) {
    case "ticket_issued":
      return Object.freeze({
        ticketReference: event.ticketReference,
        experienceName: event.experienceName,
      });
    case "reservation_reminder_requested":
      return Object.freeze({
        reservationReference: event.reservationReference,
        experienceName: event.experienceName,
      });
    case "tour_reminder_requested":
      return Object.freeze({
        tourReference: event.tourReference,
        tourName: event.tourName,
      });
    case "payment_issue_detected":
      return Object.freeze({
        orderReference: event.orderReference,
        reasonCode: event.reasonCode,
      });
    case "reservation_cancelled":
      return Object.freeze({
        reservationReference: event.reservationReference,
        experienceName: event.experienceName,
      });
    case "refund_confirmed":
      return Object.freeze({
        orderReference: event.orderReference,
        refundReference: event.refundReference,
      });
  }
}

function deliveryTimeForEvent(event: NotificationDomainEvent): string | null {
  if (
    event.type === "reservation_reminder_requested" ||
    event.type === "tour_reminder_requested"
  ) {
    if (!isIsoTimestamp(event.deliverAt)) return null;
    if (Date.parse(event.deliverAt) < Date.parse(event.occurredAt)) return null;
    return event.deliverAt;
  }

  return event.occurredAt;
}

export function createNotificationJobFromEvent(
  event: NotificationDomainEvent,
): NotificationJob | null {
  if (!isIsoTimestamp(event.occurredAt)) return null;

  const template = templateForEvent(event);
  const deliverAt = deliveryTimeForEvent(event);
  if (!deliverAt) return null;

  const request = createNotificationRequest({
    id: `notification:${event.eventId}`,
    idempotencyKey: `notify.${template}.${event.eventId}.${event.recipientReference}`,
    destinationId: event.destinationId,
    recipientReference: event.recipientReference,
    locale: event.locale,
    template,
    channel: event.channel,
    variables: variablesForEvent(event),
    requestedAt: event.occurredAt,
  });
  if (!request) return null;

  return Object.freeze({
    request,
    deliverAt,
    sourceEventId: event.eventId,
  });
}

export function createNotificationEventRouter(
  jobs: NotificationJobPort,
): Readonly<{
  handle(event: NotificationDomainEvent): Promise<"enqueued" | "rejected">;
}> {
  return Object.freeze({
    async handle(
      event: NotificationDomainEvent,
    ): Promise<"enqueued" | "rejected"> {
      const job = createNotificationJobFromEvent(event);
      if (!job) return "rejected";
      await jobs.enqueue(job);
      return "enqueued";
    },
  });
}

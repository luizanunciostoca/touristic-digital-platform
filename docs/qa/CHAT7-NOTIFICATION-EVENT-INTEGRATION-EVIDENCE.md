# Chat 7 — Notification Event Integration Evidence

## Scope

This wave connects authoritative domain-event intent to the Notifications foundation without selecting or configuring a real delivery provider.

## Supported event mapping

- `ticket_issued` → `ticket_confirmation`
- `reservation_reminder_requested` → `reservation_reminder`
- `tour_reminder_requested` → `tour_reminder`
- `payment_issue_detected` → `payment_issue`
- `reservation_cancelled` → `cancellation`
- `refund_confirmed` → `refund`

## Reminder scheduling

The Notifications domain does not invent reminder lead time.

Reminder events must carry an explicit ISO `deliverAt` determined by an authoritative scheduler/product rule. A reminder earlier than its own source event is rejected.

The portable integration returns a `NotificationJob` containing the validated request plus `deliverAt`.

## Idempotency

The notification idempotency key is derived deterministically from:

- template;
- source event id;
- opaque recipient reference.

A replay of the same source event therefore produces the same key and is suppressed by the foundation's idempotency port after durable implementation.

## Privacy boundary

The event contract carries only opaque recipient references and template-safe variables.

Email addresses, phone numbers and provider addressing are not part of the portable event model and are not copied from unknown extra properties.

## Delivery boundary

`NotificationJobPort` is provider-neutral.

This PR does not claim:

- durable queue/outbox;
- retry backoff/DLQ;
- a production scheduler;
- APNs/FCM/Web Push;
- email/SMS provider credentials;
- production delivery.

Those remain infrastructure/adapters work and must preserve the opt-in checks in the dispatcher.

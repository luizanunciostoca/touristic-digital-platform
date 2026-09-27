# Notifications Durable Runtime Composition — 2026-09-27

## Exact scope

This ChangeSet composes the existing provider-neutral Notifications foundation into the Morro Digital server runtime without activating email, SMS, Web Push, APNs, FCM or any other external provider.

## Closed gaps

- durable MySQL outbox remains canonical;
- durable preferences are persisted by destination, opaque recipient reference, topic and channel;
- missing preference rows fail closed as denied;
- durable dispatch idempotency claims are atomic through MySQL;
- dispatch idempotency keys include destination identity;
- retry/backoff/DLQ scheduler host is composed into the application lifecycle;
- Notifications schema is applied before the scheduler starts;
- runtime readiness includes Notifications;
- scheduler/delivery observations flow through Platform Operations;
- graceful shutdown stops the scheduler before closing its pool;
- staging receives an isolated Notifications schema/user and DR allowlist coverage.

## Provider boundary

The runtime dispatcher is intentionally created with no delivery providers.

This ChangeSet does not activate or configure:

- email provider credentials;
- SMS provider credentials;
- Web Push / VAPID;
- APNs / FCM;
- direct delivery addresses.

An absent preference remains suppressed before any provider lookup. Provider activation stays a separate explicitly authorized integration.

## Event boundary

The canonical event-to-notification mapping remains in `@touristic/notifications/event-integration`.

The runtime exposes a server-side `enqueueEvent({ tenantId, event })` composition point. Browser events are not accepted as notification authority. Source-domain wiring remains a separate semantic integration unit so Ticketing, Financial and reminder schedulers retain ownership of their authoritative transitions.

## PWA boundary

No Service Worker authority changes. `/api/*` and all non-GET requests remain server/network authoritative.

## Production boundary

The production Blueprint declares the Notifications database and feature flag but keeps the runtime disabled by default until a dedicated production MySQL database is provisioned and verified. This does not block provider-neutral code certification; production activation requires infrastructure evidence, not invented credentials.

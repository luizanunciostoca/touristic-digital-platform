# Chat 7 — Analytics Ingestion Service Evidence

## Scope

This wave materializes the durable backend boundary for CAP-0026 without allowing Analytics to mutate product, commerce or financial state.

## Domain ingestion

`@touristic/analytics/ingestion` parses the wire envelope through the canonical Analytics schema and privacy allowlists.

The server rejects:

- unknown event names;
- invalid timestamps;
- malformed envelopes;
- forbidden raw text fields such as search query/message/prompt;
- unsupported attributes.

Retention is assigned server-side. Browser input cannot choose or extend retention.

## Persistence

`@touristic/analytics-server` introduces a dedicated MySQL table `analytics_events`.

The table stores:

- event id;
- schema version;
- canonical event name;
- occurred timestamp;
- opaque session id;
- optional destination/locale/source;
- sanitized attributes JSON;
- server received timestamp;
- server retention deadline.

No payment amount, card data, email, phone, CPF or raw Assistant/Search text is part of the canonical event model.

## Idempotency

`event_id` is the primary key.

A repeated identical event returns `replayed`.

A repeated event id with different canonical event content throws `ANALYTICS_EVENT_ID_CONFLICT` and returns HTTP 409.

This prevents a duplicate/replay from silently changing recorded analytics history.

## Retention

The ingestion service requires `retentionDays` between 1 and 365.

`purgeExpired()` delegates deletion by the server clock and persisted `retention_until`.

The production scheduler/runtime composition for periodic purge is a separate adapter concern.

## HTTP

The provider-neutral transport owns:

`POST /api/analytics/v1/events`

Responses:

- 201 stored
- 200 replayed
- 400 invalid event
- 409 divergent event-id replay
- 503 persistence unavailable

Origin/rate-limit protection belongs to the HTTP host composition and is intentionally not hidden inside the domain transport.

## Configuration

The server uses a dedicated `ANALYTICS_DATABASE_URL` and does not share another domain database by implicit import.

This PR does not configure production credentials or deploy infrastructure.

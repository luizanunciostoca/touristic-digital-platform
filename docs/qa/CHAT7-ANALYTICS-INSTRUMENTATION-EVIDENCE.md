# Chat 7 — Analytics Instrumentation Evidence

## Scope

This wave wires the canonical privacy-first Analytics package into the public Morro Digital browser runtime.

It is intentionally based on the exact green Analytics foundation head and does not create a second schema.

## Consent

Browser consent defaults to `unknown`.

No event is delivered while consent is unknown or denied because the canonical collector drops it before transport.

The browser exposes an explicit controller at `globalThis.__MORRO_ANALYTICS__` with:

- `getConsent()`
- `setConsent("granted" | "denied")`
- `destroy()`

The decision is stored in `localStorage` under a versioned key and emits `morro:analytics-consent-changed`.

There is no implicit grant.

## Session

A random opaque session identifier is kept in `sessionStorage`, not durable cross-session storage.

No user account identifier, email, phone, document or address is attached.

## Live instrumentation

Existing application events are mapped to:

- `session_started`
- `category_viewed`
- `place_viewed`
- `assistant_query`
- `directions_started`
- `tour_started`
- `tour_completed`
- `commerce_clicked`

Assistant text is never forwarded. Only query length, input mode and boolean context flags are used.

Place display names are normalized into non-personal slug identifiers before analytics.

Tour duration is computed locally from lifecycle timestamps.

## Transaction milestone ports

These canonical application events are defined for authoritative Commerce/Ticketing surfaces to emit only after their own state transitions:

- `morro:commerce-offer-selected`
- `morro:reservation-started`
- `morro:checkout-started`
- `morro:payment-approved`
- `morro:ticket-issued`

The analytics bridge maps them to the remaining funnel events.

The bridge deliberately ignores monetary amounts, card data and unknown attributes.

This wave does not fabricate transaction state and does not move authority out of Commerce/Ticketing/Financial.

## Delivery

Delivery uses the same-origin transport already defined by `@touristic/analytics`.

Transport errors are swallowed by the browser instrumentation so analytics can never break product interaction.

Production ingestion/persistence remains a separate infrastructure acceptance item; this PR does not claim durable Analytics storage.

## Runtime ingestion endpoint

The public browser transport now has a real same-origin receiver at `POST /api/analytics/v1/events`.

The runtime endpoint independently validates:

- schema version;
- canonical event name;
- ISO timestamp;
- bounded identifiers/context;
- per-event attribute allowlist;
- primitive attribute values;
- maximum request size;
- exact JSON content type;
- POST-only method contract.

Unknown top-level fields and unknown attributes are rejected rather than silently persisted.

The raw browser `sessionId` is not recorded. The runtime converts the opaque per-tab session identifier to a SHA-256 visitor hash before handing the event to platform observations.

Accepted events are emitted as `analytics.event.recorded` observations using the existing sanitized observability boundary. The endpoint is therefore functional and no longer returns a generic API 404.

This observation sink is not a durable analytics warehouse. Production retention, aggregation, reporting and deletion/retention policy remain infrastructure/data-platform acceptance items and must not be inferred from a `202 Accepted` runtime response.

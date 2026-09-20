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
- `search_submitted`
- `assistant_query`
- `directions_started`
- `tour_started`
- `tour_completed`
- `commerce_clicked`

Search and Assistant text are never forwarded. The explicit `morro:search-submitted` application event accepts only query length, result count and filter count; the runtime currently has no dedicated first-class search form producer, so this port remains dormant until such a surface emits sanitized metrics. Assistant instrumentation uses only query length, input mode and boolean context flags.

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

This PR is stacked on the durable Analytics runtime composition. The browser therefore sends to the same canonical endpoint implemented by the durable service:

- `POST /api/analytics/v1/events`;
- same-origin only;
- bounded JSON payload;
- rate-limited by opaque network subject;
- server-side retention policy;
- durable MySQL persistence through `@touristic/analytics-server`.

The browser session id remains ephemeral in `sessionStorage`. The durable repository derives a one-way SHA-256 `session_hash` and never persists the raw session id.

The endpoint validates canonical schema/event names/attributes before persistence. Analytics remains observational only and does not gain authority over Commerce, Financial, Ticketing or CMS.

Production credentials and production database provisioning are not activated by this wave. Durable implementation and runtime composition are present in code; production deployment/configuration remains a release/infrastructure acceptance item.

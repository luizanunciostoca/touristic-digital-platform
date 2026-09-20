# Chat 7 — Analytics Foundation Evidence

## Scope

This change materializes the first canonical `@touristic/analytics` package without inventing a production analytics provider or allowing analytics to become business authority.

The foundation implements:

- the canonical product-event taxonomy required by Chat 7;
- a versioned analytics envelope;
- explicit consent gating;
- per-event attribute allowlists;
- primitive-only analytics attributes;
- rejection of raw search/Assistant text and common direct-identifier keys;
- a transport port plus same-origin browser transport;
- deterministic unit coverage for taxonomy, consent and privacy boundaries.

## Canonical taxonomy

The package owns these event names:

- `session_started`
- `category_viewed`
- `place_viewed`
- `search_submitted`
- `assistant_query`
- `directions_started`
- `tour_started`
- `tour_completed`
- `commerce_clicked`
- `offer_selected`
- `reservation_started`
- `checkout_started`
- `payment_approved`
- `ticket_issued`

This supports the target funnel `Discover → Place → Intent → Checkout → Payment → Ticket` without treating analytics as the Financial ledger, audit log or operational source of truth.

## Privacy boundary

No event is sent while consent is `unknown` or `denied`.

Attributes are allowlisted per event. Unknown attributes are dropped. Unsupported nested values, non-finite numbers and oversized strings are rejected.

Keys associated with raw free text or direct personal data, including `query`, `message`, `prompt`, `email`, `phone`, `address`, `cpf`, `card`, `token` and `secret`, cause the event to be rejected rather than silently persisted.

Search and Assistant instrumentation therefore records only coarse metadata such as query length, input mode, result count and context booleans; it does not persist the user's raw text.

## Delivery boundary

`AnalyticsTransport` is provider-neutral. The browser helper targets the same-origin path `/api/analytics/v1/events`, but this PR intentionally does not claim that a production ingestion endpoint or external analytics provider exists.

A later integration PR must supply a backend implementation with retention, deletion, rate-limit, abuse and provider-delivery policies before production analytics can be marked complete.

## Validation

Local isolated TypeScript compilation was executed with Node 22 and strict NodeNext compiler options matching the repository baseline.

Repository-level CI remains the authority for formatting, lint, typecheck, tests, architecture and build.

## Status

Analytics foundation: IMPLEMENTED.

Production analytics ingestion/provider: NOT IMPLEMENTED.

Product-surface instrumentation: NOT IMPLEMENTED in this PR.

Production analytics capability must not be marked complete until delivery, retention/privacy operations and end-to-end evidence are added.

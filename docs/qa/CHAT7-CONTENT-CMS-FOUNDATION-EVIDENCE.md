# Chat 7 — Content / CMS Foundation Evidence

## Scope

This wave materializes the provider-neutral Content domain declared by the Domain Map and CAP-0024.

It establishes an editorial lifecycle without duplicating authority owned by Catalog, Tours, Ordering or Financial.

## Canonical content kinds

The package supports editorial records for:

- Destination
- Category
- Place
- Media
- Tour
- Event
- Translation
- SEO
- Offer reference

These records may reference authoritative domain entities through an opaque `sourceReference`. They do not become the authoritative business record for those domains.

## Lifecycle

Canonical states:

- `draft`
- `preview`
- `published`
- `scheduled`
- `archived`

Only `published` content is public.

Scheduled content requires a valid future timestamp and cannot be published before its due time.

Lifecycle time is monotonic: revisions and transitions cannot move `updatedAt` backwards relative to the current document state. Scheduled publication still requires `scheduledFor` to be strictly later than the transition that created the schedule.

Archived content is terminal in this foundation.

## Versioning

New content begins at version 1.

Draft and preview content may be revised, which increments the version. Published content is immutable through `reviseContent`; a future editorial workflow should create a new draft/version rather than mutating the published projection in place.

## Safe field model

Editorial fields accept only:

- strings;
- finite numbers;
- booleans;
- null;
- bounded arrays of strings.

Nested arbitrary objects are rejected by the portable domain contract.

Rendering surfaces remain responsible for escaping/sanitizing content according to their presentation context.

## Commerce boundary

`offer_reference` is intentionally reference-only.

Fields whose names imply pricing, amount, currency, payment, checkout, ledger, discount or settlement authority are rejected. Financial and Ordering remain the sources of truth for those concerns.

## Persistence boundary

A `ContentRepository` port is defined, but this PR does not invent a storage vendor or production CMS backend.

## Not claimed

This foundation does not yet include:

- production database schema;
- CMS admin UI;
- authentication/RBAC implementation for CONTENT role;
- durable scheduler worker;
- preview-token infrastructure;
- media binary storage;
- publication webhooks;
- SEO rendering integration;
- production migrations.

Those remain separate integration and production-readiness items.

# Chat 7 — Content Public / Offline Projection Evidence

## Scope

This wave turns the CMS lifecycle foundation into a safe public read model and an offline-content snapshot contract.

It does not introduce a production CMS database or a Service Worker API cache.

## Public projection

Only `published` content with a valid `publishedAt` timestamp can become `PublicContentDocument`.

The projection omits editorial lifecycle fields such as draft/scheduled/archive state and preserves only the public version, locale, fields and optional authoritative source reference.

Draft, preview, scheduled and archived records never project publicly.

## Locale selection

The resolver applies this deterministic order:

1. exact preferred locale;
2. matching preferred base language;
3. exact configured fallback locale;
4. matching fallback base language.

Within the same locale priority, the highest version and latest publication win.

This gives browser/content adapters a single cross-feature locale rule without duplicating fallback logic.

## Offline-safe snapshot

The snapshot may include only these content kinds:

- destination
- category
- place
- media
- tour
- translation
- seo

It deliberately excludes:

- event, because event truth is time-sensitive;
- offer_reference, because Commerce/Ordering remains authoritative.

Only published content enters the snapshot. Snapshot generation and parsing also reject any document whose `publishedAt` is later than the snapshot `generatedAt`, preventing future editorial content from leaking through malformed or prematurely generated snapshots.

Snapshots are versioned, destination-bound and include explicit `generatedAt` / `expiresAt` timestamps. Consumers must treat an expired snapshot as stale and must not elevate it to transactional authority.

## Boundary

This is a portable content contract.

It does not yet claim:

- durable CMS storage;
- CDN/media transcoding;
- Service Worker persistence of JSON;
- production cache invalidation;
- admin/editor UI;
- scheduler worker.

Those are adapter/infrastructure concerns. Commerce, Payment, Ticketing and reservation state remain network/server-authoritative.

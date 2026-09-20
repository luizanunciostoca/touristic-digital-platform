# Chat 7 — Content Browser Cache Evidence

## Scope

This wave connects the public/offline Content projection to a browser-safe cache adapter without inventing a production CMS endpoint.

## Validation first

Every network or cached payload is parsed through `parseOfflineContentSnapshot`.

The browser never trusts raw JSON from:

- Cache Storage;
- an injected network source;
- a previous browser session.

Malformed content, wrong destination ids, duplicate document identities, nested unsafe fields, `event` and `offer_reference` are rejected by the canonical projection contract before use.

## Loading policy

The adapter applies this order:

1. fetch injected network snapshot;
2. require correct destination + fresh expiry;
3. persist only a validated fresh snapshot;
4. otherwise use a validated fresh cache;
5. if only an expired validated cache exists, return it explicitly as `stale`;
6. otherwise return `unavailable`.

Stale content is never reported as fresh. Presentation code must visibly handle the stale state if it chooses to render it.

## Authority boundary

The offline snapshot contains only editorial/static kinds approved by the Content projection.

It cannot contain:

- event truth;
- offers;
- prices;
- payment state;
- reservation state;
- ticket state;
- checkout state.

The cache is therefore presentation-only and cannot complete or authorize a transaction.

## Endpoint boundary

This adapter intentionally accepts an injected `fetchSnapshot` function.

No CMS URL is hardcoded because the production public-content service/storage contract has not yet been selected or deployed. Once that adapter exists, it can plug into this loader without changing the offline validation boundary.

## Persistence

Browser persistence uses a destination-scoped, versioned Cache Storage key.

Storage errors are best-effort and cannot break the application runtime. Cache Storage open/read/write/delete rejection is contained at the adapter boundary, and a valid network snapshot remains usable even when persistence is unavailable.

## Status

Browser public/offline content cache adapter: IMPLEMENTED.

Production CMS source endpoint/provider: NOT CLAIMED.

Transactional offline authority: PROHIBITED.

## Canonical browser storage

The implementation uses asynchronous Cache Storage under the versioned namespace `morro-digital-content-v1`.

This avoids synchronous Web Storage quota/latency constraints for destination snapshots. Cached responses are still parsed as untrusted JSON and revalidated through `parseOfflineContentSnapshot` on every read.

The network-first loader preserves an expired snapshot only as an explicit `stale: true` fallback. It never reports stale data as current authority.

# Chat 7 — PWA / Offline Foundation Evidence

## Scope

This change materializes a conservative Progressive Web App foundation for the public Morro Digital shell.

It intentionally separates offline presentation from server authority.

## Implemented

- web app manifest with standalone display metadata;
- 192×192 and 512×512 install icons;
- root-scope Service Worker;
- offline fallback document;
- public-static stale-while-revalidate cache;
- root navigation network-first behavior;
- explicit Service Worker update lifecycle;
- online/offline browser state events;
- real browser recovery proof from offline back to online;
- browser proof that non-GET server mutations remain unavailable offline;
- old-cache cleanup on activation;
- automated contract coverage.

## Authority boundary

The Service Worker never intercepts non-GET mutations.

These paths are explicitly network-only:

- `/api/*`
- `/runtime-config.js`
- `/healthz`
- `/readyz`

This means Payment, Ordering, Reservation, Ticketing, CRM, Auth, Assistant provider calls and every other API remain server-authoritative.

The offline layer cannot approve a payment, issue a ticket, confirm a reservation, replay a mutation or replace readiness.

## Cache scope

Caching is restricted to the public application shell and the same-origin browser modules needed by the public experience.

Cross-origin Mapbox, Leaflet, font and provider resources are not promoted into offline authority by this Service Worker.

The fallback page clearly states that transactions and server-authoritative operations require reconnection.

## Update strategy

A waiting worker dispatches `morro:pwa-update-available`.

The browser exposes `window.__MORRO_PWA__.applyUpdate()` to allow the product surface to explicitly activate a waiting version. The worker does not silently force an update during an active user session.

When a new controller takes ownership, the page reloads once so runtime assets remain coherent.

## Network state

The registration layer updates `data-network-state` and dispatches `morro:network-state-changed` with `online` or `offline`.

The Assistant already consumes this event and presents contextual `offline` and `online_restored` states. The browser contract now proves the real transition from offline mode back to online network authority rather than only dispatching synthetic lifecycle events.

## Not claimed by this PR

- offline payment authority;
- offline checkout completion;
- offline Ticketing authority beyond the separate Ticketing domain contracts;
- full destination/place/tour data persistence;
- background sync of mutations;
- push notifications.

Those remain separate product capabilities and are not required for the conservative PWA shell authority implemented here. Physical-device certification is not a completion requirement for this PWA acceptance.

## Status

PWA install/offline shell foundation: IMPLEMENTED.

Full offline content product: PARTIAL.

Production PWA certification: governed by exact-head automated browser evidence. The acceptance requires installability, offline shell availability, API/non-GET authority boundaries and offline-to-online recovery; it does not require a physical-device matrix.

## Install icon assets

The manifest uses dedicated 192×192 and 512×512 PNG assets committed as binary blobs. They are presentation-only assets and contain no executable content or external dependency.

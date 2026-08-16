# Ticketing / Reservations — Capability Matrix

## Baseline

`FEATURE-0011` is a V2-native capability. The Feature Registry declares `legacySources: []`, and the frozen V1 baseline used by the migration program has no authoritative Ticketing/Reservations domain to reproduce. Therefore the V1 column is `N/A` for Ticketing-specific behavior; this matrix measures completeness of the intended V2 capability rather than pretending parity with a legacy implementation that did not exist.

Canonical V2 sequence:

```text
Catalog / Inventory
  -> temporary Reservation hold
  -> canonical Ordering checkout
  -> canonical Financial payment authority
  -> Reservation confirmation
  -> Ticket issuance
  -> QR / human code
  -> validation / use / cancellation
  -> offline sync where applicable
```

Ticketing must never create a parallel checkout or treat browser/provider redirect state as payment authority.

## Matrix after M150

| Capability | V1 | V2 status | Evidence / boundary |
|---|---|---|---|
| Ticket/product catalog identity | N/A | PASS | M150 `TicketInventoryOffer`; destination + product reference |
| Server-authoritative price snapshot | N/A | PASS | M150 inventory price/pricingVersion copied into hold under lock |
| Sale/event availability windows | N/A | PASS | M150 validated sale/start/end windows |
| Capacity / inventory | N/A | PASS | M150 durable `ticketing_inventory` |
| Temporary reservation hold | N/A | PASS | M150 durable `held` reservation |
| Hold expiration | N/A | PASS | M150 stale-hold sweep in locked inventory transaction |
| Reservation cancellation | N/A | PASS | M150 cancellation releases capacity |
| Reservation confirmation | N/A | PARTIAL | M150 fail-closed authority port exists; concrete canonical Ordering/Payments adapter remains open |
| Reservation idempotency | N/A | PASS | unique request key + exact replay contract |
| Overselling protection | N/A | PASS | inventory row lock + concurrent MySQL capacity-1 proof |
| Reservation audit | N/A | PASS | append-only `ticketing_reservation_events` |
| Reservation -> Order relation | N/A | PARTIAL | confirmed reservation persists canonical `OrderId`; Ticketing-specific canonical order source contract remains Ordering-owned/open |
| Reservation -> Payment relation | N/A | PARTIAL | confirmed reservation persists canonical `PaymentId`; concrete Financial confirmation adapter remains open |
| Backend payment as fulfillment authority | N/A | PASS boundary / PARTIAL integration | M147 issuance rejects unconfirmed/mismatched persisted payment; M150 confirmation cannot bypass authority port |
| Ticket issuance after payment | N/A | PASS | M147 application service + financial consistency checks |
| Ticket -> Order -> Payment relation | N/A | PASS | M147 durable ticket fields and issuance checks |
| Signed QR payload without PII | N/A | PASS | M147 HMAC QR contract |
| Human ticket code | N/A | PASS | M147 deterministic hashed code |
| Online validation/check-in | N/A | PASS backend | M147 lifecycle + M148 atomic transaction boundary |
| Check-in replay safety | N/A | PASS | M148 deterministic attempt identity and exact replay |
| Concurrent check-in safety | N/A | PASS | M148 row lock and stale-transition failure proof |
| Offline check-in envelope/sync | N/A | PASS backend | M147 signed envelope + M148 atomic sync |
| Public authenticated Ticketing HTTP API | N/A | GAP | intentionally not exposed yet |
| Ticket/Reservation browser UI | N/A | GAP | intentionally not exposed yet |
| QR visual image rendering | N/A | GAP | payload exists; image rendering not implemented |
| Offline device credential provisioning | N/A | GAP | server signing material is not exposed to devices/browser |
| Refund -> reservation/ticket cancellation orchestration | N/A | GAP | requires Financial-owned refund authority contract |
| Reservation -> ticket fulfillment orchestration | N/A | GAP | issuance primitive exists, but automatic fulfillment bridge after authoritative reservation confirmation remains open |
| Release/rollback activation | N/A | GAP | FEATURE-0011 remains `migrating` |

## Status summary

This matrix deliberately does not promote `FEATURE-0011` to `equivalent` or `released`.

M147 closed the issuance/QR/check-in foundation. M148 closed transactional check-in consistency. M150 closes catalog, capacity, holds, expiry, cancellation, reservation audit and overselling prevention. The highest-priority remaining integration gap is the canonical bridge:

```text
confirmed reservation
  <-> Ticketing-aware Ordering contract
  <-> persisted Financial confirmation
  -> ticket fulfillment
```

That bridge must be implemented without widening Ticketing into a second Ordering/Payments system.

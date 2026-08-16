# Ticketing / Reservations — Capability Matrix

## Baseline

`FEATURE-0011` is a V2-native capability. The Feature Registry declares `legacySources: []`, and the frozen V1 baseline used by the migration program has no authoritative Ticketing/Reservations domain to reproduce. Therefore the V1 column is `N/A` for Ticketing-specific behavior; this matrix measures completeness of the intended V2 capability rather than pretending parity with a legacy implementation that did not exist.

Canonical V2 sequence:

```text
Catalog / Inventory
  -> temporary Reservation hold
  -> canonical Ordering Order + Financial Payment
  -> persisted verified Financial payment outcome
  -> authoritative Reservation confirmation
  -> Ticket fulfillment
  -> QR / human code
  -> validation / use / cancellation
  -> offline sync where applicable
```

Ticketing must never create a parallel checkout, create an independent financial price, or treat browser/provider redirect state as payment authority.

## Matrix after M150 + canonical Ordering/Financial fulfillment bridge candidate

| Capability                                              | V1  | V2 status | Evidence / boundary |
| ------------------------------------------------------- | --- | --------- | ------------------- |
| Ticket/product catalog identity                         | N/A | PASS | M150 `TicketInventoryOffer`; destination + product reference |
| Server-authoritative price snapshot                     | N/A | PASS | M150 inventory price/pricingVersion copied into hold under lock |
| Sale/event availability windows                         | N/A | PASS | M150 validated sale/start/end windows |
| Capacity / inventory                                    | N/A | PASS | M150 durable `ticketing_inventory` |
| Temporary reservation hold                              | N/A | PASS | M150 durable `held` reservation |
| Hold expiration                                         | N/A | PASS | M150 stale-hold sweep inside locked inventory transaction |
| Reservation cancellation                                | N/A | PASS | M150 cancellation releases capacity |
| Reservation confirmation                                | N/A | PASS backend | Concrete fail-closed adapter requires canonical Ordering binding, `Order.payment_confirmed`, persisted Financial `Payment.confirmed`, and persisted approved `VerifiedPaymentResult` |
| Reservation idempotency                                 | N/A | PASS | unique request key + exact replay contract |
| Overselling protection                                  | N/A | PASS | inventory row lock + concurrent MySQL capacity-1 proof |
| Reservation audit                                       | N/A | PASS | append-only `ticketing_reservation_events` |
| Reservation -> canonical Order relation                 | N/A | PARTIAL | Ordering-owned immutable reservation-to-Order binding is durable and replay-safe; production command/handoff that creates the canonical Order for a reservation is still not wired because the existing public checkout handoff remains Business-specific |
| Reservation -> Payment relation                         | N/A | PASS backend | concrete adapter verifies persisted Financial Payment subject/order/amount plus approved persisted verified outcome before confirmation |
| Backend payment as fulfillment authority                | N/A | PASS | confirmation cannot derive from browser/redirect; authoritative Financial evidence is re-read from persistence |
| Ticket issuance after payment                           | N/A | PASS | M147 issuance + canonical order/payment consistency checks |
| Ticket -> Order -> Payment relation                     | N/A | PASS | M147 durable ticket fields and issuance checks |
| Signed QR payload without PII                           | N/A | PASS | M147 HMAC QR contract; signing secret remains server-side |
| Human ticket code                                       | N/A | PASS | M147 deterministic hashed code |
| Online validation/check-in                              | N/A | PASS backend | M147 lifecycle + M148 atomic transaction boundary |
| Check-in replay safety                                  | N/A | PASS | M148 deterministic attempt identity and exact replay |
| Concurrent check-in safety                              | N/A | PASS | M148 row lock and stale-transition failure proof |
| Offline check-in envelope/sync                          | N/A | PASS backend | M147 signed envelope + M148 atomic sync |
| Public authenticated Ticketing HTTP API                 | N/A | GAP | intentionally not exposed yet |
| Ticket/Reservation browser UI                           | N/A | GAP | intentionally not exposed yet |
| QR visual image rendering                               | N/A | GAP | signed payload exists; visual QR rendering not implemented |
| Offline device credential provisioning                  | N/A | GAP | server signing material is not exposed; a scoped device credential provisioning contract is still required |
| Refund -> reservation/ticket cancellation orchestration | N/A | GAP | must be driven only by a persisted verified Financial refund outcome |
| Reservation -> ticket fulfillment orchestration         | N/A | PARTIAL | replay-safe fulfillment service and approved `VerifiedPaymentResult` handler exist; production runtime delivery/outbox wiring of the persisted Financial outcome into the handler remains open |
| Release/rollback activation                             | N/A | GAP | FEATURE-0011 remains `migrating`; activation/rollback evidence is absent |

## Completeness summary

Strict row count for this candidate state:

- PASS: 21
- PARTIAL: 2
- GAP: 6
- Total: 29

A backend primitive marked `PASS` does not imply browser/public exposure; those surfaces are tracked separately as GAP rows.

## Closed structural boundary

The bridge candidate now enforces:

```text
Reservation
  -> Ordering-owned immutable reservation/Order binding
  -> canonical Order
  -> persisted Financial Payment
  -> persisted approved VerifiedPaymentResult
  -> authoritative Reservation confirmation
  -> deterministic/replay-safe Ticket issuance
```

The verified payment handler derives reservation/order/payment identities from the persisted Financial result and Ordering binding. The confirmation authority then re-reads canonical Order, Payment, and verified Financial result from persistence. A browser redirect, caller-provided `paymentId`, or a bare `Payment.status = confirmed` is insufficient authority.

## Remaining structural work

The existing public Ordering checkout contract is intentionally Business-specific. This bridge does not reuse that handoff by pretending a reservation is a Business checkout and does not add a Ticketing checkout. The remaining Ordering-side production integration is a canonical reservation-to-Order command/handoff owned by Ordering that persists the same reservation snapshot and then creates/links the Financial payment through existing Financial authority.

After that runtime handoff exists, the persisted verified Financial outcome still needs durable delivery into the Ticketing fulfillment handler. Refund cancellation must follow the symmetric rule: only a persisted verified Financial refund outcome may cancel the reservation/ticket.

`FEATURE-0011` must remain `migrating` until all applicable PARTIAL/GAP rows are closed and release/rollback evidence is present.

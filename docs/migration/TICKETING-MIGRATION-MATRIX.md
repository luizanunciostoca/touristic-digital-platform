# Ticketing / Reservations — Capability Matrix

## Baseline

`FEATURE-0011` is a V2-native capability. The Feature Registry declares `legacySources: []`, and the frozen V1 baseline used by the migration program has no authoritative Ticketing/Reservations domain to reproduce. Therefore the V1 column is `N/A` for Ticketing-specific behavior; this matrix measures completeness of the intended V2 capability rather than pretending parity with a legacy implementation that did not exist.

Canonical V2 sequence:

```text
Catalog / Inventory
  -> temporary Reservation hold
  -> canonical Ordering Order
  -> canonical Financial Payment / existing Payments checkout
  -> persisted verified Financial payment outcome
  -> authoritative Reservation confirmation
  -> durable Ticket fulfillment
  -> QR / human code
  -> validation / use / cancellation
  -> offline sync where applicable
```

Ticketing never creates a parallel checkout, never creates an independent financial price, and never treats browser/provider redirect state as payment authority.

## Strict implementation candidate after FEATURE-0011 closure

| Capability                                              | V1  | V2 status | Evidence / boundary |
| ------------------------------------------------------- | --- | --------- | ------------------- |
| Ticket/product catalog identity                         | N/A | PASS | M150 `TicketInventoryOffer`; destination + product reference |
| Server-authoritative price snapshot                     | N/A | PASS | M150 inventory price/pricingVersion copied into hold under lock; browser price is not accepted |
| Sale/event availability windows                         | N/A | PASS | M150 validated sale/start/end windows |
| Capacity / inventory                                    | N/A | PASS | M150 durable `ticketing_inventory` |
| Temporary reservation hold                              | N/A | PASS | M150 durable `held` reservation |
| Hold expiration                                         | N/A | PASS | M150 stale-hold sweep inside locked inventory transaction |
| Reservation cancellation                                | N/A | PASS | public cancellation is limited to held reservations; M150 cancellation releases capacity |
| Reservation confirmation                                | N/A | PASS | fail-closed authority requires canonical Ordering binding, `Order.payment_confirmed`, persisted `Payment.confirmed`, and persisted approved `VerifiedPaymentResult` |
| Reservation idempotency                                 | N/A | PASS | unique request key + deterministic reservation identity + exact replay contract |
| Overselling protection                                  | N/A | PASS | inventory row lock + concurrent MySQL capacity proof |
| Reservation audit                                       | N/A | PASS | append-only `ticketing_reservation_events`; refund cancellation also records authoritative cancellation |
| Reservation -> canonical Order relation                 | N/A | PASS | Ordering-owned `TicketingReservationOrderApplicationService` creates/replays `source_kind=ticketing_reservation` Order and immutable one-to-one binding from the frozen Reservation snapshot |
| Reservation -> Payment relation                         | N/A | PASS | Ticketing checkout handoff uses canonical `PaymentIdempotencyKey(order.id)`, existing Financial Payment repositories, and the existing Payments provider/status contract |
| Backend payment as fulfillment authority                | N/A | PASS | confirmation cannot derive from browser/redirect; authoritative persisted Financial evidence is re-read |
| Ticket issuance after payment                           | N/A | PASS | M147 issuance runs only after authoritative reservation confirmation |
| Ticket -> Order -> Payment relation                     | N/A | PASS | durable ticket fields, M147 issuance checks, reservation binding and canonical payment subject |
| Signed QR payload without PII                           | N/A | PASS | M147 HMAC QR payload contains Ticket identity only; signing secret stays server-side |
| Human ticket code                                       | N/A | PASS | M147 deterministic hashed code |
| Online validation/check-in                              | N/A | PASS | authenticated operator route delegates to M147 lifecycle + M148 atomic transaction boundary |
| Check-in replay safety                                  | N/A | PASS | M148 deterministic attempt identity and exact replay |
| Concurrent check-in safety                              | N/A | PASS | M148 row lock and stale-transition failure proof |
| Offline check-in envelope/sync                          | N/A | PASS | M147/M148 atomic sync plus server-side scoped-device adapter |
| Public authenticated Ticketing HTTP API                 | N/A | PASS | `/api/ticketing/v1`; shared Dashboard auth/CSRF/origin boundary; ownership checks; admin-only device provisioning; feature flag fail-closed |
| Ticket/Reservation browser UI                           | N/A | PASS | `/tickets.html` lists live inventory, creates holds, enters canonical Payments checkout, resumes verified status, and renders fulfilled tickets |
| QR visual image rendering                               | N/A | PASS | deterministic standards-based QR SVG is rendered server-side from the PII-free signed payload; browser receives no signing secret |
| Offline device credential provisioning                  | N/A | PASS | short-lived HMAC credential scoped to `deviceId + destinationId`, max 24h; per-device envelope key is derived without exposing QR/master signing material |
| Refund -> reservation/ticket cancellation orchestration | N/A | PASS | only matching persisted `Payment.refunded` + persisted verified refunded result can enter one Ticketing transaction; all tickets are locked/prevalidated and any `used` ticket aborts before updates |
| Reservation -> ticket fulfillment orchestration         | N/A | PASS | persisted Financial results are read through an ordered feed; durable monotonic Ticketing cursor advances only after replay-safe fulfillment/refund handler completion |
| Release/rollback activation contract                    | N/A | PASS | exact `TICKETING_FEATURE_ENABLED=true` opt-in, dark-deploy procedure, controlled activation smoke, operational disable-first rollback, and destructive rollback guards are documented in the permanent runbook |

## Completeness summary

Strict implementation-candidate row count:

- PASS: 29
- PARTIAL: 0
- GAP: 0
- Total: 29

This count means the repository contains an implementation candidate for every intended V2 capability. It does **not** by itself promote FEATURE-0011 out of `migrating` and does not substitute for exact-head CI or controlled release evidence.

## Canonical authority chain

The candidate enforces:

```text
Authenticated browser
  -> Ticketing inventory / hold
  -> Ordering-owned canonical Order + immutable Reservation binding
  -> existing Payments checkout boundary
  -> canonical Financial Payment
  -> signed provider webhook / persisted verified Financial result
  -> durable Financial-result feed + Ticketing cursor
  -> authoritative Reservation confirmation
  -> deterministic/replay-safe Ticket issuance
  -> server-rendered PII-free signed QR
```

The browser receives an opaque Payments status capability and may use the provider redirect only to resume polling. It cannot confirm a Reservation or issue a Ticket. The backend confirmation adapter re-reads the canonical Order, Payment, immutable binding and persisted verified Financial result before fulfillment.

Refund follows the symmetric authority chain:

```text
persisted verified Financial refund
  -> Payment.refunded + exact verified result re-read
  -> Reservation/Order/Payment identity re-validation
  -> Ticketing DB transaction
  -> lock Reservation + all Order tickets
  -> reject any used Ticket before mutation
  -> cancel Reservation + eligible Tickets atomically
```

## Offline/security boundary

The QR signing secret remains backend-only. Offline operator devices receive a different short-lived credential scoped to a device and destination. That credential derives only the envelope-signing key for the device. During sync the backend validates credential scope/expiry and the device envelope, verifies the Ticket destination, then delegates to the existing M147/M148 transaction using backend authority.

Holder name/email/document are stored server-side for fulfillment/customer display and never placed in the QR payload.

## Runtime/release boundary

`apps/morro-digital-platform/tooling/ticketing-api.mjs` composes the canonical Ticketing, Ordering and Financial repositories. Ticketing handles only `/api/ticketing/v1/**` plus the specialized creation path `/api/payments/v1/checkouts/ticketing-reservations`; generic Payments status, provider webhook and Financial authority remain in the existing Payments runtime.

`TICKETING_FEATURE_ENABLED` is fail-closed. The permanent release runbook requires a disabled dark deploy, current-main-integrated checks, controlled activation smoke and disable-first rollback. Additive schemas are retained during normal rollback so financial/ticket history is never destroyed.

## Promotion state

FEATURE-0011 must remain `migrating` while PR #265 is a draft/unmerged candidate or while exact-head validation/controlled activation evidence is missing. Promotion is coordinator-controlled and requires, on the same current-main-integrated SHA:

1. this strict matrix at `29 PASS / 0 PARTIAL / 0 GAP`;
2. Quality Gate green;
3. Ticketing M147 and M148 permanent contracts green;
4. MySQL capacity/oversell/replay/expiry/cancellation/binding proofs green;
5. authenticated API/browser/QR/offline/refund/runtime checks green;
6. dark-deploy and rollback-disable evidence;
7. Feature Registry and `MASTER-MIGRATION-TRACKER.md` updated only as part of that controlled promotion.

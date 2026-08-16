# Ticketing / FEATURE-0011 — Canonical Ordering + Financial Fulfillment Evidence

## Scope

This evidence covers the FEATURE-0011 implementation candidate from Ticketing Reservation through canonical Ordering and Financial authority, automatic fulfillment/refund processing, authenticated product surfaces, QR/offline operation, and controlled release/rollback.

FEATURE-0011 is V2-native. This document does not claim legacy equivalence and does not create a second checkout, a second Ordering domain, a Ticketing-owned Payment, or browser/provider payment authority.

## Canonical ownership

- Ticketing owns inventory, capacity, holds, Reservation state, Ticket issuance and check-in.
- Ordering owns the canonical Order plus the immutable Reservation -> Order binding.
- Financial owns Payment state and persisted provider-verification results.
- Payments remains the checkout/provider/webhook/status boundary.
- The browser owns no financial truth and receives no QR/offline master signing secret.

## Reservation -> canonical Order

`@touristic/ordering/ticketing-reservation` provides `TicketingReservationOrderApplicationService`.

It creates/replays an Ordering-owned Order with:

- `source.kind = ticketing_reservation`;
- source reference = canonical Reservation reference;
- request key derived from the Reservation;
- plan/reference fields derived from the server-side Reservation product snapshot;
- amount/currency/pricingVersion captured from the Reservation snapshot;
- initial lifecycle `pending_payment`.

Ordering persists `ordering_ticketing_reservation_bindings` with a unique `order_id` FK and exact immutable replay checks. Conflicting reservation/order/product/amount/version rebinding fails closed.

## Canonical Payments handoff

`@touristic/ordering/ticketing-checkout` and `TicketingCheckoutHttpTransport` extend the existing Payments boundary without adding `/api/ticketing/checkout`.

The creation path is:

```text
POST /api/payments/v1/checkouts/ticketing-reservations
```

It uses:

- existing `PaymentIdempotencyKey(order.id)`;
- existing Financial Payment and idempotency repositories;
- existing checkout access/status capability model;
- existing return URL policy and rate limiting;
- existing Financial checkout provider adapter;
- generic existing `/api/payments/v1/checkouts/:orderId` status route after creation.

The authorization adapter re-reads the Reservation and server-side holder profile and requires exact ownership/customer agreement before permitting the handoff.

## Persisted Financial confirmation authority

`createOrderingFinancialReservationConfirmationAuthority` confirms a Reservation only when all of the following agree:

1. Ordering-owned Reservation/Order binding;
2. canonical Order is `payment_confirmed`;
3. persisted Financial Payment is `confirmed`;
4. Payment subject/order and amount match;
5. persisted approved `VerifiedPaymentResult` exists for that Payment/order;
6. Reservation product, quantity, amount and pricing version match the immutable binding/Order snapshot.

A caller-provided payment id, provider redirect, provider return URL or a bare `Payment.status = confirmed` is insufficient.

## Durable automatic fulfillment

Financial exposes a read-only ordered feed over persisted verified payment results. Ticketing persists a monotonic cursor.

`createVerifiedFinancialResultProcessor` processes results at least once and advances the cursor only after the matching handler completes. A crash before cursor advancement causes a safe replay instead of a lost fulfillment.

For approved/confirmed results:

1. `createVerifiedPaymentTicketFulfillmentHandler` resolves the Ordering binding from the result's canonical Order identity;
2. `createTicketReservationFulfillmentService` confirms a held Reservation through the fail-closed authority or exact-replays an already confirmed Reservation;
3. holder display data is resolved server-side;
4. M147 issues the deterministic/replay-safe Ticket.

`apps/morro-digital-platform/tooling/ticketing-api.mjs` drains the persisted Financial feed at startup and on a bounded non-overlapping interval while Ticketing is enabled.

## Verified refund -> atomic cancellation

Refund cancellation accepts only a matching persisted Financial state:

- incoming result is `kind=refunded`, `paymentStatus=refunded`;
- canonical Payment is persisted as `refunded`;
- Payment subject is the bound Order;
- persisted verified refunded result exactly matches;
- Reservation still carries the same Order/Payment authority.

`MySqlRefundedReservationCancellationRepository.cancelConfirmedAfterRefund` then opens one Ticketing transaction and:

1. locks the inventory/reservation authority;
2. locks all Tickets for the Order;
3. validates every Ticket belongs to the verified Payment;
4. rejects any `used` Ticket before the first mutation;
5. transitions the confirmed Reservation to refunded-cancelled while preserving `orderId`, `paymentId` and `confirmedAt`;
6. cancels issued/validated Tickets replay-safely;
7. appends Reservation cancellation audit;
8. commits Reservation and Ticket changes together.

Any failure rolls the Ticketing transaction back.

## Authenticated HTTP API

`TicketingPublicHttpTransport` exposes `/api/ticketing/v1` behind the shared Dashboard session/CSRF/origin authority.

Implemented routes cover:

- authenticated inventory + live availability;
- authenticated own-Reservation listing/read;
- idempotent Reservation creation from inventory + quantity + holder profile only;
- held-Reservation cancellation;
- fulfilled Ticket retrieval;
- authenticated online QR check-in;
- admin-only offline device provisioning;
- device-credential authenticated offline sync.

The browser is not allowed to provide financial price, Order authority, Payment authority or payment confirmation.

## Browser Reservation/Ticket surface

`/tickets.html` plus `ticketing.js`/`ticketing.css` provide the focused Ticketing flow:

1. require the shared authenticated session;
2. list server-authoritative inventory/availability;
3. create an idempotent hold;
4. receive the server-created canonical Ordering checkout descriptor;
5. enter the existing Payments checkout;
6. retain only the opaque Payments status capability in `sessionStorage`;
7. after provider return, poll canonical Payments status;
8. require both `CONFIRMED` and verified-payment evidence before waiting for Ticketing fulfillment;
9. display the server-rendered Ticket QR/human code only after fulfillment.

A provider redirect alone never changes Reservation/Ticket state.

## Visual QR without PII

M147 QR payload remains `ticket identity + HMAC`; holder name, email, document, price and Payment data are absent.

`@touristic/ticketing/qr-svg` renders the signed payload server-side into a deterministic QR SVG. The browser receives the SVG only after an owned confirmed Reservation resolves to its fulfilled Ticket. QR signing material never enters browser assets.

## Scoped offline device credentials

`@touristic/ticketing` provisions short-lived `tdc.v1` credentials:

- device-scoped;
- destination-scoped;
- maximum 24-hour TTL;
- HMAC authenticated with a server-only provisioning master secret;
- derives a per-device envelope key without revealing either the provisioning master or QR signing secret;
- timing-safe signature comparison;
- expiry and tamper rejection.

`createTicketOfflineDeviceSyncService` verifies credential scope and envelope signature, re-reads the Ticket destination, then delegates to the existing M147/M148 transactional sync under backend authority.

## Release / rollback

`docs/runbooks/TICKETING-FEATURE-0011-RELEASE.md` defines:

- `TICKETING_FEATURE_ENABLED` exact opt-in and fail-closed disabled behavior;
- additive migration order;
- dark deployment before activation;
- reservation/order/payment/fulfillment/check-in/offline/refund smoke sequence;
- durable cursor observation;
- disable-first operational rollback;
- prohibition on destructive rollback while Ticketing financial history exists.

Normal rollback retains canonical Ordering, Financial and Ticketing history.

## Validation contracts

The Ticketing M147 permanent workflow is extended rather than creating a parallel workflow. It covers:

- Ticketing package lint/typecheck/tests;
- Ticketing server lint/typecheck/tests;
- Ordering package/server lint/typecheck;
- Ordering Ticketing-binding MySQL proof;
- shared auth-browser lint/typecheck;
- syntax checks for Ticketing runtime, platform dev server and browser Ticketing JS;
- build of the Ticketing server dependency graph.

M148 remains the permanent transactional check-in proof. Existing Payments persistence/settlement workflows continue to validate the canonical Financial side of the chain.

During construction, earlier bridge heads exposed and received fixes for contextual-typing lint failures, invalid Financial fixtures, Ordering FK teardown ordering and MySQL readiness. M147/M148 were green on an earlier bridge head after those corrections. Those historical results are not treated as proof for later heads.

At the time this evidence was updated, GitHub Actions had not emitted new pull-request runs for the latest rapidly advancing branch heads. Therefore exact-head CI must still be re-read after final current-main reconciliation; this document intentionally does not claim a green exact head before GitHub reports it.

## Strict candidate matrix and promotion rule

The implementation candidate now maps to `29 PASS / 0 PARTIAL / 0 GAP` in `TICKETING-MIGRATION-MATRIX.md`.

That implementation count is **not** a release-state mutation. FEATURE-0011 remains `migrating` while PR #265 is draft/unmerged or while exact-head validation/dark-deploy activation evidence is absent.

The coordinator may promote only after the same current-main-integrated SHA has all required Quality, M147, M148, MySQL, security/runtime checks and controlled release evidence, then updates Feature Registry and the MASTER migration tracker as part of promotion.

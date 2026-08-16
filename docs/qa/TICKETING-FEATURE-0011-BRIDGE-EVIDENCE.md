# Ticketing / FEATURE-0011 — Ordering + Financial Fulfillment Bridge Evidence

## Scope

This evidence covers the structural bridge from a Ticketing reservation to canonical Ordering/Financial authority and deterministic Ticket fulfillment. It is intentionally stacked on Ticketing M150 / PR #253.

It does **not** create a Ticketing checkout, move payment authority into Ticketing, duplicate Ordering, expose Financial signing/provider credentials, or derive payment confirmation from browser/provider redirects.

## Implemented boundaries

### Ordering-owned reservation / Order binding

`@touristic/ordering/ticketing-reservation` defines an immutable durable binding:

- reservation reference;
- canonical `OrderId`;
- product reference;
- quantity;
- total monetary snapshot;
- pricing version;
- bound timestamp.

`ordering_ticketing_reservation_bindings` is persisted by Ordering and has:

- reservation primary key;
- unique `order_id`;
- FK to `ordering_orders`;
- safe quantity/amount constraints;
- exact replay semantics;
- fail-closed immutable conflict detection.

The binding cannot create or price an Order. It only records the canonical relation owned by Ordering.

### Persisted Financial confirmation authority

`createOrderingFinancialReservationConfirmationAuthority` confirms a reservation only when all of the following agree:

1. the Ordering-owned reservation/Order binding;
2. the canonical Order in `payment_confirmed`;
3. the persisted Financial Payment in `confirmed`;
4. Payment subject/order and amount;
5. the persisted approved `VerifiedPaymentResult` for that Payment/order;
6. reservation product, quantity, amount and pricing version.

A caller-provided `paymentId`, browser redirect, provider return URL, or a bare `Payment.status = confirmed` is not sufficient.

### Automatic fulfillment component

`createVerifiedPaymentTicketFulfillmentHandler` accepts only an approved/confirmed Financial verified result, resolves the reservation through Ordering, then invokes the replay-safe reservation fulfillment service.

`createTicketReservationFulfillmentService`:

- confirms a held reservation through the fail-closed authority;
- exact-replays an already confirmed reservation;
- resolves holder display data server-side;
- computes the total only from the immutable reservation snapshot;
- delegates issuance to the existing M147 service;
- preserves deterministic/replay-safe Ticket issuance and the existing PII-free signed QR contract.

## Tests added

- Ordering binding normalization and immutable contract tests;
- MySQL 8.4 Ordering binding persistence/replay/conflict integration test;
- Financial authority positive path;
- negative path: confirmed Payment without persisted verified result;
- negative path: divergent reservation/product snapshot;
- confirmed reservation fulfillment replay;
- held reservation confirmation before issuance;
- verified Financial result identity derivation;
- non-approved Financial terminal result ignored.

The permanent Ticketing M147 workflow is extended to run the Ordering binding MySQL integration proof instead of creating a parallel CI workflow.

## Explicit remaining integration work

This candidate does not claim FEATURE-0011 completion. The following remain open:

- Ordering-owned production command/handoff that creates the canonical Order for a Ticketing reservation without reusing the Business-specific public checkout handoff;
- durable production delivery/outbox wiring from persisted approved Financial outcome to the fulfillment handler;
- verified Financial refund outcome -> reservation/ticket cancellation orchestration;
- public authenticated Ticketing HTTP API;
- Reservation/Ticket browser UI;
- visual QR rendering;
- scoped offline-device credential provisioning;
- release/rollback activation evidence.

## Promotion rule

This bridge must not be merged before PR #253. The coordinator should first promote M150, then rebase/revalidate this stacked PR against the promoted `main`, require permanent Quality + Ticketing M147 + Ticketing M148 + MySQL checks, and only then consider promotion.

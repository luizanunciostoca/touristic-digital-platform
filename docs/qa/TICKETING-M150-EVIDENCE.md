# M150 — Ticketing Reservation Capacity and Holds

## Objective

Close the first operational gap left after M147/M148: Ticketing had financially guarded issuance and concurrency-safe check-in, but no authoritative catalog inventory or temporary reservation boundary before payment. M150 adds that boundary without creating a second checkout and without moving Ordering or Payments authority into Ticketing.

`FEATURE-0011` / `MIG-0017` remain `migrating`. This milestone is backend foundation and does not claim browser, HTTP, visual or release equivalence.

## Scope delivered

- Server-authoritative Ticketing inventory offers with destination/product identity, sale window, event window, unit price, pricing version, capacity and per-reservation limit.
- Availability derived from durable capacity minus active `held` and `confirmed` quantities.
- Temporary reservation holds with deterministic request-key idempotency, explicit expiry and immutable inventory/product/price snapshots.
- Reservation lifecycle `held -> confirmed | expired | cancelled`.
- Automatic stale-hold expiration inside the same inventory transaction used for availability and mutations.
- Cancellation releases capacity immediately.
- Confirmation persists `orderId` and `paymentId`, but only behind a backend confirmation-authority port.
- Append-only reservation event evidence for hold, confirmation, expiry and cancellation.
- MySQL row locking on the inventory row so concurrent capacity writers serialize on one authoritative resource.
- Permanent MySQL integration coverage in the existing Ticketing contract instead of another milestone workflow.

## Financial and checkout boundary

M150 does **not** implement checkout, payment intents, webhooks or provider calls.

The browser cannot confirm a reservation. `createTicketReservationApplicationService` requires a `TicketReservationConfirmationAuthorityPort`. A concrete Ordering/Payments adapter must verify, at minimum, that:

1. the persisted order is the order being supplied;
2. the persisted payment belongs to that order;
3. the persisted payment is authoritatively confirmed by Financial, never by a browser callback alone;
4. the order/payment monetary authority matches the reservation snapshot (`unitAmount * quantity`, currency and pricing contract as applicable);
5. the reservation identity/product is the fulfillment subject expected by the order contract.

Until Ordering exposes the appropriate Ticketing order contract, Ticketing keeps this as an explicit fail-closed port rather than inventing a parallel checkout model.

## Price authority

A hold snapshots `unitAmount` and `pricingVersion` from the locked inventory row. Later catalog changes do not mutate a pre-existing hold. This prevents a race in which a buyer reserves one authoritative price but is later confirmed against a different catalog revision.

The browser never supplies the authoritative hold price to persistence.

## Overselling prevention

Every capacity-changing operation locks the same `ticketing_inventory` row with `SELECT ... FOR UPDATE` before reading committed quantity or mutating a reservation.

Within that transaction:

1. stale holds are expired;
2. committed capacity is calculated from `held + confirmed` rows;
3. a new hold is rejected when `committed + requested > capacity`;
4. only then is the hold inserted and audited.

The MySQL integration test runs two distinct holds concurrently against capacity `1` and requires exactly one success and exactly one `TICKETING_INVENTORY_EXHAUSTED` failure. The resulting availability must remain `committed=1 / remaining=0`.

## Idempotency and replay

A reservation request key is bound to one inventory pool:

```text
ticketing:<inventoryId>:<stable-attempt-reference>
```

The database has a unique constraint on `request_key`. Exact replay returns the already persisted reservation and does not append another hold event or consume capacity again. A replay that changes reservation id, inventory, holder or quantity fails closed with `TICKETING_RESERVATION_REPLAY_CONFLICT`.

Confirmed reservation replay is accepted only for the same order/payment identity; divergence fails closed.

## Durable schema

M150 adds:

- `ticketing_inventory` — authoritative inventory/pricing/capacity and sale/event windows;
- `ticketing_reservations` — durable holds and terminal reservation state with price snapshot and order/payment references;
- `ticketing_reservation_events` — append-only audit evidence.

Existing M147 tables for issued tickets, check-ins and offline envelopes are unchanged.

## Executable evidence

Domain tests in `packages/ticketing/src/reservations.test.ts` cover:

- catalog validation;
- availability math;
- request-key inventory binding;
- immutable reservation pricing snapshot;
- hold confirmation/expiry/cancellation invariants;
- invalid windows and cross-inventory requests.

Application tests in `services/ticketing/src/reservation-application-service.test.ts` cover:

- fail-closed confirmation when backend financial authority rejects;
- exact order/payment identity propagation after verification;
- invalid identities rejected before authority invocation;
- expired holds rejected before authority invocation.

MySQL integration in `services/ticketing/src/reservation-mysql-integration.test.ts` covers:

- two concurrent buyers competing for capacity `1` with no oversell;
- exact idempotency replay with one audit event;
- automatic expiry releasing capacity;
- cancellation releasing capacity;
- append-only audit ordering;
- catalog repricing after a hold without mutating the old reservation snapshot;
- confirmation through the backend authority service with durable order/payment references.

The existing `.github/workflows/ticketing-m147-contract.yml` already path-scopes `packages/ticketing/**` and `services/ticketing/**`; its permanent server `test:integration` command now includes both the original M147 persistence suite and M150 reservation MySQL suite.

## Boundaries intentionally left open

M150 does not add:

- public Ticketing HTTP endpoints;
- browser reservation UI;
- catalog/inventory administration API or admin UI;
- another checkout or payment provider integration;
- a Ticketing-specific duplicate of Ordering;
- visual QR rendering;
- device/offline secret provisioning;
- refund-to-cancellation orchestration;
- ticket issuance directly from a reservation;
- a concrete Ordering/Payments confirmation adapter before the canonical Ticketing order contract exists;
- release/rollback activation.

Ticket issuance remains owned by the existing M147 financial issuance guard after authoritative payment. M148 remains the check-in concurrency boundary after issuance.

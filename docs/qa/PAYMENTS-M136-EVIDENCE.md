# PAYMENTS M136 — Ordering / Financial Domain Vocabulary Evidence

## Scope

M136 is the first implementation milestone of `FEATURE-0009` after the M135 baseline.

It introduces framework-independent domain contracts only:

```text
@touristic/ordering
@touristic/financial
```

No payment provider, provider SDK, HTTP endpoint, database adapter, webhook listener, public token surface, browser checkout or real money movement is introduced.

## Base

M135 merge:

`luizidebook/touristic-digital-platform@881b5a2a943f00325b90a9d0f75d7a291d9cbeae`

M135 post-merge Quality Gate:

`#1656 / run 31833108424 — SUCCESS`

Frozen V1 remains:

`luizidebook/morro-de-sao-paulo-digital@60746fd7fed97b805758b37adfdbe3bad2582bfe`

## Financial invariants introduced

### Money

`Money` is represented as:

```text
minorUnits: non-negative Number.isSafeInteger
currency: normalized three-letter uppercase code
```

The domain rejects:

- floating-point minor units;
- negative values;
- unsafe integers;
- malformed currency codes;
- cross-currency arithmetic;
- arithmetic overflow.

This avoids using JavaScript floating-point decimal money as financial authority.

### Financial identities

M136 defines bounded branded identities:

```text
pay_<id>   → PaymentId
led_<id>   → LedgerTransactionId
fev_<id>   → FinancialEventId
```

ID generation remains a server/application concern for a later milestone; M136 freezes normalization/ownership only.

### Payment idempotency

Financial derives a stable server-owned key:

```text
payment:v1:<orderReference>
```

The application will later claim this key through `PaymentIdempotencyPort.claim()` atomically before any provider call.

This deliberately separates:

```text
Business/Ordering request identity
business:<sessionId>:<planId>
```

from:

```text
Financial provider/payment idempotency authority
payment:v1:<orderReference>
```

Business therefore does not become financial idempotency authority.

### Payment lifecycle

Initial vocabulary:

```text
pending
confirmed
failed
cancelled
expired
refunded
```

Allowed forward transitions:

```text
pending → confirmed | failed | cancelled | expired
confirmed → refunded
same-state → same-state (idempotent repeat)
```

Other transitions fail closed.

Provider out-of-order/reconciliation semantics remain a later application/reconciliation concern rather than weakening the core transition contract silently.

### Provider ports

M136 freezes provider-neutral ports for:

- checkout creation;
- raw-body webhook verification.

Provider credentials, SDKs and concrete signature algorithms remain outside the domain package.

### Double-entry ledger foundation

`LedgerTransaction` requires:

- at least two postings;
- non-zero posting amounts;
- one currency per transaction;
- safe-integer arithmetic;
- total debits exactly equal total credits;
- immutable normalized postings.

An unbalanced transaction cannot be constructed through the domain constructor.

This is intentionally stronger than the V1, which had no formal ledger.

### Versioned Financial events

Cross-domain event vocabulary begins with:

```text
PaymentApproved v1
PaymentRefunded v1
```

Events contain typed IDs, order reference, amount and bounded financial reference fields but no provider SDK or Business implementation details.

Future Affiliates may consume these public event contracts without importing Financial internals. Commission/reversal implementation remains blocked until durable financial state exists.

## Ordering invariants introduced

### Order identity and request correlation

M136 defines `OrderId` and preserves the frozen logical Business request key:

```text
business:<sessionId>:<planId>
```

This correlation is Ordering-owned request identity, not proof of payment.

### Server-authoritative pricing vocabulary

Ordering introduces:

- `OrderPricingAuthorityPort`;
- `PricingQuote`;
- immutable `OrderPricingSnapshot`.

The snapshot stores:

- plan ID;
- plan name;
- `Money` in minor units;
- pricing version;
- UTC capture timestamp.

A future checkout service must resolve this quote from an authoritative server adapter and must not trust browser-supplied amount.

### Order lifecycle

Initial state vocabulary:

```text
draft
pending_payment
payment_confirmed
cancelled
```

Allowed transitions:

```text
draft → pending_payment | cancelled
pending_payment → payment_confirmed | cancelled
same-state → same-state
```

Confirmed/cancelled orders do not silently return to earlier states.

### Ordering ports/events

M136 adds:

- `OrderRepositoryPort`;
- `OrderPricingAuthorityPort`;
- `OrderPlaced v1` event.

Ordering depends only on Financial public money contracts. Financial does not depend on Ordering, preventing a package cycle and preserving the Module Contracts direction.

## Executable evidence

`packages/financial/src/index.test.ts` proves:

- minor-unit Money normalization;
- currency normalization;
- cross-currency rejection;
- overflow rejection;
- ID normalization;
- UTC timestamp contract;
- stable payment idempotency key;
- payment transition guards;
- balanced ledger enforcement;
- zero/currency/unbalanced ledger rejection;
- provider-agnostic versioned approval/refund event shapes.

`packages/ordering/src/index.test.ts` proves:

- V1 logical Business request-key preservation;
- typed Order identity;
- immutable server price quote/snapshot;
- floating-point pricing rejection;
- immutable Order construction;
- fail-closed Order transitions;
- explicit pricing/repository ports;
- provider-free `OrderPlaced v1` event.

## Migration matrix after M136

```text
PASS      3
PARTIAL  15
GAP      15
N/A       1
TOTAL    34
```

The score reflects executable foundations, not money-processing readiness.

## Promotion decision

Only after the final M136 head passes the full repository Quality Gate:

```text
FEATURE-0009: baseline-pending → migrating
MIG-0010: snapshotted → migrating
```

Equivalence flags remain false.

## Next milestone — M137

M137 should add durable server-side persistence for:

- Order;
- Payment;
- atomic Payment idempotency claim;
- append-only balanced Ledger transactions;
- provider event claims/dedup if schema ordering permits.

No real provider call should be added until persistence proves:

- parameterized/prepared access;
- unique idempotency constraints;
- foreign-key/data invariants;
- atomic transactions;
- safe schema evolution;
- rollback strategy;
- focused persistence tests.

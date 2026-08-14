# PAYMENTS M137 — Durable Ordering / Financial Persistence Evidence

## Scope

M137 materializes server-side durable persistence behind the provider-independent M136 ports:

```text
@touristic/ordering-server
@touristic/financial-server
```

It does not add a payment provider/SDK, checkout HTTP route, webhook endpoint, public checkout token, browser checkout, subscription runtime or real money movement.

## Base

- M136 merge: `984241ab8aad9ac5c0416753ac0822d01b58b63b`;
- M136 Quality Gate: run `31834938178 — SUCCESS`;
- M137 was reconciled with `main@8d4da546a59a7ade15e4a5e030ce39f596e1adab` before final promotion.

## Database ownership

Ordering and Financial use independent server-only configuration:

```text
ORDERING_DATABASE_URL
FINANCIAL_DATABASE_URL
```

`@touristic/ordering-server` owns `ordering_orders`. `@touristic/financial-server` owns payment-idempotency claims, payments, ledger transaction headers and ledger postings. No cross-domain foreign key or provider table is introduced.

Identity/key columns use exact binary collation; amounts are unsigned minor units constrained to JavaScript safe-integer authority; statuses/directions are constrained enums; Ledger postings reference their transaction with `ON DELETE/UPDATE RESTRICT`.

## Ordering persistence invariants

`MySqlOrderRepository` proves:

- prepared/parameterized read and write access;
- unique logical request keys without mutating a conflicting Order;
- immutable identity, source and pricing snapshot;
- canonical UTC timestamps at the database boundary;
- domain transition validation;
- monotonic `updatedAt` and compare-and-swap updates;
- fail-closed handling when a concurrent writer wins.

## Financial persistence invariants

`MySqlPaymentIdempotencyPort` atomically claims `payment:v1:<orderReference>` using exact unique constraints for both idempotency key and PaymentId. It validates the persisted mapping after the write and fails closed on corruption/collision.

`MySqlPaymentRepository` proves:

- immutable Payment identity, subject, amount and idempotency;
- strict runtime rejection of forged optional references/timestamps;
- canonical UTC lifecycle timestamps;
- fail-closed Payment transitions;
- provider/confirmation/refund pointer immutability once established;
- compare-and-swap lifecycle writes that reject stale or concurrent updates.

## Ledger atomicity

`MySqlLedgerTransactionRepository` writes the transaction header and every posting through one acquired MySQL connection and transaction.

- any posting failure rolls back the complete append;
- an exact duplicate external key is idempotent only when ID, timestamp and every ordered posting match;
- a divergent duplicate ID/external key fails closed;
- persisted posting sequences must be contiguous from zero;
- at most 256 postings are accepted per transaction;
- invalid direction, zero/unsafe amount, currency mismatch, unbalanced content or corrupt persisted data is rejected.

## Rollback and evolution boundary

The M137 baseline is additive (`CREATE TABLE IF NOT EXISTS`) and does not delete or rewrite financial data. Code rollback is non-destructive because no provider or money path consumes the new tables yet. Later schema changes must use explicit versioned expand/contract migrations; M137 does not claim a general destructive migration engine.

## Executable evidence

After reconciliation with current `main`, preparation run `31838007226 — SUCCESS` validated:

```text
@touristic/ordering-server: lint + typecheck + 5 tests + build
@touristic/financial-server: lint + typecheck + 13 tests + build
```

The permanent tests cover unique collisions, immutable field enforcement, canonical UTC, forged runtime values, optimistic concurrency, atomic rollback, exact replay and corrupt Ledger sequence rejection.

The final repository-wide Quality Gate is a promotion requirement and is recorded on the M137 pull request head.

## Migration result

```text
PASS      6
PARTIAL  13
GAP      14
N/A       1
TOTAL    34
```

`FEATURE-0009` and `MIG-0010` remain `migrating`; all equivalence flags remain false.

## Next milestone

M138 is the provider-neutral checkout application service plus authoritative pricing composition. It must consume the M137 repositories, allocate server-owned identities, resolve official prices and claim financial idempotency before any later provider call.

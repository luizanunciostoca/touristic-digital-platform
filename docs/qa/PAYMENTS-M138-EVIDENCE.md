# PAYMENTS M138 — Provider-Neutral Checkout Application Evidence

## Scope

M138 composes the M136 domain contracts and M137 durable adapters into a provider-neutral checkout application service. It adds authoritative server pricing and server-owned runtime identities without exposing HTTP, calling a provider or moving money.

## Base

- M137 merge: `80b2d0516dd057577194197e8834815bada8e8b7`;
- M137 post-merge Quality Gate: run `31839328057 — SUCCESS`;
- M137 post-merge Payments Persistence Integration: run `31839328039 — SUCCESS`.

## Business handoff boundary

`normalizeBusinessCheckoutHandoff()` revalidates the cross-domain request instead of trusting the browser or the Business caller.

It requires:

- bounded safe `sessionId` and `planId`;
- contractor name, lowercase-valid email, phone and document;
- `environment=sandbox` and `publishable=false`;
- no duplicate legal acceptance type;
- mandatory versioned `terms` and `privacy` timestamps;
- at most eight acceptances;
- absolute HTTP(S) return URL without embedded credentials;
- `tutorial=false` and `requiresPaymentsCapability=true`.

The normalized value and nested objects are immutable. The application result intentionally excludes contractor/business PII.

## Pricing authority

`createOrderPricingAuthorityFromEnvironment()` requires:

```text
ORDERING_PRICING_CATALOG_JSON
```

The catalog has one explicit version and 1–100 plans. Each plan must have an exact ID/name, positive safe-integer minor units and a three-letter currency. Missing JSON, malformed JSON, duplicate IDs, zero/decimal/unsafe amounts or values that depend on trimming fail closed.

No price, currency or pricing version supplied by a browser is accepted. New Orders resolve the official catalog; retries load the existing Order before catalog resolution and preserve its immutable snapshot.

## Server-owned identity and pending Payment

The Node adapter allocates `ord_<randomUUID>` and `pay_<randomUUID>`. The application validates both through the domain normalizers before persistence.

`createPendingPayment()` derives:

```text
payment:v1:<orderReference>
```

It accepts only positive Money, a valid Order reference and a canonical UTC timestamp. Initial Payment state is immutable `pending` with no provider reference or lifecycle timestamps.

## Cross-database consistency

Ordering and Financial retain separate databases and ownership. M138 does not pretend to provide distributed ACID.

The resumable sequence is:

1. validate the handoff and derive `business:<sessionId>:<planId>`;
2. load an existing Order before pricing;
3. for a new request, resolve official pricing and persist a draft Order;
4. find or atomically claim `payment:v1:<orderReference>`;
5. persist the pending Payment with the Order timestamp/amount;
6. advance Order to `pending_payment`;
7. return only after all checkpoints are consistent.

If execution stops after Order/claim but before Payment, the next identical request reuses the same Order, snapshot, claim and Payment ID, creates the missing Payment and completes the Order transition. Immutable divergence fails closed.

## Provider-neutral result

The result contains only:

- authoritative Order;
- authoritative Payment;
- `replayed` indicator.

It contains no checkout URL, public token, provider name/SDK/reference configuration, webhook secret or contractor PII.

## Executable evidence

Focused additions:

- 8 checkout application tests;
- 5 pricing/runtime tests;
- 2 pending Payment constructor tests.

They cover handoff hardening, server-only pricing, ignored browser amount, immutable replay without repricing, cross-database interruption repair, missing-plan failure, forged identity rejection, divergent Payment rejection, catalog corruption and cryptographic ID shape.

Code checkpoint `a7dce093749b5afa23dee854ca40cc111c552559` passed Quality Gate run `31840815245 — SUCCESS`.

The permanent `Payments Persistence Integration` gate now also runs `tooling/payments/checkout-mysql-integration.test.ts` against MySQL 8.4 with distinct Ordering and Financial databases. Run `31841372754 — SUCCESS` proves a real interruption after durable Order/claim, absence of a Payment, retry under a changed catalog, preservation of the original price and completion with the original IDs.

The final repository-wide Quality Gate and MySQL gate remain promotion requirements on the final PR head.

## Migration result

```text
PASS      9
PARTIAL  10
GAP      14
N/A       1
TOTAL    34
```

`FEATURE-0009` and `MIG-0010` remain `migrating`; all equivalence flags remain false.

## Rollback and limits

M138 adds no schema and no provider side effect. Code rollback leaves the additive M137 data intact. Incomplete starts are safe to retry through durable keys.

M138 does not add HTTP/Auth, a public status capability, provider execution, webhook handling, ledger posting, verified Business activation, refund, reconciliation, settlement, subscription or real money movement.

## Next milestone

M139 is the versioned HTTP/Auth/security boundary. Provider sandbox execution remains blocked until that boundary is explicit and tested.

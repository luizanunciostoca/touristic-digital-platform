# Affiliates Migration Matrix — FEATURE-0010 / MIG-0011

## Purpose

Track FEATURE-0010 technical readiness without overstating equivalence or release state.

This matrix is reconciled with the executable `@touristic/affiliates` domain foundation and the current QA evidence. It is not a release-equivalence claim.

## Current result

```text
PASS       15
PARTIAL    10
GAP         0
N/A         2
TOTAL      27
```

`FEATURE-0010` remains `planned`. `MIG-0011` remains `migrating` on the M154 branch only; promotion to `main` and any lifecycle change require PR review, MySQL execution evidence and the required repository gates.

`AFFILIATE-POLICY-V1` remains the only approved policy. M154 adds additive MySQL schema, repositories, transactional attribution/idempotency/audit/outbox orchestration, provider-neutral adapters and an authenticated HTTP boundary. The score remains conservative at 15/10/0/2 because the local MySQL integration test is present but skipped without `AFFILIATES_DATABASE_URL`, and Ordering/Financial live readback, retention jobs and browser/E2E evidence are not proven.

## Matrix

| Capability                              | Status  | Current canonical evidence                                                                                                      | Remaining blocker                                                                                 |
| --------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Affiliate is a separate platform domain | PASS    | Domain Map, Module Contracts, canonical scope                                                                                   | none                                                                                              |
| Business ownership boundary             | PASS    | Business cannot administer Affiliate by tenant inheritance                                                                      | none                                                                                              |
| Ordering read boundary                  | PASS    | Ordering owns canonical Order identity/state; Affiliate structural port consumes only canonical evidence                        | none                                                                                              |
| Financial monetary authority boundary   | PASS    | Financial owns Payment, eligible revenue, ledger, payable/wallet, settlement, payout, reconciliation, FX and monetary reversals | none                                                                                              |
| Conceptual Affiliate schemas            | PASS    | Technical contract plus executable domain types cover identity/evidence/attribution/conversion/entitlement concepts             | none at domain-contract layer                                                                     |
| Affiliate identity                      | PARTIAL | `ids.ts` + `eligibility.ts` implement typed identity/program/membership invariants under AFFILIATE-POLICY-V1                    | durable account/membership persistence and application authorization wiring                       |
| Eligibility and suspension              | PARTIAL | executable attribution/materialization eligibility and suspension rules                                                         | persisted state, authorization/service enforcement and integration evidence                       |
| Referral/attribution evidence           | PARTIAL | `attribution.ts` requires server validation, SHA-256 fingerprint, accepted sources and deterministic evidence shape             | real source adapters, durable deduplication/persistence and integration evidence                  |
| Attribution subject and precedence      | PARTIAL | executable `AcquisitionSubjectId`, policy precedence and deterministic selection/lock behavior                                  | durable attribution repository/application orchestration and concurrent-write proof               |
| Attribution window                      | PARTIAL | executable 30-day server-clock expiry and Order lock semantics with focused tests                                               | durable expiry/lock/replay persistence and concurrency/integration proof                          |
| Conversion association                  | PARTIAL | `conversion.ts` requires Ordering `payment_confirmed`, verified Financial evidence and rejects V1 renewal commissions           | canonical Ordering/Financial adapters plus durable one-conversion-per-order enforcement           |
| Commission entitlement ownership        | PASS    | Affiliate owns commercial entitlement evidence; Financial owns monetary consequence                                             | none                                                                                              |
| Commission formula/policy               | PARTIAL | executable 3000-bps integer-minor-unit half-up calculation and immutable policy snapshot                                        | durable entitlement persistence and application/integration evidence                              |
| Commission lifecycle                    | PARTIAL | executable pending/earned/cancelled/reversed/disputed transitions and 7-day/service-aware maturity                              | durable state machine/application orchestration, concurrency and immutable adjustment persistence |
| Refund/cancellation consequences        | PARTIAL | executable pending repricing and explicit post-earned reversal consequence logic                                                | canonical Financial reconciliation adapter plus durable reversal/application evidence             |
| Canonical Affiliate event family        | PASS    | executable versioned Affiliate event payload/envelope types plus technical contract                                             | none at domain-contract layer                                                                     |
| Idempotency strategy                    | PASS    | deterministic canonical key construction plus durable idempotency port/exact-divergent replay contract                          | none at contract layer; durable implementation belongs to application/persistence stage           |
| Audit contract                          | PASS    | immutable audit fields and audit port are specified/executable as boundary types                                                | none at contract layer; durable sink follows application stage                                    |
| Authorization boundaries                | PASS    | explicit authorization port, server-authoritative rules and no tenant inheritance                                               | none at contract layer; concrete capability wiring follows application stage                      |
| Privacy/LGPD controls                   | PARTIAL | policy fixes 90-day raw referral, 24-month pseudonymous attribution/conversion and 5-year default commercial/audit retention    | retention jobs, DSR/anonymization/legal-hold configuration and execution evidence                 |
| Affiliate → Financial port              | PASS    | versioned materialization request/result/readback boundary carries no browser-controlled monetary/payout/provider instruction   | none at contract layer; real Financial adapter remains future integration work                    |
| Test and invariants plan                | PASS    | focused executable domain tests plus `AFFILIATES-FEATURE-0010-TEST-PLAN.md`                                                     | future persistence/integration/security/privacy/E2E suites belong to later stages                 |
| Threat model                            | PASS    | `AFFILIATES-THREAT-MODEL.md`                                                                                                    | none                                                                                              |
| Migration plan                          | PASS    | phased expand-only plan in technical contract                                                                                   | none at planning layer; execution remains staged                                                  |
| Rollout/rollback                        | PASS    | `AFFILIATES-ROLLOUT-ROLLBACK.md`                                                                                                | none at planning layer; activation only after runtime/gates                                       |
| Browser/admin surfaces                  | N/A     | deliberately last; browser is never authority                                                                                   | implement only after server contracts/security gates                                              |
| Affiliate-owned payout/payment/wallet   | N/A     | prohibited by canonical authority                                                                                               | must never be implemented                                                                         |

## Product decision gate

**SATISFIED.** The 19 canonical product decisions are approved and versioned as `AFFILIATE-POLICY-V1` in `docs/product-architecture/AFFILIATES-DECISION-SHEET.md`.

Implementation must use that policy exactly. Any different rate, attribution window, evidence precedence, maturity rule, retention duration or monetary authority requires an explicit later policy version and cannot be inferred from UI, browser state or provider behavior.

## Executable foundation checkpoint

The M154 branch includes the domain foundation plus:

```text
services/affiliates             PRESENT
Affiliate DB migration          PRESENT — affiliatesM154SchemaSql
Affiliate repositories          PRESENT — account, membership, evidence, attribution, conversion, entitlement
Idempotency/audit/outbox         PRESENT — durable tables and attribution transaction
Materialization lifecycle        PRESENT — pending/result/readback adapter boundary
Authenticated HTTP API          PRESENT — scoped /api/affiliates/v1 boundary
Browser/admin UI                 ABSENT — intentionally last
Affiliate-owned payout/wallet   PROHIBITED
```

The package is now linked in the workspace and the lockfile was regenerated locally. The integration test remains skipped unless `AFFILIATES_DATABASE_URL` is configured, so the matrix does not claim database execution.

## M154 evidence checkpoint

- `pnpm --filter @touristic/affiliates test`: 8 tests passed.
- `pnpm --filter @touristic/affiliates-server lint`: passed.
- `pnpm --filter @touristic/affiliates-server typecheck`: passed.
- `pnpm --filter @touristic/affiliates-server test`: 3 HTTP security tests passed; 1 MySQL integration test skipped because no `AFFILIATES_DATABASE_URL` was configured.
- The code does not import Financial, Ordering or Business implementations and does not accept amount, currency, payout or provider credentials from the browser boundary.

## Active implementation sequence

1. Add application orchestration and additive durable persistence for Affiliate identity/membership, referral evidence, attribution, conversion and entitlement state.
2. Implement durable idempotency/audit repositories and concurrency guarantees.
3. Add explicit authorization capability wiring and suspension/eligibility enforcement at service boundaries.
4. Add canonical Ordering/Financial evidence adapters.
5. Add conversion/commission application services and Financial materialization adapter, dark by default until integration evidence is complete.
6. Implement privacy retention/DSR/legal-hold operations.
7. Add authenticated read APIs/projections.
8. Add browser/admin surfaces last.
9. Execute unit, persistence, integration, security, privacy, concurrency and E2E validation.
10. Reconcile matrix/evidence and only then consider lifecycle promotion.

## Completion gate

FEATURE-0010 cannot move to `equivalent` or release-ready while any required row remains PARTIAL, while browser evidence can create commission authority, while Affiliate can create/mutate Financial monetary state directly, or while the exact final head lacks the required repository/feature gates.

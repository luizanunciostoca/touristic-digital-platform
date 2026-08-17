# Affiliates Migration Matrix — FEATURE-0010 / MIG-0011

## Purpose

Track how far `FEATURE-0010` can be closed technically without overstating implementation or release equivalence.

This is an architecture/readiness matrix, not a release-equivalence claim.

## Current result

```text
PASS       15
PARTIAL    10
GAP         0
N/A         2
TOTAL      27
```

`FEATURE-0010` remains `planned`. `MIG-0011` remains `discovered` until implementation evidence justifies promotion.

The former product-policy blockers are resolved by `AFFILIATE-POLICY-V1` in `docs/product-architecture/AFFILIATES-DECISION-SHEET.md`. Remaining PARTIAL rows are now implementation/evidence work, not missing commercial decisions.

## Matrix

| Capability                              | Status  | Canonical evidence                                                                                                      | Remaining blocker                                                        |
| --------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Affiliate is a separate platform domain | PASS    | Domain Map, Module Contracts, canonical scope                                                                           | none                                                                     |
| Business ownership boundary             | PASS    | Business cannot administer Affiliate                                                                                    | none                                                                     |
| Ordering read boundary                  | PASS    | Ordering owns canonical order identity/state; Affiliate may consume only public records/events                          | none                                                                     |
| Financial monetary authority boundary   | PASS    | Financial owns Payment, ledger, allocation, payable, wallet, settlement, payout and monetary reversal                   | none                                                                     |
| Conceptual Affiliate schemas            | PASS    | `AFFILIATES-TECHNICAL-CONTRACT.md` defines identity/evidence/attribution/conversion/entitlement concepts                | executable types/persistence still required                              |
| Affiliate identity                      | PARTIAL | AFFILIATE-POLICY-V1 fixes global account + canonical Identity + program membership model                                 | implement executable domain model/persistence/invariants                 |
| Eligibility and suspension              | PARTIAL | policy fixes attribution/materialization eligibility and suspension semantics                                           | implement state/invariants/authorization                                 |
| Referral/attribution evidence           | PARTIAL | policy fixes accepted V1 sources, server validation, precedence trust and privacy boundaries                            | implement source validation/deduplication/persistence                    |
| Attribution subject and precedence      | PARTIAL | policy fixes `AcquisitionSubjectId` and last-valid-intent source precedence                                              | implement deterministic attribution service                              |
| Attribution window                      | PARTIAL | policy fixes 30-day server-clock window and Order lock semantics                                                        | implement expiry/lock/replay tests                                       |
| Conversion association                  | PARTIAL | policy requires `payment_confirmed` Ordering evidence plus verified Financial evidence; renewals excluded in V1          | implement canonical adapters and one-conversion-per-order invariant      |
| Commission entitlement ownership        | PASS    | Affiliate owns commercial entitlement evidence; Financial owns monetary consequence                                     | none                                                                     |
| Commission formula/policy               | PARTIAL | 30% / 3000 bps of Financial net eligible platform revenue, minor-unit half-up, same currency, no cap                    | implement deterministic calculation and policy snapshot                  |
| Commission lifecycle                    | PARTIAL | policy fixes pending/earned/cancelled/reversed/disputed states and 7-day/service maturity                               | implement state machine and immutable adjustment evidence                |
| Refund/cancellation consequences        | PARTIAL | policy fixes full/partial refund, cancellation, chargeback and reversal consequences                                    | implement canonical reconciliation/reversal application behavior        |
| Canonical Affiliate event family        | PASS    | technical contract reserves event ownership/names and Platform envelope requirements                                    | executable payload schemas follow runtime model                          |
| Idempotency strategy                    | PASS    | deterministic digest keys, durable claim, exact/divergent replay semantics                                              | none at contract level                                                   |
| Audit contract                          | PASS    | immutable actor/authorization/policy/digest/correlation/outcome contract                                                | none at contract level                                                   |
| Authorization boundaries                | PASS    | server-authoritative, no tenant inheritance, explicit admin/self/service boundaries                                     | exact capability wiring follows runtime                                  |
| Privacy/LGPD controls                   | PARTIAL | policy fixes 90-day raw referral, 24-month pseudonymous attribution and 5-year default commercial evidence retention     | implement retention jobs/DSR/anonymization/legal-hold configuration      |
| Affiliate → Financial port              | PASS    | versioned materialization request/result boundary with no browser monetary authority                                    | executable adapter follows entitlement implementation                    |
| Test and invariants plan                | PASS    | `AFFILIATES-FEATURE-0010-TEST-PLAN.md`                                                                                  | runtime tests must be added with implementation                           |
| Threat model                            | PASS    | `AFFILIATES-THREAT-MODEL.md`                                                                                            | none                                                                     |
| Migration plan                          | PASS    | phased expand-only plan in technical contract                                                                           | execute additive runtime/persistence phases                              |
| Rollout/rollback                        | PASS    | `AFFILIATES-ROLLOUT-ROLLBACK.md`                                                                                        | execute only after runtime and gates                                     |
| Browser/admin surfaces                  | N/A     | deliberately last; browser is never authority                                                                           | implement only after server contracts and security gates                 |
| Affiliate-owned payout/payment/wallet   | N/A     | prohibited by canonical authority                                                                                       | must never be implemented                                                |

## Product decision gate

**SATISFIED.** The 19 canonical product decisions are approved and versioned as `AFFILIATE-POLICY-V1` in `docs/product-architecture/AFFILIATES-DECISION-SHEET.md`.

Implementation must use that policy exactly. Any different rate, attribution window, evidence precedence, maturity rule, retention duration or monetary authority requires an explicit later policy/version and cannot be inferred from UI, browser state or provider behavior.

## Active implementation sequence

1. Freeze `AFFILIATE-POLICY-V1` and expose executable policy constants/types.
2. Create `@touristic/affiliates` domain types/invariants and additive persistence.
3. Add deterministic attribution/evidence logic with durable idempotency and immutable audit.
4. Add explicit authorization capabilities and suspension/eligibility enforcement.
5. Add canonical Ordering/Financial read/event adapters.
6. Add conversion association and commission-entitlement application services.
7. Add Financial materialization adapter, disabled by default until integration/release evidence is complete.
8. Add authenticated read APIs/projections.
9. Add browser/admin surfaces last.
10. Execute unit, integration, security, privacy, concurrency and E2E validation.
11. Reconcile matrix/evidence and only then consider state promotion.

## Completion gate

FEATURE-0010 cannot move to `equivalent` or release-ready while required implementation rows remain PARTIAL, while browser evidence can create commission authority, while Affiliate can create/mutate Financial monetary state directly, or while the exact runtime head lacks the required repository/feature gates.

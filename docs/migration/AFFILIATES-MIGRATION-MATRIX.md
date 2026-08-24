# Affiliates Migration Matrix — FEATURE-0010 / MIG-0011

## Purpose

Track FEATURE-0010 technical readiness without overstating equivalence or release state.

This matrix is reconciled with the executable `@touristic/affiliates` domain/runtime on `main`, the canonical MySQL matrix and the permanent GitHub Actions contract. It is not a release-equivalence claim.

## Current result

```text
PASS       16
PARTIAL     9
GAP         0
N/A         2
TOTAL      27
```

`FEATURE-0010` and `MIG-0011` remain `migrating`. The former statement that FEATURE-0010 was only `planned` and M154 existed only on a branch is superseded: durable Affiliates code is on `main`.

`AFFILIATE-POLICY-V1` remains the only approved policy. The current score remains conservative because required lifecycle/integration evidence is still PARTIAL even though durable MySQL persistence and the server boundary are implemented and tested.

## Release-candidate reconciliation — 2026-08-22

Evidence available before this documentation-only reconciliation:

- permanent `Affiliates FEATURE-0010 Contract`: PASS on the release-candidate tree;
- canonical MySQL matrix: Affiliates `4/4` PASS, total `339/339` PASS;
- Quality Gate: PASS on a tree identical to the deployed main candidate;
- durable runtime is present on `main`;
- provider verification is `NOT_APPLICABLE` because Affiliates does not own payment/provider execution;
- no equivalence promotion is justified while required PARTIAL rows remain.

## Matrix

| Capability                              | Status  | Current canonical evidence                                                                                                      | Remaining blocker                                                              |
| --------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Affiliate is a separate platform domain | PASS    | Domain Map, Module Contracts, canonical scope                                                                                   | none                                                                           |
| Business ownership boundary             | PASS    | Business cannot administer Affiliate by tenant inheritance                                                                      | none                                                                           |
| Ordering read boundary                  | PASS    | Ordering owns canonical Order identity/state; Affiliate consumes canonical evidence through explicit boundaries                 | none at contract layer                                                         |
| Financial monetary authority boundary   | PASS    | Financial owns Payment, eligible revenue, ledger, payable/wallet, settlement, payout, reconciliation, FX and monetary reversals | none                                                                           |
| Conceptual Affiliate schemas            | PASS    | Technical contract plus executable domain types cover identity/evidence/attribution/conversion/entitlement concepts             | none at domain-contract layer                                                  |
| Affiliate identity                      | PARTIAL | Typed identity/program/membership invariants plus durable repositories exist under AFFILIATE-POLICY-V1                          | complete application authorization/lifecycle evidence                          |
| Eligibility and suspension              | PARTIAL | Eligibility/suspension rules and durable state primitives exist                                                                 | complete service-boundary enforcement and integration evidence                 |
| Referral/attribution evidence           | PARTIAL | Server validation, SHA-256 fingerprint, accepted sources, durable repositories and transactional orchestration exist            | production source-adapter and end-to-end evidence                              |
| Attribution subject and precedence      | PARTIAL | `AcquisitionSubjectId`, precedence, deterministic selection/lock behavior and durable persistence exist                         | concurrent/live integration proof across canonical evidence sources            |
| Attribution window                      | PARTIAL | 30-day server-clock expiry, Order lock semantics and durable persistence exist                                                  | expiry/lock/replay integration proof under final staging flow                  |
| Conversion association                  | PARTIAL | Conversion domain/runtime requires canonical Ordering/Financial evidence and durable conversion persistence exists              | complete final cross-domain acceptance evidence                                |
| Commission entitlement ownership        | PASS    | Affiliate owns commercial entitlement evidence; Financial owns monetary consequence                                             | none                                                                           |
| Commission formula/policy               | PARTIAL | 3000-bps integer-minor-unit half-up calculation and immutable policy snapshot are executable                                    | final durable application/integration evidence                                 |
| Commission lifecycle                    | PARTIAL | pending/earned/cancelled/reversed/disputed transitions and maturity policy are executable with durable primitives               | end-to-end lifecycle/concurrency evidence                                      |
| Refund/cancellation consequences        | PARTIAL | pending repricing and explicit post-earned reversal consequence logic exist                                                     | final canonical Financial reconciliation acceptance                            |
| Canonical Affiliate event family        | PASS    | executable versioned Affiliate event payload/envelope types plus technical contract                                             | none at domain-contract layer                                                  |
| Idempotency strategy                    | PASS    | deterministic keys, durable idempotency table/repository and exact/divergent replay contract                                    | none at contract/persistence layer                                             |
| Audit contract                          | PASS    | immutable audit fields and durable audit/outbox primitives are present                                                          | none at contract/persistence layer                                             |
| Authorization boundaries                | PASS    | explicit authorization port, authenticated HTTP boundary and no tenant inheritance                                              | none at contract layer                                                         |
| Privacy/LGPD controls                   | PASS    | executable 90d/24m/5y retention, DSR, anonymization/pseudonymization, legal holds, audit, replay/restart and isolation evidence | none                                                                           |
| Affiliate → Financial port              | PASS    | versioned materialization request/result/readback boundary carries no browser-controlled monetary/payout/provider instruction   | final integration acceptance remains separate from ownership correctness       |
| Test and invariants plan                | PASS    | executable tests plus `AFFILIATES-FEATURE-0010-TEST-PLAN.md`; permanent candidate contract green                                | none at plan/contract layer                                                    |
| Threat model                            | PASS    | `AFFILIATES-THREAT-MODEL.md`                                                                                                    | none                                                                           |
| Migration plan                          | PASS    | phased expand-only plan in technical contract                                                                                   | none at planning layer                                                         |
| Rollout/rollback                        | PASS    | `AFFILIATES-ROLLOUT-ROLLBACK.md`                                                                                                | none at planning layer; staging acceptance remains required                    |
| Browser/admin surfaces                  | N/A     | deliberately last; browser is never commission/payment authority                                                                | implement only if product scope requires a surface, without changing authority |
| Affiliate-owned payout/payment/wallet   | N/A     | prohibited by canonical authority                                                                                               | must never be implemented                                                      |

## Product decision gate

**SATISFIED.** The 19 canonical product decisions are approved and versioned as `AFFILIATE-POLICY-V1` in `docs/product-architecture/AFFILIATES-DECISION-SHEET.md`.

Implementation must use that policy exactly. Any different rate, attribution window, evidence precedence, maturity rule, retention duration or monetary authority requires an explicit later policy version and cannot be inferred from UI, browser state or provider behavior.

## Executable foundation checkpoint

Current `main` includes:

```text
services/affiliates             PRESENT
Affiliate DB migration          PRESENT
Affiliate repositories          PRESENT
Idempotency/audit/outbox        PRESENT
Materialization lifecycle       PRESENT
Authenticated HTTP API          PRESENT
Canonical MySQL execution       PASS — 4/4 in 339/339 matrix
Permanent Actions contract      PASS on candidate tree
Browser/admin UI                N/A by current authority contract
Affiliate-owned payout/wallet   PROHIBITED
```

The former statement that the MySQL integration test was skipped without `AFFILIATES_DATABASE_URL` is historical and no longer the release-candidate truth.

## Remaining work

1. complete final Ordering/Financial cross-domain acceptance for remaining PARTIAL rows;
2. prove lifecycle concurrency/replay in final staging acceptance where applicable;
3. keep any browser/admin surface non-authoritative and add it only if required by approved product scope;
4. reconcile this matrix only after new evidence; do not infer equivalence from CI alone.

## Completion gate

FEATURE-0010 cannot move to `equivalent` or release-ready while any required row remains PARTIAL, while browser evidence can create commission authority, while Affiliate can create/mutate Financial monetary state directly, or while the final candidate lacks the required repository/staging gates.

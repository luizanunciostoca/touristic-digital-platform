# Affiliates Migration Matrix — FEATURE-0010 / MIG-0011

## Purpose

Track the canonical readiness of the platform Affiliate domain without converting planned product ideas into invented runtime behavior.

This matrix is a discovery/architecture gate. It is not an implementation-completion claim.

## Current result

```text
PASS       3
PARTIAL    2
GAP       10
N/A        2
TOTAL     17
```

`FEATURE-0010` remains `planned`. `MIG-0011` remains `discovered`.

## Matrix

| Capability                              | Status  | Canonical evidence                                                                           | Missing before implementation                                                            |
| --------------------------------------- | ------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Affiliate is a separate platform domain | PASS    | Domain Map and Module Contracts define Affiliate separately from Financial and Business      | none                                                                                     |
| Business ownership boundary             | PASS    | Business cannot administer affiliates; Affiliate does not belong to seller/tenant            | none                                                                                     |
| Financial monetary authority boundary   | PASS    | Financial owns Payment, ledger, allocation, payable, settlement, wallet authority and payout | none                                                                                     |
| Affiliate identity                      | GAP     | Affiliate identity is named by CAP-0018/CAP-0023                                             | onboarding, eligibility, Identity relationship, destination scope, suspension model      |
| Referral/attribution evidence           | GAP     | CAP-0018 requires attribution and deduplication                                              | accepted evidence sources, trust/signature model, privacy retention, replay rules        |
| Attribution association                 | GAP     | `CustomerAttributedToAffiliate` is an architectural event concept                            | attribution subject, precedence/conflict rules, durable schema, producer contract        |
| Attribution window                      | GAP     | CAP-0018 explicitly requires expiry testing                                                  | duration, start clock, renewal/reset behavior, precedence on overlapping evidence        |
| Conversion association                  | PARTIAL | Affiliate may consume Ordering/Financial events; Ordering has canonical order identity       | exact qualifying conversion event and refund/cancellation consequences                   |
| Commission entitlement ownership        | PARTIAL | CAP-0019 assigns Affiliate/Financial conceptually; M146 forbids implicit financial authority | precise split: Affiliate commercial entitlement versus Financial materialization command |
| Commission formula/policy               | GAP     | Product roadmap mentions commissions                                                         | rate/base, fixed/percentage, rounding, caps, currency, version/effective dates           |
| Commission state machine                | GAP     | reversal testing is expected by CAP-0019                                                     | approved lifecycle and semantics for pending/earned/reversed/cancelled/disputed states   |
| Refund/cancellation/reversal semantics  | GAP     | Financial already has verified refund/reversal primitives                                    | entitlement consequences and ordering of Affiliate versus Financial reversals            |
| Affiliate persistence                   | GAP     | no `packages/affiliates` or `services/affiliates` exists                                     | approved schema, ownership, migrations, repositories, concurrency contract               |
| Audit and idempotency                   | GAP     | global contracts require both where applicable                                               | Affiliate-specific audit events, keys, replay/divergence rules and retention             |
| Affiliate-to-Financial adapter          | GAP     | Financial allocation/payable/settlement primitives exist                                     | versioned materialization command, authorization, rejection/retry semantics              |
| Browser/admin surfaces                  | N/A     | runtime authority is not ready                                                               | intentionally blocked until server-side contracts and authorization exist                |
| Affiliate-owned payout/payment          | N/A     | prohibited by canonical authority                                                            | must never be implemented; Financial remains owner                                       |

## Capability mapping

### CAP-0018 — Attribute customer/referral to affiliate

Planned owner: Affiliate.

Implementation entry criteria:

- approved affiliate identity contract;
- approved referral evidence contract;
- approved attribution subject and conflict rules;
- approved expiry/window semantics;
- server-side persistence and idempotency;
- no conversion inference from redirect/browser state.

### CAP-0019 — Determine commission entitlement

Planned commercial owner: Affiliate.

Financial consequence owner: Financial.

Implementation entry criteria:

- approved commission policy snapshot;
- deterministic base/formula/rounding;
- canonical Ordering conversion association;
- explicit verified Financial evidence where payment is required;
- approved refund/cancellation/dispute lifecycle;
- versioned Affiliate-to-Financial materialization contract.

Affiliate may record/evidence commercial entitlement. It may not post ledger entries or create Payment/payable/settlement/payout authority.

### CAP-0020 — Affiliate financial position

The future Affiliate Portal may expose a user-facing projection, but balance/wallet/payable/settlement authority must come from Financial.

No Affiliate-owned wallet implementation is authorized by this matrix.

## Required implementation sequence after `READY`

1. Domain contracts and invariants.
2. Durable Affiliate persistence.
3. Application boundary and authorization.
4. Canonical Ordering/Financial event or record adapters.
5. Affiliate-to-Financial materialization adapter.
6. Authenticated APIs.
7. Browser/admin surfaces.
8. Unit, integration, security, idempotency, concurrency and E2E validation.
9. Capability matrix reconciliation and release evidence.

## Completion gate

FEATURE-0010 cannot move to `equivalent` or a release-ready state while any required capability remains GAP/PARTIAL, while commission policy is implicit, while browser evidence can create commission authority, or while any Affiliate code can create Financial monetary state directly.

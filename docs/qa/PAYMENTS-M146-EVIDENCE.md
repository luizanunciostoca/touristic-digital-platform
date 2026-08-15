# PAYMENTS M146 — Split, Repasse and Settlement Evidence

## Scope

M146 closes the backend Financial contract for split, repasse and settlement on top of M145 durable reconciliation. It does not enable a production-money provider, browser money movement, subscriptions or Affiliates. `FEATURE-0009` and `MIG-0010` remain `migrating` until the remaining Payments equivalence work is closed.

## Authority boundary

Allocation is created only from persisted Financial authority. The application requires:

- a persisted Payment in `confirmed` state;
- the persisted verified approval result for that Payment;
- the deterministic approval ledger transaction;
- the latest reconciliation run for the Payment;
- that reconciliation run to have zero findings and no unresolved reconciliation evidence;
- an allocation plan whose platform amount plus beneficiary amounts exactly equals the authoritative Payment amount and currency.

Caller/browser/provider amounts cannot replace the persisted Payment amount. No commission percentage is hardcoded by M146; the Financial layer receives an explicit bounded allocation plan and enforces conservation, identity and currency invariants.

## Durable allocation and payable lifecycle

M146 adds expand-only MySQL persistence for:

- `financial_allocations` — one durable allocation authority per Payment, bound to the clean reconciliation run and deterministic allocation hash;
- `financial_payables` — beneficiary liabilities created from the allocation plan;
- `financial_settlements` — durable transfer-command lifecycle with one stable idempotency key per payable.

Allocation claim is transactional and serializes against the latest reconciliation evidence. Exact replay converges; a divergent allocation for the same Payment fails closed. The allocation becomes active only after its deterministic balanced ledger transaction exists, and only then do beneficiary payables become ready.

## Provider command versus verified settlement

`FinancialSettlementProviderPort.requestTransfer` is a command only. A successful provider response moves the internal settlement to `provider_accepted` and keeps the payable `transfer_pending`; it does not create a settlement ledger entry and is not payment authority.

Final settlement requires `readTransfer` to return an identity-matched snapshot with the exact settlement ID, provider transfer reference, amount, currency and bounded timestamp. Only a verified `paid` snapshot can post the settlement ledger transaction and mark the payable/settlement as settled.

The sandbox adapter uses server-only credentials, explicit sandbox mode, bounded HTTP response handling, redirect denial and timeout. Production configuration requires HTTPS. Provider identity substitution or malformed response fails closed.

## Double-entry accounting

M146 keeps historical ledger transactions immutable and uses deterministic external keys:

1. Allocation debits `revenue:checkout` for the gross Payment amount and credits `revenue:platform` plus one `liability:payable:<beneficiary>` entry per beneficiary.
2. Verified settlement debits the beneficiary payable liability and credits provider clearing.
3. A verified provider reversal restores the payable liability with a compensating transaction rather than editing the settlement history.
4. If a verified refund occurs after a beneficiary was already settled, allocation reversal records `asset:beneficiary_receivable:<beneficiary>` for the already-paid amount and reverses platform revenue; it does not pretend that transferred money automatically returned.

Refund allocation reversal is rejected while any transfer outcome is uncertain (`claimed`, `provider_accepted` or otherwise pending verification).

## Executable evidence

Domain tests cover allocation conservation, deterministic ordering/identity, payable/settlement invariants, stable idempotency and provider snapshot validation.

Server tests cover the sandbox settlement wire contract and fail-closed provider identity behavior.

MySQL 8.4 integration covers:

- allocation only from clean reconciled authority;
- exact allocation replay;
- provider command acceptance remaining non-authoritative;
- verified provider read before settlement posting;
- durable payable/settlement state transitions;
- refund after settlement creating beneficiary receivable;
- refund rejection while transfer outcome is uncertain.

The permanent validation set is:

- Quality Gate;
- Payments Persistence Integration;
- Payments Sandbox Provider Contract;
- Payments Verified Webhook Contract;
- Payments Verified Outcome Contract;
- Payments Operational Ledger Contract;
- Payments Refund Command Contract;
- Payments Reconciliation Contract;
- Payments Settlement Contract;
- Ticketing M147 Contract regression.

A final checkpoint SHA and run IDs are recorded in the pull request only after all permanent gates are green on the same head.

## Migration result

M146 is expected to move only the `Split/repasse` row from GAP to PASS. The final matrix remains conservative until the complete final-head validation is green:

```text
PASS     23
PARTIAL   5
GAP       5
N/A       1
TOTAL    34
```

`FEATURE-0009` and `MIG-0010` remain `migrating`; behavior, visual and API equivalence remain false because subscriptions, browser checkout/confirmation E2E, distributed rate limiting and a production provider are not closed by this milestone.

## Rollback and limits

Rollback disables settlement composition/provider commands while retaining allocations, payables, settlements, reconciliation evidence and all immutable ledger transactions. Recovery must resume from persisted command state and verified provider read-back; financial history must never be deleted or rewritten.

M146 does not grant payout authority to Affiliates and does not infer commission rules. Affiliate attribution/commission remains a separate domain contract that may consume Financial primitives only after its own authorization and evidence are implemented.

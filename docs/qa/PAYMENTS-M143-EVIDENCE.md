# PAYMENTS M143 — Operational Verified Ledger Evidence

## Scope

M143 composes the persisted M142 result into the existing durable double-entry ledger. It records internal accounting only; it does not initiate a provider refund, transfer funds, reconcile provider state, settle balances or enable a real-money provider.

## Posting authority

Accounting receives both the canonical Payment and a normalized persisted `VerifiedPaymentResult`. It rejects Payment/result identity, order, provider-reference and lifecycle mismatches before touching the ledger.

Only two result kinds are monetary:

| Result | Debit | Credit |
| --- | --- | --- |
| `approved` | `asset:provider_clearing` | `revenue:checkout` |
| `refunded` | `revenue:checkout` | `asset:provider_clearing` |

The amount and currency always come from the immutable authoritative Payment. `failed`, `cancelled` and `expired` return `not_applicable` with no posting.

## Deterministic idempotency and recovery

Each transaction ID and external key is derived from the verified result ID. The existing MySQL ledger repository writes header and all postings in one database transaction, rolls everything back when any posting fails, and accepts only an exact replay for an existing external key.

The webhook completes this sequence:

1. verify and durably claim the provider event;
2. apply/replay/recover Payment and result;
3. post/replay accounting from that persisted result;
4. acknowledge HTTP 202 only after accounting succeeds.

If Payment/result commits but accounting fails, the webhook returns 503. The exact signed provider retry replays the immutable event/result and retries the same ledger key.

## Refund reversal

A verified `refunded` result never edits the approval transaction. Before appending its compensating entry, the accounting service loads the persisted approved result and posts/replays its approval transaction. This recovers the rare case where approval/result committed but its ledger write was interrupted.

MySQL integration proves an approved result followed by a refunded result creates two transactions and four postings, with net zero signed balance for both operational accounts. Repeating either operation creates no additional transaction.

## Audit and data minimization

The webhook response and structured audit add only the accounting disposition: `posted`, `replayed` or `not_applicable`. Raw payload, signature, API token, provider payment reference, contractor PII and status capability are not logged or projected.

## Executable evidence

Unit tests prove deterministic balanced approval, exact replay, approval recovery before reversal, non-monetary failures and fail-closed result/Payment mismatch.

MySQL 8.4 integration proves atomic approval plus immutable reversal, one row per result key, replay convergence and zero net balance after refund. The permanent Payments Operational Ledger Contract runs Financial server tests, MySQL integration and composed runtime builds.

Final promotion requires green Quality Gate, Payments Persistence Integration, Payments Sandbox Provider Contract, Payments Verified Webhook Contract, Payments Verified Outcome Contract and Payments Operational Ledger Contract on one final head.

## Migration result

```text
PASS     20
PARTIAL   7
GAP       6
N/A       1
TOTAL    34
```

`FEATURE-0009` and `MIG-0010` remain `migrating`; behavior, visual and API equivalence remain false.

## Rollback and limits

Rollback disables accounting composition but retains provider events, Payment results and ledger transactions. Financial history and compensating entries must never be deleted or rewritten; a later retry resumes from persisted result evidence.

M143 does not expose a refund command. It only records a reversal after a cryptographically verified provider refund event. Provider reconciliation, split/repasse, settlement, subscriptions, distributed rate limiting, deployed third-party sandbox and browser E2E remain open.

## Next milestone

M144 adds a durable provider-neutral full-refund command whose response is never payment authority; only the later verified refund webhook may change Payment and trigger this reversal.

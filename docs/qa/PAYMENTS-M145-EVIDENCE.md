# PAYMENTS M145 — Durable Reconciliation Evidence

## Scope

M145 adds provider reconciliation as a read-only, operator-safe comparison process on top of the M144 verified payment/refund lifecycle. It does not enable a production provider, mutate Payment from a provider read, fabricate a verified result, append ledger postings, execute remediation, settle balances, create subscriptions or move real money.

## Read-only authority boundary

The application loads one persisted Payment, the verified terminal results required by its current state and the corresponding deterministic ledger transactions. It then calls `FinancialReconciliationProviderPort.readPayment` with the persisted Payment ID and provider payment reference.

The reconciliation application has no write method for Payment, verified results or ledger. Its only durable mutation is reconciliation evidence and explicit operator acknowledgement. Provider absence becomes a finding; provider transport failure remains a failed run attempt and cannot be converted into a financial fact.

The sandbox adapter performs bounded `GET /v1/payments/:providerPaymentReference` with server-only bearer credentials, sandbox-mode header, redirect denial and timeout. It sends no body. A successful response must be versioned and must exactly repeat both the requested internal Payment ID and provider payment reference. Malformed identity, invalid money/status/timestamp, oversized response and a snapshot more than five minutes ahead of the server clock fail closed.

## Deterministic comparison

A run compares:

1. provider presence;
2. provider status against the explicit internal Payment state;
3. provider amount in integer minor units;
4. provider currency;
5. required persisted verified approval/refund results;
6. deterministic approval/refund ledger transactions.

Finding IDs and evidence hashes are SHA-256-derived from bounded canonical facts. Provider references, credentials, payloads and PII are excluded from findings and HTTP projections. The run snapshot hash binds internal Payment state, provider observation, present/missing verified results and ledger presence.

## Durable run and finding lifecycle

M145 adds three expand-only MySQL tables:

- `financial_reconciliation_runs` stores immutable observed/recorded timestamps, Payment, snapshot hash and finding count;
- `financial_reconciliation_findings` stores deterministic evidence plus open/acknowledged/resolved operator state;
- `financial_reconciliation_run_findings` preserves the evidence associated with each run.

`MySqlFinancialReconciliationRepository.record` executes transactionally and locks the Payment row. Exact run replay returns the persisted run and findings; divergent reuse of a run ID or finding identity fails and rolls back. A clean/new run resolves no-longer-present findings without deleting acknowledgement authorship. Recurrence of identical evidence reopens it and clears the obsolete acknowledgement so a previous review cannot silently approve a new incident.

Resolution time is monotonic with first observation. Acknowledgement locks the finding, rejects resolved evidence, validates actor/timestamp and is idempotent without reattributing an earlier acknowledgement.

## Admin HTTP and security boundary

The runtime exposes exactly:

- `POST /api/payments/v1/reconciliation/payments/:paymentId/runs`;
- `GET /api/payments/v1/reconciliation/payments/:paymentId/findings`;
- `POST /api/payments/v1/reconciliation/findings/:findingId/acknowledgements`.

All routes require an active `admin` session. Both POST operations additionally require the platform origin/CSRF mutation decision. A run accepts only `{"runId":"..."}` and exact `Idempotency-Key: reconciliation:v1:<runId>`; acknowledgement accepts only `{}` and exact `reconciliation-ack:v1:<findingId>`.

The boundary applies 20/minute run and acknowledgement limits and 60/minute read limits per actor/IP. Success, replay, denial, rate limit and application failure are audited with bounded action, reason, actor, correlation and internal resource identity. An acknowledgement by another administrator returns the original author and is audited as already acknowledged rather than silently reattributed.

## Executable evidence

Unit tests cover:

- domain brands, provider snapshot validation and run/finding invariants;
- clean reconciliation and exact replay;
- provider status, amount, currency, missing-result and missing-ledger findings;
- provider absence versus transport failure;
- identity substitution and materially future snapshots;
- sandbox GET wire behavior, bounded response and fail-closed mapping;
- admin auth, exact bodies/idempotency, audit outcomes, rate limits and acknowledgement authorship;
- runtime routing, JSON handling, role/CSRF enforcement and unavailable behavior.

MySQL 8.4 integration covers durable mismatch creation, acknowledgement, clean resolution, acknowledgement-history preservation, exact clean-run replay and rejection of the same run ID against a divergent provider snapshot. Existing checkout, webhook, verified outcome, operational ledger and refund workflows remain regression gates.

The permanent validation set is:

- Quality Gate;
- Payments Persistence Integration;
- Payments Sandbox Provider Contract;
- Payments Verified Webhook Contract;
- Payments Verified Outcome Contract;
- Payments Operational Ledger Contract;
- Payments Refund Command Contract;
- Payments Reconciliation Contract.

A validated checkpoint SHA and run IDs are recorded before PR promotion. The same eight gates must be green on the final documentation head.

## Migration result

```text
PASS     22
PARTIAL   5
GAP       6
N/A       1
TOTAL    34
```

`FEATURE-0009` and `MIG-0010` remain `migrating`; behavior, visual and API equivalence remain false.

## Rollback and limits

Rollback disables reconciliation runtime composition and provider reads while retaining immutable runs, findings, links and acknowledgement history. It must not delete financial evidence or rewrite Payment, verified results or ledger.

M145 has no automatic remediation, provider write command, settlement/split/repasse, subscriptions, distributed rate limiter, central alert delivery, deployed third-party browser E2E or production-money provider.

## Next milestone

M146 defines split/repasse/settlement only over reconciled Financial authority. It must preserve balanced immutable postings, durable command idempotency, verified settlement outcomes and explicit reversal/chargeback allocation before any payout-like capability can be consumed by Affiliates.

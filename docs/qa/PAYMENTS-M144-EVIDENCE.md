# PAYMENTS M144 — Durable Refund Command Evidence

## Scope

M144 adds one provider-neutral, full-refund command to the M143 verified accounting lifecycle. It does not enable a production provider, trust a provider command response as payment authority, reconcile provider state, settle balances, create subscriptions or move real money.

## Financial authority and amount integrity

A refund request is eligible only when all of these persisted facts agree:

1. Payment exists and is `confirmed`;
2. Payment has a provider payment reference;
3. its `approved` verified result exists;
4. the approval ledger transaction exists under the deterministic result key.

The application derives Payment ID, full amount, currency, provider payment reference and approved result ID from those records. HTTP callers cannot supply or override financial values. Partial refund is intentionally outside M144.

## Durable claim and provider recovery

`financial_refund_requests` stores one deterministic request per Payment and approved result. Its idempotency key is exactly `refund:v1:<paymentId>`; immutable authority fields are compared after every insert/replay so a UNIQUE collision cannot redirect or alter another request.

The request is claimed before calling the provider. If the first provider call is uncertain, the row stays `claimed` and retry sends the exact same command and key. If a verified refunded event wins that race first, retry reports completion without sending another provider command. Provider acceptance advances only that request to `provider_accepted`; concurrent or divergent provider references fail closed.

The sandbox adapter sends `POST /v1/refunds` with server-only bearer credentials, sandbox-mode header, bounded timeout/response and the durable idempotency key. It accepts only a versioned `accepted: true` receipt with a normalized refund reference and never exposes provider bodies or secrets.

## Command/event authority separation

A successful command response does not mutate Payment and does not create a ledger posting or Business result. The public response remains `AWAITING_VERIFIED_EVENT`.

Completion requires a later, independently HMAC-verified and durably claimed provider event. Only that event may:

1. apply the explicit Payment transition to `refunded`;
2. persist the verified refunded result;
3. append/replay the M143 immutable compensating reversal;
4. make a replayed refund query return `COMPLETED`.

The MySQL integration test proves provider acceptance leaves Payment `confirmed`, duplicate operator requests make one provider call, and the later verified event produces the existing zero-net approval/reversal accounting chain.

## HTTP, Auth and tenant boundary

The command route is `POST /api/payments/v1/payments/:paymentId/refunds`. It requires:

- exact JSON body `{"reason":"requested_by_business"}` with no extra fields;
- exact `Idempotency-Key: refund:v1:<paymentId>`;
- active authenticated session; guest capability is never accepted;
- origin/CSRF mutation approval;
- non-read-only role and scope for the requested `X-Business-ID`;
- exact match among requested business, persisted checkout tenant and Payment;
- valid unambiguous path and normalized Payment ID;
- the conservative 6/minute actor/tenant/IP mutation limit.

The response contains only internal refund ID, Payment ID, bounded status and replay flag. Provider references, raw payload, credentials and contractor PII are absent. Structured audit is likewise bounded.

## Executable evidence

Unit tests cover:

- refund brands, normalization and exact payment-bound key;
- eligibility, immutable amount authority and Payment non-mutation;
- provider timeout recovery and exact replay;
- provider adapter wire mapping and invalid response rejection;
- HTTP body/idempotency/auth/rate/error behavior;
- guest, read-only and cross-tenant denial;
- runtime routing and tenant binding.

MySQL 8.4 integration covers the durable claim, provider acceptance, replay, unchanged confirmed Payment, verified refunded transition and immutable ledger reversal. The permanent Payments Refund Command Contract repeats domain/server tests, integration, runtime package builds and the Morro runtime boundary tests.

Validated implementation checkpoint `a76ea3e9705236884e34199c535d4ea60f5c1b15`:

- Quality Gate `31854208786 — SUCCESS`;
- Payments Persistence Integration `31854208746 — SUCCESS`;
- Payments Sandbox Provider Contract `31854208728 — SUCCESS`;
- Payments Verified Webhook Contract `31854208726 — SUCCESS`;
- Payments Verified Outcome Contract `31854208733 — SUCCESS`;
- Payments Operational Ledger Contract `31854208817 — SUCCESS`;
- Payments Refund Command Contract `31854208745 — SUCCESS`.

Final promotion requires the same seven green gates on the final documentation head.

## Migration result

```text
PASS     21
PARTIAL   6
GAP       6
N/A       1
TOTAL    34
```

`FEATURE-0009` and `MIG-0010` remain `migrating`; behavior, visual and API equivalence remain false.

## Rollback and limits

Rollback disables the refund HTTP/runtime composition and sandbox command adapter but retains refund claims, provider evidence, Payment results and immutable ledger history. Retrying from a persisted `claimed` request must reuse the same provider key; no rollback may delete or rewrite financial evidence.

M144 has no provider reconciliation, operator finding workflow, split/repasse/settlement, subscriptions, distributed rate limiter, deployed third-party sandbox/browser E2E or production-money provider.

## Next milestone

M145 adds read-only provider reconciliation with deterministic durable mismatch findings across provider state, Payment, verified results and ledger. Findings must be replay-safe, auditable and explicitly acknowledged/remediated without rewriting financial history.

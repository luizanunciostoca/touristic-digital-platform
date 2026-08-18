# Affiliates M154 — Evidence

## Status

M154 adds the first durable Affiliates application boundary on top of `AFFILIATE-POLICY-V1`. It is **not** a release or equivalence claim. `FEATURE-0010` remains `planned` until the PR, MySQL, integration, privacy, provider-readback and browser gates are executed on the final head.

## Implemented

The branch contains `@touristic/affiliates` domain contracts and `@touristic/affiliates-server` with additive MySQL schema for account/membership, referral evidence, attribution, conversion, entitlement revisions, idempotency claims, audit events, materialization requests and transactional outbox events. The application mutation records referral evidence, chooses attribution under the approved precedence rules, protects an existing Order lock, claims deterministic idempotency, and appends audit/outbox records in the same transaction.

The service also exposes provider-neutral adapters for canonical Ordering evidence, verified Financial evidence, authorization/eligibility and Financial materialization request dispatch. Materialization is persisted before dispatch, read back before retry, and records accepted/rejected results without accepting any Affiliate-owned monetary instruction. The HTTP boundary is authenticated through an injected authorization port, destination-scoped, correlation-aware and rejects browser-supplied amount, currency, payout or provider credentials.

## Local evidence

| Check                                                  | Result                                                                       |
| ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `pnpm --filter @touristic/affiliates lint`             | PASS                                                                         |
| `pnpm --filter @touristic/affiliates typecheck`        | PASS                                                                         |
| `pnpm --filter @touristic/affiliates test`             | 8 passed                                                                     |
| `pnpm --filter @touristic/affiliates-server lint`      | PASS                                                                         |
| `pnpm --filter @touristic/affiliates-server typecheck` | PASS                                                                         |
| `pnpm --filter @touristic/affiliates-server test`      | 3 HTTP security tests passed; MySQL test skipped without configured database |

## Explicit limitations

The MySQL integration test is present but was not executed because `AFFILIATES_DATABASE_URL` was not configured in this sandbox. Live Ordering/Financial readback, production authorization wiring, retention/DSR jobs, browser/admin UI, provider sandbox execution, multi-replica concurrency and GitHub Actions remain unproven. No Affiliate-owned wallet, payout, ledger, settlement, transfer or provider credential was added.

## Rollback

Rollback is additive and flag-free at this stage: stop consuming Affiliate outbox events, disable the HTTP route at composition, and retain durable Affiliate/Financial history. No destructive downgrade or deletion of financial history is authorized.

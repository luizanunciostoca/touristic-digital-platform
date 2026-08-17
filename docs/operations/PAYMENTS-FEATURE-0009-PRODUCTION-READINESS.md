# FEATURE-0009 — Production readiness

Scope: Business handoff → Ordering → Payments → Financial → Subscription / Recurrence.

This runbook intentionally excludes CRM, Affiliates and Ticketing ownership. Business remains the source of the commercial handoff only; Ordering owns order/subscription state; Payments owns provider orchestration; Financial owns verified payment facts, reconciliation, refund and accounting effects. Browser code never becomes financial authority.

## Candidate dependency

The FEATURE-0009 closure branch is stacked on the Platform production-readiness candidate because that candidate already makes Auth session resolution durable/async-safe and establishes the canonical `PLATFORM-OBSERVATION` contract/runtime conventions. Do not merge this branch directly to `main` while its Platform base is unmerged. After the Platform candidate is promoted, rebase/retarget this PR and require it to be 0-behind before CI approval.

## What is code-complete in this candidate

- Checkout, refund and reconciliation provider calls are wrapped without changing their return values, idempotency keys or mutation authority.
- HTTP correlation IDs flow through an `AsyncLocalStorage` observation context for downstream provider observations.
- Payment lifecycle audits are projected to the canonical Platform observation schema using `createPlatformObservation`.
- Provider health observations distinguish infrastructure/invalid-response failures from semantic provider rejection. Identical degraded state is deduplicated and the next successful provider operation emits recovery.
- Observation sink failures are swallowed. They cannot approve, refund, reconcile, renew, reject or otherwise mutate money/subscription state.
- Subscription recurrence exposes an optional read-only observation port. Preparation and verified-outcome transitions include correlation IDs; if no external trigger correlation exists, the application generates a deterministic recurrence correlation key rather than inventing a scheduler.
- The existing deterministic browser contract remains intact.
- A separate real-provider browser runner exists at `apps/morro-digital-platform/tooling/payments-provider-browser-e2e.mjs` and produces evidence only after a real provider page and authoritative `businessPaymentVerified` result are observed.

## Canonical observation names

The candidate emits the following names through `PLATFORM-OBSERVATION` version 1:

- `payments.checkout.lifecycle`
- `payments.checkout_authority.lifecycle`
- `payments.verified_outcome.lifecycle`
- `payments.refund.lifecycle`
- `payments.reconciliation.lifecycle`
- `payments.subscription.recurrence`
- `payments.provider.command_rejected`
- `platform.provider.degraded`
- `platform.provider.recovered`

Provider rejection is intentionally not equivalent to provider degradation. Only `SANDBOX_PROVIDER_UNAVAILABLE` and `SANDBOX_PROVIDER_INVALID_RESPONSE` change the local provider health state.

## Real provider/browser E2E

The runner is deliberately provider-neutral. Provider-specific selectors and sandbox credentials belong in an operator-owned fixture, not in the repository.

1. Build/deploy the exact candidate SHA to an isolated sandbox/staging environment with the real configured Payments sandbox provider and webhook path.
2. Copy `apps/morro-digital-platform/tooling/payments-provider-browser-e2e.fixture.json` to a temporary file outside version control.
3. Set:
   - `PAYMENTS_E2E_APP_BASE_URL` to the exact deployed candidate origin.
   - `PAYMENTS_E2E_PROVIDER_ORIGIN` to the provider sandbox origin expected in the popup.
   - `PAYMENTS_E2E_FIXTURE` to the temporary configured fixture.
   - optionally `PAYMENTS_E2E_EVIDENCE` to the desired evidence file.
   - optionally `PAYMENTS_E2E_PLAYWRIGHT_MODULE` when Playwright is installed outside the workspace.
4. Populate `provider.steps` in the temporary fixture with only the interactions required by the real provider sandbox. Supported actions are `fill`, `select`, `check`, `click`, `waitForSelector`, and `waitForURL`. Put secrets in environment variables and reference them as `${ENV:NAME}`; never commit credentials.
5. Install Chromium in the same deterministic manner already used by the repository browser contract, for example with Playwright 1.54.2 outside the workspace when necessary.
6. Run `pnpm --filter @touristic/morro-digital-platform test:provider-e2e`.
7. Preserve the evidence JSON. A valid PASS must contain a real checkout ID, real payment ID, provider origin, at least one HTTP correlation ID and an authoritative verified payment reference. The runner never writes checkout/status capabilities or provider credentials to evidence.

Do not mark the provider/browser matrix row PASS from a local mocked workflow, a provider API-only call, a screenshot, or a manually edited evidence file. The PASS requires the deployed browser journey and the provider/webhook/verified-result loop.

## Rate-limit topology decision

Current repository evidence does **not** establish a horizontally scaled Payments runtime:

- `services/ordering/src/checkout-rate-limit.ts` is explicitly per-process/in-memory.
- Checkout, checkout-authority, refund and reconciliation already consume the asynchronous rate-limit port rather than directly owning a map.
- the repository has no Payments replica-count, autoscaling, `maxInstances`, `replicas`, shared limiter provider, Redis/KV limiter setting or equivalent deployment contract;
- the current development/runtime composition is a single Node HTTP process.

Therefore this candidate does **not** invent distributed infrastructure.

The production deployment owner must record one of these decisions before FEATURE-0009 can claim topology-complete rate limiting:

### Decision A — single active Payments replica

Record the deployment manifest/provider configuration proving that at most one active Payments runtime serves the protected endpoints for the release. The existing in-memory limiter is then the intended implementation for that topology.

### Decision B — more than one active Payments replica

A shared limiter becomes mandatory before release. Implement it behind the existing async rate-limit ports and preserve the exact bucket/key/limit/window semantics. Required properties:

- atomic consume across replicas;
- bounded TTL/storage growth;
- deterministic `retryAfterSeconds` semantics;
- fail-closed behavior for mutation endpoints when limiter state is unavailable, unless a separately approved security policy says otherwise;
- no provider-specific types leaking into Ordering/Financial contracts;
- tests proving cross-replica contention, expiry and outage behavior.

Until A or B is evidenced, the migration matrix row stays PARTIAL for deployment topology, even though no repository-side distributed-limiter implementation is justified yet.

## Subscription / recurrence operational boundary

No autonomous recurrence scheduler is approved in the current architecture. The recurrence application prepares one deterministic renewal intent and applies only a verified Financial outcome. This candidate does not invent a scheduler or blind recharge loop.

Any future approved recurrence trigger must:

- create/propagate a correlation ID;
- compose `createSubscriptionRecurrenceApplicationService` with the canonical Payments/Platform observation adapter;
- preserve the deterministic renewal request key;
- never advance a subscription from provider response alone;
- never retry a `past_due` subscription as a new blind renewal;
- preserve durable renewal-intent and verified-result readback.

## Refund and reconciliation review

Release verification must confirm:

- refund replays do not submit a second provider refund;
- a refund cannot start without the verified approved result and accounting ledger evidence;
- reconciliation remains read-only toward provider facts and persists findings before acknowledgement;
- a provider read failure cannot become a Financial fact;
- all refund/reconciliation HTTP responses preserve `X-Correlation-ID`;
- provider degraded/recovered observations contain no secrets or mutation commands.

## Async Auth consumer review

On the stacked Platform base, all Payments authorization consumers await durable Auth session resolution before authorization:

- checkout create;
- Ticketing handoff authorization used by the shared checkout transport (reviewed only as a consumer; no Ticketing ownership change in this branch);
- refund;
- reconciliation.

Any rebase that reintroduces synchronous `resolveSession` consumption is a release blocker.

## Local/static gates while GitHub Actions is unavailable

When a local checkout of the candidate is available, run at minimum:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm architecture:check
pnpm features:check
pnpm --filter @touristic/ordering test
pnpm --filter @touristic/ordering typecheck
pnpm --filter @touristic/morro-digital-platform test
pnpm --filter @touristic/morro-digital-platform typecheck
pnpm --filter @touristic/morro-digital-platform build
```

Also run the existing deterministic Payments workflows locally/equivalently where their scripts are available. These checks are useful evidence but do not replace required branch-protection checks.

## Official gates before merge

When GitHub Actions is restored:

- retarget/rebase onto the then-current `main` and require `behind_by=0`;
- run all required branch-protection checks on the exact head SHA;
- run Payments M147/M148/M149/M150/M151/M152/M153 focused checks affected by the diff;
- run the repository Quality gate, typecheck, tests, build and relevant browser contract;
- if provider credentials/environment are available, run the real provider/browser E2E against the exact deployed SHA and preserve evidence;
- do not merge if any required check is absent, stale, neutral/pending or failing.

## Rollback

Use `docs/operations/PAYMENTS-RELEASE-ROLLBACK.md` as the canonical rollback procedure. This candidate adds observations and provider wrappers only; rollback must never rewrite durable Payment, Financial, refund, reconciliation or Subscription facts merely to match an older binary. Reverting observability must not suppress investigation of provider events already received.

## Promotion rule

This candidate may close the **repository code** portion of Financial/Subscription observability. It must not promote FEATURE-0009 to equivalent/complete while either of these remains unevidenced:

1. deployed real-provider/browser E2E;
2. actual production Payments replica topology and the corresponding rate-limit decision.

GitHub Actions being unavailable is also a merge blocker for the critical release, not a reason to fabricate gate evidence.

# FEATURE-0011 Ticketing release / rollback

## Documentary status

`FEATURE-0011` and `MIG-0017` are `equivalent` after PR #276 and the documentary reconciliation in PR #279. They are **not** `released`.

This runbook governs future activation and rollback. Its existence is not evidence that staging or production activation has occurred.

## Authority invariants

- Ordering owns the Reservation → canonical Order binding.
- `/api/payments/v1/checkouts` is the only checkout boundary.
- Payments runtime alone owns provider checkout/webhook/refund composition.
- Financial persisted verified outcomes are the only payment/refund authority consumed by Ticketing.
- Ticketing never confirms from browser redirects or provider payloads.
- QR signing root and offline provisioning root remain server-side.

## Required configuration

Ticketing runtime is fail-closed and disabled unless explicitly enabled.

- `TICKETING_FEATURE_ENABLED=true`
- `TICKETING_DATABASE_URL`
- `ORDERING_DATABASE_URL`
- `FINANCIAL_DATABASE_URL`
- `TICKETING_SIGNING_SECRET` (server only)
- `TICKETING_OFFLINE_PROVISIONING_SECRET` (server only, >= 32 chars)
- `PAYMENTS_HANDOFF_SECRET` (shared server-side handoff capability secret, >= 32 chars)
- `PAYMENTS_DESTINATION_ID`
- optional `TICKETING_FINANCIAL_POLL_INTERVAL_MS` (500..60000)

Payments retains its existing provider/webhook/status configuration. Do not copy provider credentials into Ticketing.

## Activation

1. Deploy an immutable release candidate only after the official exact-head gates required by the repository are executable and green.
2. Keep `TICKETING_FEATURE_ENABLED` unset/false on first deployment. Ticketing API must return `TICKETING_FEATURE_DISABLED`; Payments remains unaffected.
3. Confirm Ordering, Financial and Ticketing database connectivity and schema application.
4. Confirm the canonical Payments checkout route is healthy: `/api/payments/v1/checkouts`.
5. Enable `TICKETING_FEATURE_ENABLED=true` only for the intended environment.
6. Prove the sequence with a non-production/safe fixture: Catalog → Hold → Ordering Order → canonical Payments checkout → persisted approved Financial result → Reservation confirmation → Ticket issuance → QR/human code → check-in.
7. Prove verified refund propagation to Reservation/Ticket cancellation.
8. If offline validation is enabled, provision a scoped device credential, perform one sync, prove replay-safe behavior, revoke it, and prove subsequent sync is rejected.

## Rollback

Application rollback is non-destructive:

1. Set `TICKETING_FEATURE_ENABLED=false` and redeploy/restart the runtime.
2. This disables Ticketing HTTP mutations and stops new Ticketing delivery work without changing Payments/Financial authority.
3. Do not delete Financial verified outcomes, Orders, Payments, Reservations, Tickets or audit history.
4. Existing provider/webhook/refund processing continues in Payments.
5. Database rollback SQL is for controlled migration rollback only; do not drop Ticketing tables while durable Ticketing records are still required.

## Offline credential safety

- The API returns only a device-derived credential/signing secret, never the root provisioning secret.
- Registration persists token fingerprint, destination, issuer, expiry, revocation and last sync.
- Sync requires cryptographic validity plus an exact active durable registration.
- Revocation is admin-only and audited.
- Existing M148 offline envelope/check-in replay protection remains authoritative.

## Equivalence evidence versus release evidence

The equivalence gate was satisfied by the implementation/evidence integrated through PR #276 and reconciled into the Registry/Ticketing matrix by PR #279. Historical pre-promotion wording must not be used to downgrade the current `equivalent` state.

A production release is a separate decision. Do not mark FEATURE-0011 or MIG-0017 `released` until the Definition of Released in `docs/product-architecture/RELEASE-PROCESS.md` is satisfied, including immutable release identity, official gates, staging/go-no-go, activation evidence, stable health/metrics, critical reconciliation and a documented rollback path.
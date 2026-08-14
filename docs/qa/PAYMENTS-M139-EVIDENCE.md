# PAYMENTS M139 — HTTP/Auth/Security Boundary Evidence

## Scope

M139 exposes the provider-neutral M138 checkout application through a versioned, fail-closed HTTP/Auth/security boundary. It introduces no payment provider, webhook or money movement.

## Versioned routes

- `POST /api/payments/v1/checkouts`;
- `GET /api/payments/v1/checkouts/:orderId`.

Create accepts bounded `application/json`, propagates or generates a valid correlation ID and requires the exact `Idempotency-Key=business:<sessionId>:<planId>`. Missing and divergent keys are rejected before application execution. Stable public errors do not expose internal exception text.

The create projection contains authoritative checkout/payment IDs, pending status, official immutable plan snapshot, status capability and expiry. Contractor, document, email, phone, provider credentials and database details are absent.

## Request authority

Authenticated creation requires all of:

1. a valid platform session;
2. same-origin mutation validation;
3. a valid CSRF token;
4. a non-read-only role;
5. exact business scope from `X-Business-ID`;
6. configured destination context.

The guest alternative is not anonymous trust. A server-issued HMAC capability binds the full normalized handoff fingerprint, destination, tenant, issue time and expiry. TTL is 1–30 minutes, future-skew is bounded and signature/fingerprint comparisons are timing-safe. Production guest requests must also originate from the configured HTTPS origin set.

Return URLs are evaluated by exact origin, reject embedded credentials and require HTTPS in production.

## Durable status capability

`ordering_checkout_access` is an additive Ordering-owned table that binds:

- Order and exact Payment reference;
- SHA-256 request fingerprint;
- SHA-256 status-token hash;
- requester kind/subject;
- destination/tenant;
- correlation and canonical UTC creation/expiry.

The plaintext `cst_v1_*` token is never persisted. Exact retries reproduce the same deterministic token while divergent handoff/context under the same logical Order fails with `IDEMPOTENCY_CONFLICT`.

Status lookup requires the exact unexpired capability. Invalid ID, absent/wrong token and unknown Order all project `404 CHECKOUT_NOT_FOUND`. Successful status contains only checkout/session correlation, public status and later-composition placeholders.

## Runtime and operational controls

`apps/morro-digital-platform/tooling/payments-api.mjs` composes Auth, authoritative pricing, Ordering/Financial pools, repositories, access authority and transport. Startup remains unavailable unless all required database/catalog/security configuration is valid. JSON is limited to 64 KiB and non-JSON create requests fail before transport.

M139 emits structured create/status/runtime audit without token or contractor PII. Route limits are 12 creates/minute by actor+destination+IP and 60 status reads/minute by IP. The limiter is intentionally single-process, so the matrix keeps rate limiting PARTIAL until a distributed production adapter exists.

## Executable evidence

Focused tests cover:

- status/guest HMAC primitives, expiry, tamper and exact production origin policy;
- durable access validation, authority replay and schema no-plaintext invariant;
- create/status projections, logical idempotency, auth/CSRF/return denial, deterministic replay, divergent authority, indistinguishable 404, failure normalization and rate windows;
- runtime fail-closed behavior, bounded JSON/correlation, media type, authenticated role/scope/CSRF and signed guest origin/fingerprint binding;
- MySQL 8.4 persistence of hash-only authority, valid status, invalid/unknown identical denial, exact replay and divergent retry conflict.

Payments Persistence Integration run `31844112187 — SUCCESS` on checkpoint `248e336811c2f5d30c672448787654103742b512` proves Ordering, Financial and checkout application/HTTP integration against distinct real schemas. Final promotion still requires repository-wide Quality and the same MySQL gate on the final PR head.

## Migration result

```text
PASS     14
PARTIAL   9
GAP      10
N/A       1
TOTAL    34
```

`FEATURE-0009` and `MIG-0010` remain `migrating`; behavior, visual and API equivalence flags remain false.

## Rollback and limits

The schema is additive and contains no provider side effect. Route/runtime rollback leaves M137/M138 Order/Payment data intact. Status-secret rotation invalidates existing capabilities by design and therefore requires an explicit operational window.

M139 does not create a provider checkout, accept card data, verify a webhook, confirm/refund a Payment, post operational ledger entries, activate Business, reconcile, settle, subscribe or move money.

## Next milestone

M140 is one provider sandbox adapter behind `FinancialCheckoutProviderPort`. Webhook verification/replay remains M141 and provider outcome authority remains later.

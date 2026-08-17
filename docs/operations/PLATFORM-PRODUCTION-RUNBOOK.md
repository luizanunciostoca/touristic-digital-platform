# Morro Digital — Platform Production Runbook

Status: canonical operational runbook for the Morro Digital HTTP runtime.
Scope: Platform health/readiness, correlation/release identity, observations, graceful shutdown, rollback, Auth shared security state and HTTP hardening.

This runbook does not redefine Business, CRM, Ordering, Payments, Financial, Ticketing or Affiliates authority.

## 1. Runtime probes

### `GET /healthz`

Liveness answers whether the HTTP process can answer requests. A live process returns HTTP `200` even when it must not receive production traffic.

The response exposes only operational identity:

- `status: live`;
- service;
- release SHA/version/deployment identity;
- observation timestamp.

Do not use liveness as a traffic-admission signal.

### `GET /readyz`

Readiness returns the canonical `PLATFORM-HEALTH-SNAPSHOT` v1 contract.

- HTTP `200`: `readiness=ready`;
- HTTP `503`: `readiness=not_ready`.

Critical checks currently are:

- `http-listener`;
- `shutdown-readiness`;
- `release-identity`;
- `auth-security-state`.

Production readiness fails closed when any release identity field is missing. Non-production may use local/unknown identity without pretending it is a deployable production revision.

Provider warnings are non-critical: they may produce `status=degraded` while readiness remains `ready`.

## 2. Correlation and immutable release identity

Every HTTP response receives:

- `X-Correlation-ID`;
- `X-Release-SHA`;
- `X-Release-Version`;
- `X-Deployment-ID`.

Inbound `X-Correlation-ID` is propagated only when it matches the bounded server pattern. Missing or invalid input is replaced with a generated `corr_<uuid>` value.

Production deployment must inject:

- `MORRO_RELEASE_SHA`;
- `MORRO_RELEASE_VERSION`;
- `MORRO_DEPLOYMENT_ID`.

`GITHUB_SHA` is accepted only as a SHA fallback when present. Production must not be promoted while `/readyz` reports a failed `release-identity` check.

For an intentional rollback deployment, set `MORRO_ROLLBACK_FROM_SHA` to the unhealthy release SHA.

## 3. Canonical observations

Runtime observations use the existing `createPlatformObservation` contract. The HTTP runtime emits newline-delimited JSON to stdout with envelope:

```json
{"contract":"PLATFORM-OBSERVATION","contractVersion":1,"observation":{}}
```

Important names include:

- `platform.runtime.started`;
- `platform.runtime.stopped`;
- `platform.runtime.fatal_failure`;
- `platform.security.audit`;
- `platform.provider.degraded`;
- `platform.provider.recovered`;
- `platform.http.unhandled_failure`;
- `platform.shutdown.readiness_transition`;
- `platform.shutdown.drain_started`;
- `platform.shutdown.drain_timeout`;
- `platform.shutdown.drain_failed`;
- `platform.shutdown.runtime_stop_failed`;
- `platform.shutdown.completed`;
- `platform.release.rollback_activated`.

Fatal process visibility uses Node's `uncaughtExceptionMonitor` while the production runtime is listening. This is observation-only: it does not install an `uncaughtException` recovery handler, does not convert an unhandled rejection into a successful process, and does not suppress Node's normal fatal termination semantics.

The sink must never contain credentials, raw passwords, cookies, CSRF tokens, provider secrets, raw session IDs or raw login-limiter keys.

Collector/exporter selection remains infrastructure-owned; do not introduce a second application observation schema.

## 4. Provider degradation and recovery

Weather providers are optional/non-critical Platform dependencies.

- Visual Crossing failure emits degradation and permits Open-Meteo fallback.
- Open-Meteo failure emits degradation.
- bounded stale-cache serving is observable as degradation;
- successful recovery emits `platform.provider.recovered` and removes the provider warning.

A non-critical provider outage must not create a process restart loop or falsely remove an otherwise usable revision from readiness.

## 5. Auth shared/durable security state

Production Auth requires `AUTH_DATABASE_URL` pointing every active replica at the same MySQL authority.

The Auth server owns two idempotently-created tables:

- `auth_login_rate_limits`;
- `auth_session_revocations`.

Login limiter keys and session revocation keys are namespaced SHA-256 digests. Raw IP/session identifiers are not persisted in those tables.

Login consumption is serialized transactionally with a row lock. Session revocation is checked on every authenticated session resolution.

If the durable state is absent, cannot initialize, or later becomes unavailable:

- Auth fails closed;
- `auth-security-state` fails readiness;
- `/readyz` returns `503`;
- production must not fall back to process-local authority.

In-memory state remains development/test only.

### Client address trust boundary

Login rate limiting uses the direct socket peer address. The Auth runtime intentionally does not trust arbitrary `X-Forwarded-For` input as security authority. If a trusted reverse proxy is introduced, preserve this boundary explicitly at ingress rather than accepting user-controlled forwarding headers in application code.

### Global admin authority

The canonical role model still permits global `admin` authority. Production refuses readiness when an admin is configured unless the operator explicitly sets:

`DASHBOARD_ADMIN_GLOBAL_BYPASS_CONFIRMED=true`

Use that only after approving global scope. Cross-scope admin use is emitted through the security audit observation.

## 6. Browser and HTTP security boundary

The central runtime sets:

- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: no-referrer`;
- `Cross-Origin-Opener-Policy: same-origin`;
- `X-Frame-Options: DENY`;
- a restrictive `Permissions-Policy`;
- CSP with same-origin defaults and explicit Map/V1 compatibility sources;
- `script-src-attr 'none'`, injected by Platform binding, to reject inline event-handler attributes.

### CSP compatibility residual

The preserved V1/CRM browser shells still contain inline import maps. The current `script-src` therefore retains the existing `'unsafe-inline'` compatibility token and Platform appends three reviewed SHA-256 import-map hashes.

Do **not** claim that the literal `'unsafe-inline'` token has been removed from `script-src` in this release. Removing that residual safely requires migrating/verifying every preserved inline import map and its browser contracts first.

`style-src 'unsafe-inline'` also remains for preserved V1 visual compatibility.

The dashboard login and dashboard redirect surfaces themselves no longer need large inline executable bootstraps; they load same-origin module files.

## 7. Static-file trust boundary

Only approved public roots and built package `dist` output may be served. Repository-private paths, source trees, environment files and encoded path traversal must remain inaccessible over HTTP.

Unknown `/api/*` paths return intentional JSON `404`, not filesystem or internal-error details.

## 8. Graceful shutdown

On `SIGTERM` or `SIGINT`:

1. readiness immediately transitions to `not_ready`;
2. `/readyz` returns `503` while `/healthz` remains live during the transition window;
3. normal application traffic receives `503 SERVICE_DRAINING`;
4. the runtime waits `PLATFORM_SHUTDOWN_READINESS_DELAY_MS` for ingress/load-balancer convergence;
5. the HTTP listener begins draining;
6. drain is bounded by `PLATFORM_SHUTDOWN_DRAIN_TIMEOUT_MS`;
7. timeout emits a critical observation and remaining connections are forcibly closed;
8. Auth/CRM/Payments and materialized Ticketing runtimes are stopped with failure aggregation;
9. completion and runtime-stop observations are emitted before exit.

Defaults:

- production readiness delay: `5000 ms`;
- non-production readiness delay: `0 ms`;
- drain timeout: `15000 ms`.

Never configure an unbounded drain.

## 9. Deploy procedure

1. Select the exact immutable artifact and source SHA.
2. Configure domain-owned databases/providers according to their own runbooks.
3. Configure production Auth:
   - `AUTH_DATABASE_URL` shared by all replicas;
   - strong server-only `DASHBOARD_AUTH_SECRET`;
   - exact `DASHBOARD_AUTH_ORIGIN`;
   - valid `DASHBOARD_USERS_JSON`;
   - global-admin confirmation only when explicitly approved.
4. Inject `MORRO_RELEASE_SHA`, `MORRO_RELEASE_VERSION`, `MORRO_DEPLOYMENT_ID`.
5. Keep `MORRO_ROLLBACK_FROM_SHA` empty for a forward deploy.
6. Start the candidate revision without production traffic.
7. Require `/healthz=200` and verify release headers.
8. Require `/readyz=200`, `readiness=ready`, and all critical checks passing.
9. Confirm `platform.runtime.started` for the same release/deployment identity.
10. Shift traffic only after those gates pass.

## 10. Rollback procedure

Rollback means redeploying the last verified immutable artifact.

1. Record `BAD_SHA` from the unhealthy revision.
2. Select `GOOD_SHA` and its already-verified artifact.
3. Deploy with:
   - `MORRO_RELEASE_SHA=GOOD_SHA`;
   - correct release version;
   - a new deployment ID;
   - `MORRO_ROLLBACK_FROM_SHA=BAD_SHA`.
4. Require `/healthz=200`.
5. Require `/readyz=200` before traffic admission.
6. Confirm `platform.release.rollback_activated` contains `fromReleaseSha=BAD_SHA` and `toReleaseSha=GOOD_SHA`.
7. Confirm user-facing release headers show `GOOD_SHA`.
8. Preserve the failed-release evidence for incident analysis.

Clear `MORRO_ROLLBACK_FROM_SHA` on the next normal forward release.

## 11. Failure handling

### `/healthz` unavailable

Treat as process/listener failure. Inspect runtime/container state and startup logs.

### Fatal process failure

Search the final process output for `platform.runtime.fatal_failure` and correlate it with the same release/deployment identity. Its `origin` distinguishes ordinary `uncaughtException` from an unhandled rejection promoted to an exception by Node. The monitor is evidence only; rely on the process supervisor/orchestrator to restart or replace the failed instance rather than attempting in-process recovery.

### `/healthz=200`, `/readyz=503`

Read `checks[]` first.

- `release-identity`: deployment metadata is incomplete; do not admit traffic.
- `auth-security-state`: restore the shared MySQL authority; never switch production to in-memory state.
- `shutdown-readiness`: instance is intentionally draining.
- `http-listener`: runtime lifecycle is inconsistent.

### Provider degraded but readiness remains ready

Inspect `platform.provider.degraded`; restore the dependency and confirm the matching recovery event.

### Drain timeout

Use the shutdown correlation ID to group readiness transition, drain start, timeout/failure, runtime-stop results and completion. Fix the blocking connection/downstream close before increasing timeout values.

## 12. Required promotion gates

Do not merge/promote Platform based only on static review.

When GitHub Actions is available, the exact final head must pass at minimum:

- `Quality Gate / quality`;
- `Platform Production Readiness Contract / platform-production`;
- `Auth Integration Contract / auth-contract`;
- relevant path-scoped browser/Auth contracts triggered by the final diff.

The Platform production contract must prove with real MySQL:

- executable workspace build;
- focused Platform/Auth unit contracts, including fatal-process observation lifecycle;
- two simultaneously running HTTP replicas sharing the same Auth authority;
- `/healthz` and `/readyz` behavior;
- correlation/release headers;
- cross-replica session revocation;
- readiness transition to `503` before listener drain;
- clean bounded shutdown observations.

A cancelled/not-started workflow is not passing evidence.

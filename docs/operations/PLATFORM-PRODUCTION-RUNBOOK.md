# Morro Digital — Platform Production Runbook

Status: canonical operational runbook for the Morro Digital HTTP runtime.
Scope: Platform health/readiness, deploy, shutdown, rollback, observability, Auth production hardening and basic incident/recovery.

This runbook does not redefine Business, CRM, Ordering, Payments, Financial, Ticketing or Affiliates authority.

## 1. Runtime contracts

### Liveness — `GET /healthz`

`/healthz` answers whether the Node HTTP process and listener are alive. A live process returns HTTP `200` even when the instance must not receive production traffic.

The response includes:

- `status: live`;
- service identity;
- release identity;
- observation time.

Do not use liveness as a traffic-admission check. A database/provider failure must not create a restart loop when the process itself is healthy.

### Readiness — `GET /readyz`

`/readyz` returns the canonical `PLATFORM-HEALTH-SNAPSHOT` v1 payload.

- HTTP `200`: `readiness=ready`;
- HTTP `503`: `readiness=not_ready`.

Critical `fail` checks remove the instance from readiness. Non-critical provider `warn` checks degrade the snapshot without removing readiness.

Current critical checks include:

- HTTP listener;
- shutdown traffic-admission state;
- Auth security-state authority.

### Correlation and release headers

Every HTTP response carries:

- `X-Correlation-ID`;
- `X-Release-SHA`;
- `X-Release-Version`;
- `X-Deployment-ID`.

A bounded, syntactically valid inbound `X-Correlation-ID` is propagated. Invalid/missing IDs are replaced with a server-generated correlation ID.

Release values are injected through:

- `MORRO_RELEASE_SHA` (or `GITHUB_SHA` as a CI fallback);
- `MORRO_RELEASE_VERSION`;
- `MORRO_DEPLOYMENT_ID`.

Production deployment tooling must provide immutable values. `unknown` is operationally valid for local development only.

## 2. Canonical observation sink

Runtime observations are created exclusively through the existing `createPlatformObservation` contract and emitted as one JSON record per line to stdout:

```json
{ "contract": "PLATFORM-OBSERVATION", "contractVersion": 1, "observation": {} }
```

The process does not introduce a second observability schema. The platform/collector layer may route stdout JSON to the chosen log/metric/alert backend.

Operational names currently emitted include:

- `platform.runtime.started`;
- `platform.runtime.stopped`;
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

Never log credentials, session cookies, CSRF tokens, provider secrets, raw password material, raw session IDs or raw login limiter keys.

## 3. Provider degradation

Weather providers are non-critical Platform dependencies.

- Visual Crossing failure emits a degraded observation and permits Open-Meteo fallback.
- Open-Meteo failure emits a degraded observation.
- Serving a bounded stale weather cache emits `weather-runtime` degradation.
- Recovery emits a recovery observation and clears the degraded readiness warning.

Provider degradation is therefore visible without incorrectly converting a non-critical dependency into platform unavailability.

## 4. Auth production hardening

### Shared rate-limit and revocation authority

Production Auth requires `AUTH_DATABASE_URL`.

The canonical Auth server owns two idempotently-created MySQL state tables:

- `auth_login_rate_limits`;
- `auth_session_revocations`.

All active replicas must point to the same durable Auth authority. Rate-limit and revocation keys are SHA-256 namespaced digests; raw client IPs and raw session IDs are not persisted in those tables.

If the durable authority is absent or unavailable:

- Auth fails closed;
- `/readyz` returns `503`;
- login/session/logout authority is not replaced by process-local state.

Process-local Auth security state is development/test only.

The runtime uses the direct socket peer address as the login limiter key and intentionally does not trust arbitrary `X-Forwarded-For` input. Production ingress must preserve the intended client-source semantics at the trusted network boundary.

### Admin global tenant authority

The canonical Auth role model still defines `admin` as global tenant authority. Production does not silently enable that exceptional authority.

If configured users include `admin`, set:

`DASHBOARD_ADMIN_GLOBAL_BYPASS_CONFIRMED=true`

only after explicitly approving the global scope. Without the confirmation the Auth readiness check fails closed. Every actual admin access outside its listed business scopes emits `dashboard.admin_global_tenant_bypass` through the security audit observation.

Prefer scoped `owner`/`manager` accounts when global admin authority is unnecessary.

### CSP

The production HTTP runtime does not permit unrestricted inline script execution:

- `script-src` omits `'unsafe-inline'`;
- `script-src-attr 'none'` blocks inline event-handler attributes;
- legacy static import maps that still bridge preserved browser modules are allowed only through explicit SHA-256 CSP hashes matching their exact immutable JSON bytes;
- the login surface no longer depends on an inline import map and loads its Auth browser runtime from a same-origin module URL.

An edit to a hashed legacy import map invalidates its CSP authorization until the exact new content is reviewed and a replacement hash is deliberately approved. Do not add `'unsafe-inline'` to make an import-map or browser regression disappear.

`style-src 'unsafe-inline'` remains a documented compatibility residual because the preserved V1 UI still contains inline styles. Do not weaken script CSP to accommodate UI code. Remove the style residual only when those legacy inline styles are migrated without visual-regression risk.

## 5. Deploy procedure

1. Confirm the exact source SHA and immutable artifact/image being deployed.
2. Confirm the target environment has the required domain databases/providers configured by their owning runbooks.
3. Configure Auth production authority:
   - `AUTH_DATABASE_URL` points to the shared durable MySQL authority;
   - `DASHBOARD_AUTH_SECRET` is strong and server-only;
   - `DASHBOARD_AUTH_ORIGIN` is the exact HTTPS origin;
   - `DASHBOARD_USERS_JSON` is valid;
   - global admin confirmation remains `false` unless explicitly approved.
4. Inject `MORRO_RELEASE_SHA`, `MORRO_RELEASE_VERSION` and `MORRO_DEPLOYMENT_ID`.
5. Keep `MORRO_ROLLBACK_FROM_SHA` empty for a normal forward deploy.
6. Start the new instance/revision.
7. Probe `/healthz`; require HTTP `200` and verify release headers.
8. Probe `/readyz`; require HTTP `200`, `readiness=ready`, and the expected release identity.
9. Confirm a canonical `platform.runtime.started` observation exists for the deployed release.
10. Admit the revision to production traffic only after readiness passes.

Recommended smoke commands:

```bash
curl -fsS -D /tmp/health.headers https://HOST/healthz
curl -fsS https://HOST/readyz
```

Inspect `X-Release-SHA` and `X-Correlation-ID` in the response headers.

## 6. Graceful shutdown

On `SIGTERM` or `SIGINT`:

1. the runtime immediately changes shutdown readiness to `not_ready`;
2. `/readyz` starts returning `503` while `/healthz` remains live;
3. normal application traffic receives `503 SERVICE_DRAINING`;
4. the runtime waits `PLATFORM_SHUTDOWN_READINESS_DELAY_MS` so the load balancer can observe the transition;
5. the HTTP listener begins draining;
6. drain is bounded by `PLATFORM_SHUTDOWN_DRAIN_TIMEOUT_MS`;
7. timeout emits a critical observation and remaining connections are forcibly closed;
8. Auth/CRM/Payments runtime stop results are collected and failures are observed;
9. shutdown completion is observed before process exit.

Defaults:

- readiness transition delay: `5000 ms` in production, `0 ms` outside production;
- HTTP drain timeout: `15000 ms`.

Do not configure an unbounded drain.

## 7. Rollback procedure

Rollback means deploying a previously verified immutable artifact; it does not mean editing production files in place.

1. Record the unhealthy/current release SHA (`BAD_SHA`).
2. Select the last verified healthy artifact and SHA (`GOOD_SHA`).
3. Deploy that immutable artifact with:
   - `MORRO_RELEASE_SHA=GOOD_SHA`;
   - `MORRO_RELEASE_VERSION=<healthy release version>`;
   - `MORRO_DEPLOYMENT_ID=<new rollback deployment id>`;
   - `MORRO_ROLLBACK_FROM_SHA=BAD_SHA`.
4. Require `/healthz=200`.
5. Require `/readyz=200` and `readiness=ready` before shifting traffic.
6. Confirm `platform.release.rollback_activated` contains `fromReleaseSha=BAD_SHA` and `toReleaseSha=GOOD_SHA`.
7. Confirm correlation/release headers show `GOOD_SHA` on user-facing traffic.
8. Preserve the failed release evidence for incident analysis; do not delete it to hide the rollback.

Clear `MORRO_ROLLBACK_FROM_SHA` on the next normal forward release.

## 8. Basic incident and recovery

### `/healthz` fails

Treat as process/listener failure. Inspect process/container state, startup failure, port binding and the most recent runtime observations. Restart only after identifying whether the failure is process-level rather than dependency-level.

### `/healthz=200`, `/readyz=503`

Read `checks[]` from the health snapshot.

- `auth-security-state`: verify MySQL reachability, credentials/TLS, schema permissions and `AUTH_DATABASE_URL` consistency across replicas.
- `shutdown-readiness`: the instance is draining; do not re-admit it.
- `http-listener`: listener state is invalid; inspect runtime lifecycle.

Do not bypass readiness by routing traffic directly to an unhealthy instance.

### Weather degraded, readiness stays ready

Inspect `platform.provider.degraded` and provider/network health. The warning is intentionally non-critical. Restore provider reachability; recovery will clear the warning.

### Auth database outage

Do not switch production to in-memory rate limiting/revocation. Restore the durable authority or rollback to a release/environment with a valid authority. Production Auth remains fail-closed by design.

### Drain timeout/failure

Use the shutdown correlation ID to group:

- readiness transition;
- drain start;
- timeout/failure;
- runtime stop result;
- completion.

Determine whether a long-lived HTTP connection, downstream close operation or database pool stop prevented clean termination. Correct the cause before increasing timeouts.

## 9. Release acceptance checklist

A release is operationally acceptable only when:

- Quality Gate passes;
- relevant permanent contracts pass;
- `/healthz` passes;
- `/readyz` passes;
- release headers identify the intended immutable artifact;
- canonical startup observations are present;
- production Auth uses shared durable security state;
- no unapproved global admin authority is enabled;
- rollback artifact and procedure are known before traffic promotion.

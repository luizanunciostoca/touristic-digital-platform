# Platform Production Readiness Evidence — revalidated 2026-08-17

Scope: horizontal Platform/Health/Readiness/Observability/Security/Quality/CI/governance preparation only.

This document distinguishes implemented/static evidence from CI/runtime evidence that is still pending because GitHub Actions is temporarily unavailable.

## Source-of-truth baseline

- target repository: `luizidebook/touristic-digital-platform`;
- target PR: `#268`, branch `chore/platform-production-readiness-final`;
- base is `main`;
- final merge is forbidden until the exact final head receives official checks;
- Ticketing/Payments product authority is not redefined by this Platform work.

## Implemented Platform gaps

| Gap | Current implementation |
| --- | --- |
| Liveness | `GET /healthz` returns HTTP process liveness and release identity. |
| Readiness | `GET /readyz` returns canonical `PLATFORM-HEALTH-SNAPSHOT` v1 and maps critical failure to HTTP 503. |
| Production release identity | `release-identity` is critical; production is not ready without SHA, version and deployment ID. |
| Correlation ID | bounded valid inbound `X-Correlation-ID` is propagated; invalid/missing input is replaced by a server-generated ID. |
| Canonical observations | runtime uses `createPlatformObservation` and emits a single `PLATFORM-OBSERVATION` JSON-line envelope. |
| Runtime fatal failures | production installs an `uncaughtExceptionMonitor` observer while listening and emits `platform.runtime.fatal_failure` without suppressing Node crash semantics. |
| Provider degraded/recovered | weather primary/fallback/stale transitions emit non-critical degraded/recovered observations. |
| Shutdown readiness | signal moves readiness to `not_ready` before listener drain. |
| Bounded drain | configurable timeout emits failure evidence and forcibly closes remaining connections when necessary. |
| Release/rollback visibility | response headers and observation attributes carry release identity; rollback startup carries from/to SHA evidence. |
| Auth shared security state | production requires durable MySQL state for login rate limits and session revocation; unavailable state fails closed. |
| HTTP/static boundary | serving is restricted to approved static roots and package `dist`; repository-private/source paths remain outside the public boundary. |

## Auth durable/shared authority

`services/auth/src/security-state.ts` owns the shared security-state contract:

- `auth_login_rate_limits`;
- `auth_session_revocations`;
- SHA-256 namespaced limiter/session keys;
- transactional login consumption with row locking;
- durable session revocation;
- fail-closed errors.

Focused unit coverage now proves:

- in-memory policy behavior for development/test;
- idempotent SQL schema initialization;
- durable row-lock/commit behavior;
- rollback/release on SQL authority failure.

The new `Platform Production Readiness Contract` is prepared to provide the still-missing real MySQL runtime proof with two HTTP replicas sharing the same Auth authority, including cross-replica revocation. It has **not** yet passed and must not be represented as passing evidence until Actions executes successfully.

## CSP/browser hardening truth

The previous evidence overstated CSP closure. Current executable truth is:

- dashboard login and redirect bootstraps were moved to same-origin module files;
- Platform appends the reviewed import-map hashes to `script-src`;
- Platform injects `script-src-attr 'none'` to reject inline event-handler attributes;
- preserved V1/CRM browser shells still require the existing literal `script-src 'unsafe-inline'` compatibility token for inline import-map compatibility;
- `style-src 'unsafe-inline'` also remains for preserved V1 styling.

Therefore this PR does **not** claim literal removal of script `'unsafe-inline'`. Removing that compatibility residual requires migration and browser validation of every preserved import map before the token can be safely deleted.

## Payments/Ticketing scope reconciliation

Platform must await asynchronous domain route handlers so rejected promises reach the central HTTP failure boundary. Those await/integration changes are allowed horizontal integration; they do not change domain business authority.

Unrelated Payments workflow/path noise and an inherited Financial import in Business onboarding were removed from the PR during this revalidation.

The remaining Payments browser-contract workflow adjustment exists only to exercise the browser client through the real served page/CSP boundary; it must pass when Actions returns.

Ticketing remains lazy-loaded and retains current-main domain authority. Platform only preserves its route/runtime lifecycle integration and awaits its asynchronous handler.

## Production release identity

Production readiness now fails closed if any immutable identity component is absent:

- `MORRO_RELEASE_SHA` (with `GITHUB_SHA` accepted as SHA fallback when present);
- `MORRO_RELEASE_VERSION`;
- `MORRO_DEPLOYMENT_ID`.

This prevents an unidentified revision from becoming `ready` even if the listener and Auth state are otherwise healthy.

## Runtime failure visibility

Handled HTTP route failures emit `platform.http.unhandled_failure` before returning the bounded 500 response.

Fatal process failures are observed with Node's `uncaughtExceptionMonitor` only while the production runtime is listening. The observer emits `platform.runtime.fatal_failure` with release/deployment identity, origin and bounded error metadata. It deliberately does not register an `uncaughtException` recovery handler, so Node's normal fatal termination behavior remains authoritative.

Focused Platform unit coverage exercises monitor installation, fatal observation emission for an `unhandledRejection` origin and listener removal on runtime stop.

## Graceful shutdown

Implemented sequence:

1. signal marks shutdown readiness `not_ready`;
2. `/readyz` becomes 503 while the listener remains available during the configured convergence delay;
3. application traffic is rejected as `SERVICE_DRAINING`;
4. listener drain begins;
5. drain is bounded by `PLATFORM_SHUTDOWN_DRAIN_TIMEOUT_MS`;
6. timeout/failure emits canonical observations and remaining sockets are forced closed;
7. Auth/CRM/Payments and materialized Ticketing runtime stops are collected;
8. stop failures affect exit status and emit observations;
9. shutdown completion/runtime-stop evidence is emitted before process exit.

## Static validations performed during this revalidation

Performed through the GitHub source-of-truth connector and direct code review:

- main/head/mergeability comparison;
- full PR changed-file inventory;
- complete PR patch review and targeted file-level patch review;
- current Ticketing integration review;
- current Payments integration/browser-contract review;
- current CSP/header/browser bootstrap review;
- current Auth contracts/security-state review;
- removal of unrelated inherited changes;
- focused Platform unit-test addition, including fatal-process observation lifecycle;
- focused durable Auth security-state test expansion;
- new path-scoped production-readiness workflow prepared for later execution;
- workflow YAML parse and shell syntax validation outside Actions;
- runbook reconciled against executable behavior;
- formatting-only EOF normalization for modified Payments/Ticketing integration files.

A direct local clone/install could not be used in this environment because outbound GitHub/DNS access from the local container is unavailable and `pnpm` is not installed there. This limitation is not converted into a passing test claim.

## Pending official evidence

When Actions becomes available, the exact final PR head must run and pass:

1. `Quality Gate / quality` — format, architecture, Feature Registry, lint, typecheck, test, build;
2. `Platform Production Readiness Contract / platform-production` — MySQL, two-replica shared Auth, probes, release/correlation identity and graceful shutdown;
3. `Auth Integration Contract / auth-contract`;
4. relevant Business Auth / CRM Platform Auth path-scoped contracts triggered by the final diff;
5. Payments browser checkout contract because the CSP/browser exercise path is changed;
6. any repository security/supply-chain checks that are configured to run for the final head.

Cancelled, blocked, skipped-required or absent checks are not acceptance evidence.

## Promotion rule

Do not merge #268 while Actions is unavailable.

Promotion becomes permissible only when:

- PR remains 0-behind against current `main`;
- GitHub reports it mergeable;
- exact-head required checks have completed successfully;
- no new domain-authority regression appears in the final compare;
- the final head SHA is the same SHA whose checks are being accepted.

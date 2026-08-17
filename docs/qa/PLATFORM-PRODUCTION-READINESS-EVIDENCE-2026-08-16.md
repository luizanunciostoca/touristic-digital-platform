# Platform Production Readiness Evidence — revalidated 2026-08-17

Scope: horizontal Platform/Health/Readiness/Observability/Security/Auth production hardening and the dedicated Platform production-readiness contract. Canonical CI/Quality/Repository Governance work belongs to PR #286 and is intentionally not duplicated here.

This document distinguishes implemented/static evidence from CI/runtime evidence that is still pending because GitHub Actions is temporarily unavailable.

## Source-of-truth baseline

- target repository: `luizidebook/touristic-digital-platform`;
- target PR: `#268`, branch `chore/platform-production-readiness-final`;
- base is `main`;
- final merge is forbidden until the exact final reconciled head receives official checks;
- Ticketing/Payments product authority is not redefined by this Platform work;
- PR #286 is the canonical CI/Quality/Repository Governance recovery workstream and must be promoted first after Actions is restored.

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
| Shutdown exit semantics | after all stop/completion observations, runtime assigns `process.exitCode` and allows natural process termination instead of forcing immediate `process.exit()`. |
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

Ticketing remains lazy-loaded and retains current-main domain authority. Platform only preserves its route/runtime lifecycle integration and awaits its asynchronous handler. Existing Ticketing M147/M148 workflows do not path-match `ticketing-api.mjs`; because no Ticketing business rule changes here, the integration adapter is instead explicitly covered by the Platform production-readiness path filter plus global Quality.

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
9. shutdown completion/runtime-stop evidence is emitted;
10. `process.exitCode` is assigned and Node is allowed to terminate naturally after remaining synchronous/asynchronous handles are drained.

The Platform production-readiness contract waits for each process after `SIGTERM`, so an unexpected lingering handle will fail/hang within the workflow timeout rather than being hidden by forced process termination.

## Pre-CI coordination and scope cleanup

The defensive audit found a live CI/Governance workstream in PR #286. To avoid competing sources of truth:

- the one-line `quality.yml` change was restored to current `main` in #268;
- the duplicate `REPOSITORY-GOVERNANCE-PREPARATION.md` file was removed from #268;
- #286 remains sole current owner of the pending canonical Quality/governance changes;
- #268 remains owner of the stronger Platform production-readiness contract;
- after #286 merges, #268 must be reconciled onto the resulting `main` before its exact-head gates are accepted.

The Platform workflow path filters were expanded symmetrically for pull requests and pushes so its runtime contract follows the horizontal integration files actually owned by this PR, including Business/CRM/Payments/Ticketing adapters, dashboard login bootstrap and Core-runtime preparation.

## Static validations performed during this revalidation

Performed through the GitHub source-of-truth connector and direct code review:

- repeated `main`/head/mergeability comparison;
- full PR changed-file inventory and complete patch review;
- current Ticketing integration/workflow-path review;
- current Payments integration/browser-contract review;
- current CSP/header/browser bootstrap review;
- current Auth contracts/security-state review;
- no `X-Forwarded-For` trust added to the PR diff;
- no inline `onclick=` handler added to the PR diff;
- removal of unrelated inherited and now-duplicated CI/governance changes;
- focused Platform unit-test addition, including fatal-process observation lifecycle;
- focused durable Auth security-state test expansion;
- path-scoped production-readiness workflow prepared for later execution and expanded to all owned integration boundaries;
- workflow YAML/shell structure re-reviewed after the trigger change; the executable shell body is unchanged from the previously parsed/`bash -n`-validated version;
- runbook reconciled against executable behavior;
- EOF normalization for modified Payments/Ticketing integrations and final `dev-server.mjs` rewrite;
- final `dev-server.mjs` patch contains natural-exit semantics and no `No newline at end of file` marker.

A direct local clone/install could not be used in this environment because outbound GitHub/DNS access from the local container is unavailable and `pnpm` is not installed there. This limitation is not converted into a passing test claim. Full formatting, lint, typecheck, test, build and production runtime execution remain official-gate evidence, not static-review evidence.

## Pending official evidence

After GitHub Actions is restored, promotion order is:

1. promote PR #286 through its exact-head recovery/Quality procedure;
2. rebase/reconcile #268 onto the resulting exact `main` and require `behind_by=0` plus mergeable state;
3. run and pass on that exact reconciled #268 head:
   - `Quality Gate / quality` — format, architecture, Feature Registry, lint, typecheck, test, build;
   - `Platform Production Readiness Contract / platform-production` — MySQL, two-replica shared Auth, probes, release/correlation identity and graceful shutdown;
   - `Auth Integration Contract / auth-contract`;
   - Auth Login browser contract;
   - relevant Business Auth / CRM Platform Auth path-scoped contracts;
   - Payments browser checkout contract because the CSP/browser exercise path is changed;
   - any repository security/supply-chain checks configured to run for the exact final head.

Cancelled, startup-failed, historical, skipped-required or absent checks are not acceptance evidence.

## Promotion rule

Do not merge #268 while Actions is unavailable.

Current pre-CI state is `CODE FREEZE / WAITING_FOR_CI`.

Promotion becomes permissible only when:

- PR #286 has first been promoted and current `main` revalidated;
- #268 is reconciled and remains 0-behind against that current `main`;
- GitHub reports it mergeable;
- exact-head required checks have completed successfully;
- no new domain-authority regression appears in the final compare;
- the final head SHA is the same SHA whose checks are being accepted.

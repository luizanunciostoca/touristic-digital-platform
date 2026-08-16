# Platform Production Readiness Evidence — 2026-08-16

Scope: horizontal Platform/Health/Readiness/Observability/Security/Quality/CI/governance preparation only.

## Baseline reconciled

- PR #251 is merged and remains the canonical health/readiness contract source.
- PR #250 is merged and its documented residual security risks were revalidated against current runtime code rather than assumed.
- Issue #240 remains the CI optimization reference; current Quality Gate already implements the important draft-fast/full-promotion split, concurrency cancellation and bounded execution.
- No alternate Platform health or observation schema was introduced.

## Platform gaps

| Gap                                   | Result | Evidence                                                                                                                                     |
| ------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Real liveness HTTP                    | closed | `GET /healthz` returns process/listener liveness and release identity.                                                                       |
| Real readiness HTTP                   | closed | `GET /readyz` returns canonical `PLATFORM-HEALTH-SNAPSHOT`; critical failures return 503.                                                    |
| HTTP correlation propagation          | closed | valid inbound `X-Correlation-ID` is propagated; otherwise server generates one; response always includes the ID.                             |
| Canonical observation sink            | closed | runtime emits canonical `createPlatformObservation` records as JSON lines marked `PLATFORM-OBSERVATION`.                                     |
| Degraded provider observations        | closed | weather primary/fallback/stale/unavailable transitions emit degraded/recovered observations as non-critical warnings.                        |
| Shutdown readiness transition         | closed | signal changes readiness to `not_ready` before listener drain.                                                                               |
| Bounded HTTP drain/failure visibility | closed | configurable drain timeout, forced connection close and critical/failure observations.                                                       |
| Release identity visibility           | closed | release SHA/version/deployment ID response headers and observation attributes.                                                               |
| Rollback observations                 | closed | rollback startup emits `platform.release.rollback_activated` with from/to release SHA.                                                       |
| Canonical Core runtime consumption    | closed | `@touristic/core` keeps TypeScript types on `src` while Node executes built `dist` output, matching executable workspace package boundaries. |

## Security residuals from #250

### CSP `'unsafe-inline'`

**Unrestricted script risk closed.** `script-src` no longer contains `'unsafe-inline'` and `script-src-attr 'none'` blocks inline event-handler attributes.

The hardened policy initially exposed a real compatibility gap: the login surface still depended on an inline import map. The login now loads the Auth browser runtime from a same-origin module URL and no longer needs that inline map. Preserved Business/CRM browser shells that still use static import maps are authorized only by three explicit SHA-256 CSP hashes matching the exact reviewed JSON bytes; modifying those bytes invalidates authorization instead of falling back to `'unsafe-inline'`.

**Style compatibility residual remains explicit.** `style-src 'unsafe-inline'` is still required by preserved V1 inline styles. It is not being hidden or expanded to scripts. Removing it requires a UI style migration with visual-equivalence evidence and is outside this production-hardening change.

### Login rate limiting was process-local

**Production gap closed.** Auth now uses a shared durable MySQL security authority in production. Login limiter keys are hashed and consumption is serialized transactionally with row locking. Missing/unavailable durable state fails readiness and Auth closed.

Process-local security state remains development/test only.

### Logout revocation was process-local

**Production gap closed.** Session revocations are persisted in the same shared Auth authority and checked for every authenticated session resolution. Database failures deny authority rather than accepting the token.

The Auth integration contract now starts two HTTP replicas against the same MySQL authority and proves that a session revoked by one replica is rejected by the other.

### Admin global tenant bypass

**Canonical role semantics preserved; accidental production enablement closed.** The underlying Auth contract still defines `admin` as global tenant authority. Production refuses readiness when an admin is configured unless `DASHBOARD_ADMIN_GLOBAL_BYPASS_CONFIRMED=true` is explicitly set. Every cross-scope use emits a security audit observation.

This avoids silently changing the canonical Auth role contract while making exceptional global authority an explicit operator decision.

## CI / Issue #240 reconciliation

No broad workflow rewrite was justified.

Preserved:

- draft-fast Quality Gate;
- full tests/build for ready PRs and `main`;
- permanent MySQL contracts;
- permanent Chromium/browser contracts;
- architecture and feature-registry checks;
- frozen lockfile installation.

Changed:

- canonical Quality job explicitly named `quality`;
- Auth contract explicitly named `auth-contract`, bounded to 15 minutes and given concurrency cancellation;
- existing Auth HTTP contract reused for MySQL multi-replica, Platform probes/CSP/correlation/release/shutdown tests instead of introducing another heavy workflow;
- direct Morro Digital app builds ensure the Core runtime artifact exists, while full workspace builds reuse an already-current Core artifact instead of compiling it twice.

No test or coverage step was removed to save Actions minutes.

## Governance preparation

Repository rulesets were observed empty. The connected integration cannot access classic branch-protection administration, so no unsafe governance write was attempted.

Existing `.github/CODEOWNERS` is valid and owned by `@luizidebook`.

The exact owner-side ruleset procedure is documented in `docs/operations/REPOSITORY-GOVERNANCE-PREPARATION.md`. The globally required status context should be `quality`; path-scoped heavy contracts must not be made global required contexts while they do not run on every pull request.

## Validation contract

Required acceptance evidence for this change:

1. non-draft `quality` succeeds (format, architecture, Feature Registry, lint, typecheck, all tests, build);
2. `auth-contract` succeeds with MySQL service and two replicas;
3. Auth login browser contract succeeds under the hardened CSP;
4. Business Auth and CRM Platform Auth permanent contracts remain green, proving the async shared-Auth composition does not alter their product authority;
5. no changed functional Business/CRM/Payments/Ticketing/Affiliates behavior beyond consumption of the hardened horizontal Platform/Auth boundary;
6. PR remains unmerged for coordinator review.

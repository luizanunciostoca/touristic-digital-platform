# Morro Digital V2 — Final Release Runbook

Status: **PRE-RELEASE / NO-GO until mandatory evidence exists**  
Role: release-engineering coordinator for the final V2 promotion  
Audit baseline: `main@ec4f51e0198cdeed51b37fabe5ed94ebb2e3ecb6` on 2026-08-17

This runbook coordinates release preparation only. It does not promote any Feature to `released`, does not replace exact-head GitHub Actions evidence, and does not authorize production activation while a mandatory gate or external validation is missing.

## 1. Canonical release truth

Authority order remains:

1. `docs/features/registry.json`;
2. `docs/migration/MASTER-MIGRATION-TRACKER.md`;
3. current per-domain migration matrices;
4. exact-head code/PR diff and executable QA evidence;
5. release/rollback runbooks;
6. historical milestone evidence.

At this checkpoint:

| Feature | Canonical lifecycle truth | Release interpretation |
| --- | --- | --- |
| FEATURE-0001 Map | `equivalent` | not released |
| FEATURE-0002 Search | `equivalent` | not released |
| FEATURE-0003 Navigation | `equivalent` | not released |
| FEATURE-0004 Assistant | `equivalent` | not released |
| FEATURE-0005 Business | `equivalent` | not released |
| FEATURE-0006 CRM | `equivalent` | not released |
| FEATURE-0007 Design System | `equivalent` | not released |
| FEATURE-0008 Auth | `equivalent` | not released |
| FEATURE-0009 Payments / Subscription | `migrating` — 30 PASS / 3 PARTIAL / 0 GAP / 1 N/A | release blocker unless the remaining approved criteria are closed |
| FEATURE-0010 Affiliates | `planned`; MIG-0011 `discovered` — 15 PASS / 10 PARTIAL / 0 GAP / 2 N/A on the active foundation branch | not release-equivalent; no production activation |
| FEATURE-0011 Ticketing | `equivalent` | activation still requires release evidence |

No Feature is currently `released`.

## 2. Current integration queue

The final integration queue must be revalidated immediately before every promotion. The current release-engineering order is:

1. **PR #286 — CI / Quality / repository governance preparation**.
2. **PR #285 — workflow supply-chain and permanent contract-trigger hardening**, after retarget/rebase onto the main that contains #286.
3. **PR #268 — Platform production-readiness hardening**, after retarget/rebase onto the new main.
4. **PR #264 — Affiliates canonical policy/domain foundation**, after retarget/rebase onto the new main and only after its exact-head required gates are green.
5. **PR #288 — final documentary truth**, after it is rebased/retargeted onto the actual merged #264 head and all status/SHA references are reconciled.
6. **This release-engineering PR last**, rebased onto the resulting main and updated to the final immutable release candidate SHA.

Why #285 precedes #268: #285 hardens the workflow supply chain and path-scoped domain/browser triggers that are then used as promotion evidence for the later runtime changes.

PR #288 is currently a stacked documentary PR whose recorded Affiliate base predates the current #264 head. It must not be promoted without reconciliation.

## 3. Non-negotiable release rules

- Never count `startup_failure`, cancelled, skipped, absent, historical, or different-SHA runs as passing evidence.
- Never merge a critical runtime/security/financial change solely because static review looks correct.
- Every PR must be 0-behind its current base and mergeable immediately before running its final gates.
- After every merge, re-read the main SHA and re-run the gates required for the new main state.
- Production artifacts must be immutable and tied to one exact source SHA.
- Database changes are expand-first. Durable financial/ticketing/audit history is never deleted as rollback.
- Browser/provider redirects and command acceptance are never payment authority.
- Affiliates may not create its own payout, wallet, payment, settlement, ledger or monetary authority.
- Production readiness requires infrastructure/provider evidence in addition to repository CI.

## 4. Release checklist

### Repository and candidate identity

- [ ] Freeze the intended final scope and confirm no unreviewed feature work is entering the release train.
- [ ] Re-read `main` and record exact SHA.
- [ ] Confirm every release PR is 0-behind, mergeable and based on the intended predecessor.
- [ ] Confirm Feature Registry, Master Tracker and every current migration matrix agree.
- [ ] Confirm no open superseded/stale PR is being used as release authority.
- [ ] Confirm `pnpm@10.15.0`, Node 22 and frozen lockfile install are the release toolchain.
- [ ] Create immutable RC version, artifact/image identifier and deployment identifier.
- [ ] Record artifact digest/hash in the release evidence.

### Quality and contracts

- [ ] `Quality Gate / quality` green on every exact final PR head.
- [ ] `Quality Gate / quality` green on the resulting exact main SHA.
- [ ] `Release Promotion Gate / release / smoke` green with `expected_sha=<exact current main SHA>`.
- [ ] All changed-domain contract workflows green on the exact relevant head.
- [ ] All changed browser contracts green on the exact relevant head.
- [ ] Platform Production Readiness Contract green on #268/final integrated head.
- [ ] Supply-chain checker is strict and all third-party workflow actions are immutable-SHA pinned.

### Configuration and infrastructure

- [ ] Reconcile `.env.example` with `V2-ENVIRONMENT-INVENTORY.md` before cutting the RC.
- [ ] Validate secrets are stored only in the deployment secret manager/runtime environment.
- [ ] Validate production origins/URLs are exact HTTPS values.
- [ ] Validate database users are least privilege and TLS-protected.
- [ ] Prove actual deployment topology: replica count, ingress/proxy behavior, database endpoints and persistent storage.
- [ ] If Payments is multi-replica, provide the required shared/distributed rate limiter before claiming production safety.
- [ ] OpenAI paid-provider runtime remains exactly one replica until a distributed atomic governance store exists.
- [ ] Confirm durable OpenAI governance state path is persistent and not shared concurrently by multiple active paid replicas.
- [ ] Confirm backup/restore readiness for every database affected by the release.

### Migrations

- [ ] Take/verify pre-migration backups or equivalent recovery points.
- [ ] Apply only reviewed additive schema changes.
- [ ] Validate schema state and application read compatibility before any feature activation.
- [ ] Keep Ticketing disabled during initial schema/deploy validation.
- [ ] Do not create an Affiliate schema: none exists in the current approved implementation.
- [ ] Preserve all Payment, verified outcome, ledger, refund, reconciliation, settlement, Order, Reservation, Ticket and audit history during rollback.

### Staging / production-candidate validation

- [ ] Start candidate with zero production traffic.
- [ ] `/healthz` returns 200 for the exact release identity.
- [ ] `/readyz` returns 200 and every critical check passes.
- [ ] Response headers expose expected `X-Release-SHA`, `X-Release-Version`, `X-Deployment-ID` and a valid `X-Correlation-ID`.
- [ ] `platform.runtime.started` is observed with the same release/deployment identity.
- [ ] Browser smoke matrix passes.
- [ ] Provider E2E matrix passes for every provider required by release scope.
- [ ] Payments deployed third-party sandbox/browser E2E is evidenced before Payments equivalence/production claims.
- [ ] Production observability sink, dashboards and alert routing are live before traffic shift.
- [ ] Rollback artifact and rollback configuration are ready and verified.

### Go / No-Go

- [ ] No mandatory gate is missing.
- [ ] No required provider validation is missing.
- [ ] No unresolved critical/high security issue is accepted silently.
- [ ] No migration/rollback incompatibility exists.
- [ ] On-call owner and rollback authority are named.
- [ ] All known risks are explicitly accepted by the release owner.
- [ ] Final decision and evidence index are recorded.

## 5. Migration order

The ordering below is intentionally dependency-first and expand-first. Exact schema commands must be taken from the integrated release candidate, not copied from an older SHA.

### Phase A — backup and compatibility proof

1. Freeze exact RC SHA/artifact.
2. Verify backups/recovery points for CRM, Auth security state, Ordering, Financial and Ticketing databases.
3. Validate the previous production runtime can safely coexist with the additive schema where rolling deployment requires overlap.

### Phase B — additive database expansion

1. **CRM**: apply the cumulative canonical chain M71 → M90 → M94 → M95 → M99 where not already present.
2. **Ordering**: apply M137 → M139 → M151 first; this establishes Orders, checkout access, Subscription and renewal-intent durability.
3. **Financial**: apply M137 → M141 → M142 → M144 → M145; preserve all existing financial history.
4. **Ordering Ticketing bridge/reservation expansion**: apply the approved Ticketing Order binding/reservation schema after base Ordering is valid.
5. **Ticketing**: apply M147 → M150 Reservation → Financial bridge → public API schema.
6. **Auth durable security state**: allow the production Auth runtime to idempotently ensure its shared `auth_login_rate_limits` and `auth_session_revocations` tables against `AUTH_DATABASE_URL`; readiness must remain fail-closed if this authority cannot initialize.
7. **Affiliates**: no migration. The current foundation intentionally has no Affiliate DB migration/persistence and must not be activated as if it did.

If the integrated candidate changes these chains, stop and re-audit the release order before proceeding.

## 6. Deploy order

1. Provision validated environment configuration and secrets without enabling optional write paths.
2. Apply the additive schemas above.
3. Deploy the immutable application artifact with:
   - `MORRO_RELEASE_SHA=<exact RC SHA>`;
   - `MORRO_RELEASE_VERSION=<immutable release version>`;
   - `MORRO_DEPLOYMENT_ID=<new deployment id>`;
   - `MORRO_ROLLBACK_FROM_SHA` empty for forward deploy.
4. Start the candidate with no production traffic.
5. Verify `/healthz`, release headers, `/readyz`, critical readiness checks and `platform.runtime.started`.
6. Run read-only/domain-safe smoke checks.
7. Run authenticated browser smoke checks in staging/production-candidate mode.
8. Run Payments provider E2E in the approved sandbox, never by treating redirects as authority.
9. Keep Ticketing disabled initially; validate DB connectivity and canonical Payments route first.
10. Enable Ticketing only after its safe end-to-end fixture passes.
11. Keep Affiliate runtime activation absent until its current PARTIAL rows are genuinely closed and it has persistence/application/API/security evidence.
12. Shift traffic progressively only after the final Go decision.

## 7. Rollback order

Rollback is disable-first and data-preserving.

1. Stop traffic expansion and freeze further activation changes.
2. Disable Ticketing mutations first with `TICKETING_FEATURE_ENABLED=false` when Ticketing is implicated; keep canonical Payments webhook/reconciliation processing available for in-flight financial state.
3. Stop new Business → Payments checkout starts when Payments is implicated; keep safe status/webhook/reconciliation paths for already-created operations.
4. Stop recurrence execution/provider command invocation; preserve Subscription and renewal-intent claims.
5. Mark the bad deployment identity and select the last verified immutable `GOOD_SHA` artifact.
6. Redeploy `GOOD_SHA` with a **new** deployment ID and `MORRO_ROLLBACK_FROM_SHA=<BAD_SHA>`.
7. Require `/healthz=200` and `/readyz=200` before traffic admission.
8. Confirm `platform.release.rollback_activated` contains the expected from/to SHAs.
9. Confirm response headers expose `GOOD_SHA`.
10. Do not drop or rewrite Financial, Ordering, Ticketing or audit history as application rollback.
11. Only execute controlled DB rollback SQL when a separately reviewed migration plan proves it safe; destructive downgrade is not the default recovery strategy.
12. Preserve failed-release evidence and open an incident/review when production impact occurred.

## 8. Health/readiness verification

### Liveness

`GET /healthz`

Required:

- HTTP 200;
- response identifies service and exact release/deployment identity;
- `X-Release-SHA` equals the immutable RC SHA;
- `X-Release-Version` equals the release version;
- `X-Deployment-ID` equals the active deployment;
- `X-Correlation-ID` exists and is bounded/valid.

Liveness alone never authorizes traffic.

### Readiness

`GET /readyz`

Required before traffic:

- HTTP 200;
- `readiness=ready`;
- `http-listener=pass`;
- `shutdown-readiness=pass`;
- `release-identity=pass`;
- `auth-security-state=pass` with shared durable authority in production.

Required shutdown proof:

- on SIGTERM/SIGINT readiness transitions to 503 before listener drain;
- normal traffic receives `SERVICE_DRAINING` during transition;
- drain is bounded;
- shutdown completion/runtime-stop observations are emitted.

## 9. Browser smoke matrix

CI contract evidence and deployed smoke evidence are separate. The following journeys are mandatory at the supported production browser baseline; at minimum the repository's canonical Chromium journey must pass, and any additional production-supported browsers must be validated before General Availability.

| Surface | Mandatory smoke | Failure classification |
| --- | --- | --- |
| Public Home / Design System | shell loads; no fatal console/runtime error; V1 visual structure remains usable | release blocker |
| Map / Search | Mapbox/fallback loads; search returns deterministic result; provider failure degrades safely | release blocker for core journey |
| Navigation | start/stop route; permission-denied path; active banner controls; mobile layout | release blocker |
| Assistant | open/close; local intent; provider-governed LLM path or explicit fail-closed state; photo/voice regression surfaces | release blocker for enabled capability |
| Auth | login; session read; logout; invalid/expired session; CSRF/origin denial | release blocker |
| Business | dashboard load; scoped profile read/update; onboarding commercial handoff without browser financial authority | release blocker |
| CRM | authenticated dashboard; lead list/detail/update; follow-up protected mutation; public token flow where applicable | release blocker |
| Payments | server-issued checkout handoff; sandbox launch; persisted verified outcome; failure/timeout; no redirect-only confirmation | release blocker |
| Ticketing | disabled state before activation; after activation catalog/hold/order/payment/issue/QR/check-in; refund cancellation | release blocker when enabled |
| Affiliates | no production runtime surface is expected on the current foundation | any accidental write/runtime authority is a blocker |

Required viewport coverage for user-facing critical journeys: mobile, tablet and desktop consistent with the permanent browser/visual contracts already used by the repository.

## 10. Provider E2E validation matrix

| Provider/dependency | Required evidence before GO | Current release concern |
| --- | --- | --- |
| Mapbox | production/staging token restrictions, map/search/routing call succeeds, fallback remains safe | validate configured token/origin and real provider path |
| Visual Crossing / Open-Meteo | weather success plus degraded/fallback/recovery observation | Visual Crossing key is optional; fallback must not create false readiness failure |
| OpenAI | account hard limit explicitly confirmed, current model pricing copied, durable governance state healthy, bounded request succeeds, budget/concurrency guard denials observable | runtime currently supports one paid replica only |
| Payments sandbox/provider | server creates checkout with idempotency; webhook authenticity; persisted verified outcome; browser consumes only persisted result; refund/reconciliation readback | **deployed third-party sandbox/browser E2E remains a documented Payments PARTIAL** |
| Ticketing external financial dependency | canonical Ordering/Financial chain drives fulfillment; refund drives cancellation; offline sync replay/revocation proof if enabled | never accept browser/provider payload as fulfillment authority |
| Affiliates | none may be claimed yet | no durable/provider runtime exists on current foundation |

Production credentials must never be introduced merely to manufacture test evidence. Use approved sandbox/safe provider modes where the architecture requires them.

## 11. Production observability checks

Before traffic shift, prove that the deployed observation sink can receive and query the exact release/deployment identity for:

- `platform.runtime.started`;
- `platform.runtime.fatal_failure`;
- `platform.http.unhandled_failure`;
- `platform.security.audit`;
- `platform.provider.degraded`;
- `platform.provider.recovered`;
- `platform.shutdown.readiness_transition`;
- `platform.shutdown.drain_started`;
- `platform.shutdown.drain_timeout` / `platform.shutdown.drain_failed` when exercised safely;
- `platform.shutdown.runtime_stop_failed` when applicable;
- `platform.shutdown.completed`;
- `platform.runtime.stopped`;
- `platform.release.rollback_activated` during rollback drill/real rollback.

Also require domain-level operational visibility for:

- Payment verified outcomes and failures;
- webhooks/replays/unmatched events;
- refunds;
- reconciliation findings/acknowledgements;
- settlement/ledger consistency;
- Subscription/recurrence results;
- Ticketing hold/confirmation/issuance/check-in/refund cancellation;
- Auth denials/rate limiting/revocation health.

Payments cannot be promoted from its current PARTIAL observability row until product-money/recurrence signals are fully represented through the canonical Platform observation contract with executable evidence.

## 12. Post-deploy validation

Immediately after progressive traffic begins:

1. Re-read `/healthz` and `/readyz` from the real ingress path.
2. Verify release identity headers match the promoted SHA on user-facing responses.
3. Confirm no unexpected revision is serving traffic.
4. Check error rate, latency, readiness churn and process restart rate.
5. Check Auth login/session/revocation/rate-limit health.
6. Execute one safe critical browser journey per enabled domain.
7. Validate Payments provider/webhook/reconciliation state for the release fixture.
8. Validate Ticketing fulfillment/check-in/refund state if enabled.
9. Validate provider degradation/recovery observations.
10. Validate financial reconciliation has no unexplained drift.
11. Review security audit denials for unexpected patterns.
12. Keep rollout paused if any threshold is breached; rollback rather than normalizing unexplained failures.

## 13. Failure / rollback criteria

Immediate NO-GO or rollback criteria include:

- any required exact-head CI/domain/browser gate missing or red;
- release artifact SHA/digest mismatch;
- `/healthz` unavailable or repeated process crashes;
- `/readyz=503` on a candidate intended to receive traffic;
- release identity mismatch between artifact, headers and observations;
- Auth shared security state unavailable or falling back to process-local authority in production;
- unexpected cross-tenant authorization success;
- material CSP/static-file/security regression exposing repository-private data or credentials;
- Payment confirmation without persisted verified Financial evidence;
- duplicate semantic provider charge/refund/renewal;
- ledger/reconciliation inconsistency or unexplained monetary drift;
- Ticketing oversell, duplicate check-in, invalid fulfillment authority or unsafe offline credential behavior;
- missing webhook processing needed to converge in-flight financial state;
- unbounded or repeatedly failing shutdown/drain;
- unavailable production observation path for critical failures;
- provider behavior inconsistent with the validated staging/sandbox contract;
- migration incompatibility that prevents safe old/new runtime coexistence or recovery;
- any Affiliate runtime path that creates monetary authority outside Financial.

## 14. Exact sequence when GitHub Actions returns

Do not skip steps because an earlier historical run was green.

### 1. Update all branches

1. Re-read `main` and record SHA.
2. Rebase/merge the current main into #286 and require 0-behind/mergeable.
3. After #286 promotion, retarget/rebase #285 onto main; require 0-behind/mergeable.
4. Repeat sequentially for #268, #264, #288 and this release-engineering PR.
5. Re-run diff review after each rebase; never assume a previously reviewed diff is unchanged.

### 2. Quality

For each exact final head, require `Quality Gate / quality` success. Draft PRs must be moved to ready-for-review when test/build execution is required by the workflow's draft condition. A startup failure is not success.

### 3. Domain contracts

Run/require every permanent domain contract touched by the exact diff. At minimum for the current queue:

- Auth Integration;
- Business Auth integration and affected Business contracts;
- CRM Platform Auth / CRM equivalence where triggered;
- Payments persistence/provider/verified outcome/webhook/refund/reconciliation/settlement/operational ledger/recurrence contracts;
- Ticketing M147/M148 contracts when the integrated diff triggers them;
- Platform Production Readiness contract;
- Affiliate contract and every persistence/integration/security/privacy/materialization contract that becomes applicable before any Affiliate lifecycle promotion.

### 4. Browser contracts

Require the exact-head path-scoped browser contracts for affected surfaces, including Auth login, Business, CRM, Payments, Search/Map/Navigation/Assistant and Ticketing browser paths where applicable. Treat a non-trigger caused by incorrect path filters as a CI-governance defect, not permission to promote.

### 5. Merge order

Promote one at a time in this order, revalidating after every merge:

`#286 → #285 → #268 → #264 → #288 → final release-engineering PR`

Do not merge #264 merely to claim Affiliates release completeness; its current foundation remains `planned/discovered` until the documented PARTIAL work is actually closed.

### 6. Revalidate main

After the final merge:

1. record exact main SHA;
2. require main `Quality Gate / quality` green;
3. require all relevant push-to-main contracts green;
4. run manual `Release Promotion Gate` with `expected_sha=<that exact main SHA>`;
5. confirm the workflow proves remote main still equals `expected_sha`;
6. freeze immutable RC artifact/version/digest from that SHA.

### 7. Deploy

Deploy the exact immutable RC to staging/production-candidate with zero production traffic and complete environment validation. Do not use an artifact rebuilt from an unrecorded workspace state.

### 8. Migrations

Verify backups/recovery points, then execute the reviewed expand-first order in Section 5. Keep Ticketing disabled until schema/readiness validation. No Affiliate migration exists on the current foundation.

### 9. Smoke

Require health/readiness/release identity plus the browser smoke matrix and safe critical API journeys.

### 10. Provider E2E

Execute real approved staging/sandbox provider validation. Payments deployed third-party sandbox/browser E2E is mandatory to close its current provider PARTIAL. Validate Mapbox, weather fallback/recovery and OpenAI governance for enabled provider paths.

### 11. Observability

Verify logs/observations can be queried by exact SHA/deployment ID, dashboards are live, alert routing is active, and product-money/recurrence visibility is complete enough for the approved release criteria.

### 12. Rollback readiness

Prove the previous known-good artifact is deployable; verify disable-first controls; perform or reference a current rollback drill; confirm rollback identity observation and data-preservation strategy.

### 13. Final release decision

Only declare GO when:

- every mandatory repository gate is green on the exact required SHA;
- staging/provider/browser evidence exists;
- migrations/backups/rollback are verified;
- observability and alerting are live;
- all release-scope Feature criteria are satisfied or an explicit approved scope decision excludes a not-ready Feature without falsely changing its lifecycle state;
- the Definition of Released can be met after progressive production rollout.

Otherwise record **NO-GO**, the exact missing evidence and the owner/next action. Never report `100%`, `production-ready` or `released` while an obligatory gate is unevidenced.

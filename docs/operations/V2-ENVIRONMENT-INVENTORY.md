# Morro Digital V2 — Environment Inventory

Status: release-candidate configuration inventory.  
Audit baseline: `main@ec4f51e0198cdeed51b37fabe5ed94ebb2e3ecb6` plus the active Platform production-readiness candidate (#268).

This file inventories configuration consumed or required by the current V2 runtime/runbooks. It contains names and validation expectations only — never real credentials.

## 1. Release rule

Before a release candidate is cut:

- `.env.example` must be reconciled against this inventory and the exact integrated runtime;
- every server-only secret must live in the deployment secret manager/runtime environment, never a browser bundle;
- every production URL/origin must be the exact approved HTTPS value;
- database URLs must use least-privilege credentials and transport security appropriate to the infrastructure;
- absent mandatory configuration must fail closed rather than silently enabling a weaker implementation.

The active #268 `.env.example` covers Platform/Auth/Ordering/Financial/Payments/OpenAI but does not yet list all currently consumed CRM, Ticketing and weather configuration. That mismatch is a release-preparation gap to reconcile before the final RC.

## 2. Public browser configuration

These values are intentionally projected through the runtime browser configuration boundary.

| Variable | Required | Sensitivity | Release validation |
| --- | --- | --- | --- |
| `VITE_MAPBOX_ACCESS_TOKEN` | required when real Mapbox browser runtime is enabled | public restricted token | URL/origin restricted, least privilege, real map/search/routing smoke |
| `VITE_MAPBOX_STYLE` | required for preserved approved Mapbox visual runtime | public config | approved V1-equivalent style URL |
| `VITE_MAPBOX_CONTAINER_ID` | yes | public config | expected `map` container unless an exact-head contract approves otherwise |
| `VITE_MAPBOX_INITIAL_ZOOM` | yes | public config | numeric 0..24; current default 14 |

Do not place server API keys or HMAC secrets under a `VITE_` variable.

## 3. Runtime process / ingress

| Variable | Required | Release validation |
| --- | --- | --- |
| `NODE_ENV` | production | must be `production` for production candidate behavior |
| `HOST` | deployment-specific | bind only as intended by the platform/ingress |
| `PORT` | deployment-specific | service/health routing must target the same listener |

Forwarded client-address headers are not trusted as Auth security authority by the current application runtime. If a trusted proxy is introduced, preserve and prove the trust boundary at ingress instead of accepting arbitrary user-controlled forwarding headers.

## 4. Platform release identity and shutdown

| Variable | Required in production | Secret | Validation |
| --- | --- | --- | --- |
| `MORRO_RELEASE_SHA` | yes | no | exact immutable source/artifact SHA; `/readyz` fails production readiness when identity is incomplete |
| `MORRO_RELEASE_VERSION` | yes | no | immutable release version |
| `MORRO_DEPLOYMENT_ID` | yes | no | unique deployment/revision identity |
| `MORRO_ROLLBACK_FROM_SHA` | rollback only | no | empty on normal forward deploy; set to bad SHA on intentional rollback |
| `PLATFORM_SHUTDOWN_READINESS_DELAY_MS` | yes/defaulted | no | bounded; current production default 5000 ms |
| `PLATFORM_SHUTDOWN_DRAIN_TIMEOUT_MS` | yes/defaulted | no | bounded; current default 15000 ms; never unbounded |

Every user-facing HTTP response from the integrated Platform candidate must expose release/correlation headers consistent with these values.

## 5. Auth / shared security state

| Variable | Required in production | Secret | Validation |
| --- | --- | --- | --- |
| `DASHBOARD_AUTH_SECRET` | yes | **yes** | strong HMAC secret, minimum 32 characters |
| `DASHBOARD_AUTH_ORIGIN` | yes | no | exact production origin, HTTPS |
| `DASHBOARD_SESSION_TTL_SECONDS` | yes/defaulted | no | bounded session lifetime; current example 28800 |
| `DASHBOARD_USERS_JSON` | yes for configured-user mode | **sensitive** | server-only identities/hash material; no plaintext passwords |
| `AUTH_DATABASE_URL` | yes in production | **yes** | shared durable MySQL authority for every active replica; readiness fail-closed on failure |
| `DASHBOARD_ADMIN_GLOBAL_BYPASS_CONFIRMED` | only when an admin exists | no | explicit `true` only after global admin scope is approved; default false |

Production must never fall back from unavailable shared Auth state to process-local rate limiting/revocation authority.

## 6. CRM

| Variable | Required when CRM runtime is enabled | Secret | Validation |
| --- | --- | --- | --- |
| `CRM_DATABASE_URL` | yes | **yes** | durable MySQL, least privilege, schema through the current cumulative CRM migration chain |

`CRM_DATABASE_URL` is consumed by `services/crm` and the Platform CRM runtime and therefore belongs in final deployment configuration even though it is absent from the active #268 `.env.example` snapshot audited for this release-preparation checkpoint.

## 7. Ordering

| Variable | Required for Payments/Ticketing | Secret | Validation |
| --- | --- | --- | --- |
| `ORDERING_DATABASE_URL` | yes | **yes** | durable Ordering MySQL; must not be silently aliased to Financial ownership |
| `ORDERING_PRICING_CATALOG_JSON` | yes for current checkout pricing authority | sensitive business config | versioned, no duplicate IDs, integer minor units, non-zero approved prices/currency |

Current cumulative Ordering schema authority includes M137 → M139 → M151 plus Ticketing-specific bridge/reservation expansion when Ticketing is deployed.

## 8. Financial

| Variable | Required for Payments/Ticketing | Secret | Validation |
| --- | --- | --- | --- |
| `FINANCIAL_DATABASE_URL` | yes | **yes** | durable Financial MySQL, separate ownership/failure boundary from Ordering |

Current cumulative Financial schema authority includes M137 → M141 → M142 → M144 → M145. Historical Payment/provider-event/verified-outcome/ledger/refund/reconciliation/settlement state is never discarded as normal rollback.

## 9. Payments / provider

| Variable | Required | Secret | Validation |
| --- | --- | --- | --- |
| `PAYMENTS_DESTINATION_ID` | yes | no | exact destination identity; current example `morro-de-sao-paulo` |
| `PAYMENTS_RETURN_URL_ORIGINS` | yes | no | comma-separated exact HTTPS origins; no path broadening |
| `PAYMENTS_STATUS_TOKEN_SECRET` | yes | **yes** | independent secret, minimum 32 chars; plaintext never persisted/logged |
| `PAYMENTS_HANDOFF_SECRET` | yes | **yes** | independent server-only Business/Ticketing handoff capability secret, minimum 32 chars |
| `PAYMENTS_STATUS_TOKEN_TTL_SECONDS` | optional/defaulted | no | bounded 10 minutes..7 days; current default 86400 |
| `PAYMENTS_PROVIDER_MODE` | yes | no | current implemented provider mode is `sandbox`; do not imply an unimplemented production provider |
| `PAYMENTS_SANDBOX_PROVIDER_BASE_URL` | yes in sandbox mode | sensitive | HTTPS for deployed environment; exact provider endpoint |
| `PAYMENTS_SANDBOX_PROVIDER_API_TOKEN` | yes in sandbox mode | **yes** | server only |
| `PAYMENTS_SANDBOX_CHECKOUT_ORIGINS` | yes in sandbox mode | no | exact allowed checkout origin(s) |
| `PAYMENTS_PROVIDER_TIMEOUT_MS` | yes/defaulted | no | bounded; current example 8000 ms |
| `PAYMENTS_PROVIDER_MAX_ATTEMPTS` | yes/defaulted | no | only 1..2; retries only approved transient failures and idempotent mutations |
| `PAYMENTS_PROVIDER_RETRY_BASE_MS` | yes/defaulted | no | bounded jittered backoff; current example 100 ms |
| `PAYMENTS_WEBHOOK_URL` | yes for provider webhook mode | sensitive config | exact implemented webhook path; production/deployed endpoint HTTPS |
| `PAYMENTS_SANDBOX_WEBHOOK_SECRET` | yes in sandbox webhook mode | **yes** | HMAC-SHA256 shared only with provider, minimum 32 chars |
| `PAYMENTS_WEBHOOK_TOLERANCE_SECONDS` | optional/defaulted | no | 60..900 seconds; current default 300 |

A browser return URL, provider redirect or command-accepted response is never financial confirmation.

### Production topology condition

The current Payments rate limiter is process-local. Before a **multi-replica/horizontally scaled** production claim, provide executable evidence for an approved shared/distributed limiter. A single-replica deployment does not justify inventing Redis or another adapter merely to satisfy a theoretical checklist; the actual topology must be recorded.

## 10. Ticketing

The current Ticketing release runbook defines the following production activation configuration:

| Variable | Required when Ticketing is enabled | Secret | Validation |
| --- | --- | --- | --- |
| `TICKETING_FEATURE_ENABLED` | yes for activation | no | deploy initially unset/false; set true only after schema/connectivity/smoke proof |
| `TICKETING_DATABASE_URL` | yes | **yes** | durable Ticketing MySQL |
| `TICKETING_SIGNING_SECRET` | yes | **yes** | server-only QR/ticket signing authority; never exposed to browser/device |
| `TICKETING_OFFLINE_PROVISIONING_SECRET` | yes when offline provisioning capability is present | **yes** | root provisioning secret, >=32 chars; only derived/scoped device credential may leave server boundary |
| `TICKETING_FINANCIAL_POLL_INTERVAL_MS` | optional | no | 500..60000 ms |
| `ORDERING_DATABASE_URL` | yes | **yes** | shared canonical Ordering authority, not copied Ticketing state |
| `FINANCIAL_DATABASE_URL` | yes | **yes** | verified Financial results remain fulfillment/refund authority |
| `PAYMENTS_HANDOFF_SECRET` | yes | **yes** | shared server-side capability boundary |
| `PAYMENTS_DESTINATION_ID` | yes | no | exact destination |

Payments provider/webhook/status credentials stay Payments-owned and must not be copied into Ticketing.

These Ticketing variables are a known reconciliation gap in the active #268 `.env.example` snapshot and must be added or otherwise canonically documented before the RC is frozen.

## 11. Assistant / OpenAI paid-provider governance

| Variable | Required for paid OpenAI path | Secret | Validation |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | yes | **yes** | server only; key alone does not enable calls |
| `OPENAI_MODEL` | yes | no | approved model; prefer pinned snapshot when available |
| `OPENAI_PRICING_MODEL` | yes | no | must exactly match `OPENAI_MODEL` |
| `OPENAI_PROVIDER_HARD_LIMIT_CONFIRMED` | yes | no | explicit true only after provider account hard limit is actually configured |
| `OPENAI_INPUT_USD_PER_1M_TOKENS` | yes | sensitive business config | copy current provider rate for exact configured model at release time |
| `OPENAI_OUTPUT_USD_PER_1M_TOKENS` | yes | sensitive business config | copy current provider rate for exact configured model at release time |
| `OPENAI_DAILY_COST_LIMIT_USD` | yes | sensitive business config | internal ceiling; must be >0 |
| `OPENAI_MONTHLY_COST_LIMIT_USD` | yes | sensitive business config | internal ceiling; must be >0 |
| `OPENAI_REQUEST_RESERVE_USD` | yes | sensitive business config | must meet/exceed runtime-computed conservative floor |
| `OPENAI_MAX_CONCURRENCY` | yes | no | positive integer; current example 4 |
| `OPENAI_RUNTIME_REPLICA_COUNT` | yes | no | current durable governor supports exactly `1`; >1 fails closed |
| `OPENAI_GOVERNANCE_STATE_FILE` | yes | **sensitive path** | durable writable storage, not ephemeral `/tmp`; never mount same file into two active paid replicas |

The account/provider hard limit and current pricing values are external release evidence and must be revalidated at release time. They must not be hard-coded into source as stale assumptions.

## 12. Weather providers

| Variable | Required | Secret | Validation |
| --- | --- | --- | --- |
| `VISUAL_CROSSING_API_KEY` | optional | **yes** | server only; when configured, validate real provider call and degradation/recovery path |

Open-Meteo is the current no-key fallback. Failure of optional weather providers may degrade provider health/observations but must not falsely turn an otherwise usable revision into a critical Platform readiness failure.

`VISUAL_CROSSING_API_KEY` is consumed by the current runtime and is another configuration name missing from the active #268 `.env.example` snapshot.

## 13. Affiliates

There are **no production Affiliate environment variables to invent at this checkpoint**.

The current `FEATURE-0010` foundation intentionally has no durable Affiliate database migration, no runtime provider adapter, no authenticated HTTP API and no production materialization executor. Do not add payout/wallet/provider credentials merely to make the environment inventory look complete. Configuration must follow the approved implementation when those PARTIAL rows are actually closed.

## 14. Pre-RC environment validation

- [ ] Diff all `process.env`, runtime environment and `getEnvironmentValue(...)` references on the exact integrated SHA against this inventory.
- [ ] Diff `.env.example` against this inventory and reconcile missing non-secret placeholders/docs.
- [ ] Confirm browser-exposed configuration contains no secret/server authority.
- [ ] Confirm every database URL points to the correct ownership boundary/schema.
- [ ] Confirm production origins/URLs use HTTPS and exact intended hosts.
- [ ] Confirm release identity values match the immutable artifact.
- [ ] Confirm Auth shared security state is reachable from every intended replica.
- [ ] Confirm the real replica topology is recorded for Payments and OpenAI governance decisions.
- [ ] Confirm OpenAI hard limit/pricing/budgets against current provider account information.
- [ ] Confirm Mapbox token restrictions against the deployed origin.
- [ ] Confirm Payments sandbox endpoint/token/webhook/checkout allowlist through provider E2E.
- [ ] Confirm Ticketing remains disabled until its activation checklist is satisfied.
- [ ] Confirm no real secret value is committed to Git or printed in release evidence.

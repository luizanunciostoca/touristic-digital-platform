# Morro Digital V2 — Final Release Evidence Index

Status: **PRE-RELEASE / EVIDENCE INCOMPLETE / NO-GO**  
Initial audit baseline: `main@ec4f51e0198cdeed51b37fabe5ed94ebb2e3ecb6`  
Audit date: 2026-08-17

This index distinguishes implementation/equivalence evidence from actual release evidence. It must be updated after every final merge and again after staging/provider/production validation.

## 1. Repository truth checkpoint

| Evidence | Checkpoint | Current interpretation |
| --- | --- | --- |
| `main` | `ec4f51e0198cdeed51b37fabe5ed94ebb2e3ecb6` | audit baseline only; not final RC |
| Feature Registry | current main plus pending Affiliate reconciliation in #264 | Features 0001–0008 and 0011 equivalent; 0009 migrating; 0010 planned |
| Master Migration Tracker | pending final documentary truth #288 | must be rebased/reconciled after current #264 head before promotion |
| Release Process | `docs/product-architecture/RELEASE-PROCESS.md` | production `released` requires stable production, metrics, reconciliations and published docs/changelog |
| Platform runbook | #268 candidate `docs/operations/PLATFORM-PRODUCTION-RUNBOOK.md` | implementation/runbook candidate; official Platform gate still required |
| Payments runbook | `docs/operations/PAYMENTS-RELEASE-ROLLBACK.md` | expand-first / disable-first authority |
| Ticketing runbook | `docs/runbooks/TICKETING-FEATURE-0011-RELEASE.md` | equivalent implementation; production activation separate |
| Final release runbook | `docs/operations/V2-FINAL-RELEASE-RUNBOOK.md` | release coordination checklist/order |
| Environment inventory | `docs/operations/V2-ENVIRONMENT-INVENTORY.md` | RC configuration truth to reconcile with exact integrated runtime |

## 2. Open release-train PRs

| PR | Role | State for release engineering |
| --- | --- | --- |
| #286 | CI / Quality / repository governance preparation | mergeable candidate; must be first and receive exact-head official evidence when Actions returns |
| #285 | workflow supply-chain + path-scoped contract trigger hardening | stacked on #286; retarget/rebase after #286, then promote before later runtime PRs |
| #268 | Platform production readiness / Auth durable state / health-readiness / shutdown / security | mergeable candidate; requires #286/#285 promotion and exact-head Platform/Auth/browser gates |
| #264 | FEATURE-0010 Affiliate policy/domain foundation | mergeable candidate; foundation remains planned/discovered and not production-equivalent |
| #288 | final V2 documentary truth | stacked on an older #264 base; currently requires resynchronization before it can be final truth |
| release-engineering PR | final operational release package | merge last after all predecessor truth is reconciled |

## 3. Feature/migration evidence summary

### FEATURE-0001 — Map

- lifecycle: `equivalent`;
- historical provider/visual regression evidence exists;
- release requirement: exact integrated browser/provider smoke and current release identity evidence;
- status: **implementation/equivalence evidence exists; release evidence pending**.

### FEATURE-0002 — Search

- matrix: 21 PASS / 0 PARTIAL / 0 GAP / 1 N/A;
- lifecycle: `equivalent`;
- release requirement: exact integrated Search browser/provider smoke;
- status: **equivalent; not released**.

### FEATURE-0003 — Navigation

- matrix: 24 PASS / 0 PARTIAL / 0 GAP;
- lifecycle: `equivalent`;
- release requirement: exact integrated visual/accessibility/provider smoke;
- status: **equivalent; not released**.

### FEATURE-0004 — Assistant

- M35 closes the frozen photo-asset delivery gap and all matrix rows are PASS;
- lifecycle: `equivalent`;
- release requirement: exact integrated Assistant browser contracts plus deployed provider governance evidence for enabled OpenAI path;
- status: **equivalent; not released**.

### FEATURE-0005 — Business

- matrix: 19 PASS / 0 PARTIAL / 0 GAP / 1 N/A after final Business equivalence checkpoint;
- checkout execution remains Payments-owned;
- lifecycle: `equivalent`;
- release requirement: Auth/Business/browser integration on final head;
- status: **equivalent; not released**.

### FEATURE-0006 — CRM

- matrix: 24 PASS / 0 PARTIAL / 0 GAP / 1 N/A;
- M140/M141 require no additional DB migration beyond the existing cumulative CRM schema path;
- lifecycle: `equivalent`;
- release requirement: final CRM/Auth/browser contracts and deployed DB/runtime smoke;
- status: **equivalent; not released**.

### FEATURE-0007 — Design System

- lifecycle: `equivalent`;
- release requirement: integrated browser/visual regression and no V1 identity drift;
- status: **equivalent; not released**.

### FEATURE-0008 — Auth

- matrix: 20 PASS / 0 PARTIAL / 0 GAP;
- lifecycle: `equivalent`;
- #268 adds production shared durable security state and fail-closed readiness behavior;
- release requirement: exact-head Auth Integration, Auth Login Browser and Platform Production Readiness contracts with real MySQL plus deployed origin/session/revocation smoke;
- status: **equivalent feature; production-hardening evidence pending**.

### FEATURE-0009 — Payments / Ordering / Financial / Subscription

Current reconciled matrix:

```text
PASS      30
PARTIAL    3
GAP        0
N/A        1
TOTAL     34
```

Open PARTIAL rows:

1. **Financial audit/observability** — durable audit/reconciliation exists, but product-money/recurrence observations are not yet fully represented through the canonical Platform observation contract with release-grade evidence.
2. **Sandbox/provider E2E** — local deterministic provider/browser contracts exist; a deployed third-party sandbox browser journey is not yet evidenced.
3. **Rate limiting** — current application limiter is process-local; a shared/distributed implementation is required only if the proven production topology is horizontally scaled/multi-replica.

Lifecycle: `migrating`.  
Status: **RELEASE BLOCKER for a claim that Payments/V2 is fully equivalent/production-ready**.

### FEATURE-0010 — Affiliates

Current active foundation branch matrix:

```text
PASS       15
PARTIAL    10
GAP         0
N/A         2
TOTAL      27
```

Lifecycle remains `planned`; MIG-0011 remains `discovered`.

Known intentionally absent production surfaces include:

- durable Affiliate SQL migrations/repositories;
- production application composition over durable stores;
- authenticated Affiliate HTTP API/projections;
- browser/admin Affiliate UI;
- materialization delivery/readback/retry implementation;
- completed Ordering/Financial evidence adapters and concurrency/retention proof.

No payout, wallet, parallel Payments or Financial authority may be invented to close these rows.

Status: **RELEASE BLOCKER for a claim that full FEATURE-0010 is complete/production-ready**. The existing foundation may only be merged after its own exact-head required gates return green; merging it does not change its lifecycle state.

### FEATURE-0011 — Ticketing

- V2-native capability; V1-specific column is correctly N/A;
- final matrix rows are PASS across catalog/inventory/hold/order/payment authority/ticket issuance/QR/check-in/offline/refund/release contract;
- lifecycle: `equivalent`, not released;
- release requirement: immutable candidate, current exact-head gates, DB/schema validation, disabled-first deploy, safe activation fixture and rollback proof;
- status: **equivalent; production activation evidence pending**.

## 4. GitHub Actions evidence status

At this checkpoint GitHub Actions is unavailable/defective for current events. Direct inspection of current release-train heads shows runs ending in `startup_failure`, including the current heads audited for #286, #268 and #264.

Interpretation:

- `startup_failure` is **not** evidence that the code contract failed;
- `startup_failure` is also **not** PASS evidence;
- no current critical PR may use these runs to satisfy promotion requirements;
- historical green runs remain supporting regression evidence only and cannot replace exact-head gates.

The release decision therefore remains NO-GO until GitHub Actions returns and exact-head/current-main gates execute successfully.

## 5. Official repository gates to index after Actions recovery

For each gate below, record: workflow name, job name, exact SHA, run URL/ID, conclusion, timestamp and any artifact/evidence digest.

### Core promotion gates

- `Quality Gate / quality`;
- `Release Promotion Gate / release / smoke` on exact current main;
- `Platform Production Readiness Contract / platform-production`.

### Auth / Business / CRM

- Auth Integration Contract;
- Auth Login Browser Contract;
- Business Auth Integration Contract;
- Business Dashboard Browser/Client contracts as triggered;
- Business Onboarding browser family as triggered;
- Business Production Profile Browser Contract as triggered;
- Business Live Runtime Browser Contract as triggered;
- CRM Platform Auth Integration Contract;
- CRM Lead Detail Browser Contract as triggered;
- CRM Equivalence Browser Contract as triggered.

### Map / Search / Navigation / Assistant

- Search Browser Contract;
- Map Provider Regression;
- Map Tour Browser Regression;
- Mapbox Visual Contract Regression;
- Navigation Visual Baseline;
- Navigation Accessibility Baseline;
- Assistant Photo Browser Contract;
- Assistant Voice Browser Contract.

### Payments / Financial / Ordering

- Payments Persistence Integration;
- Payments Sandbox Provider Contract;
- Payments Verified Outcome Contract;
- Payments Verified Webhook Contract;
- Payments Refund Command Contract;
- Payments Reconciliation Contract;
- Payments Settlement Contract;
- Payments Operational Ledger Contract;
- Payments Subscription Recurrence Contract;
- Payments Browser Checkout Contract;
- Ordering MySQL integration evidence required by the Payments release strategy.

### Ticketing

- Ticketing M147 Contract;
- Ticketing M148 Transaction Contract;
- every current integrated Ticketing browser/Payments/Auth dependency contract triggered by the final diff.

### Affiliates

Before any lifecycle promotion beyond the current foundation, the evidence index must gain permanent executable evidence for each newly closed PARTIAL row, including:

- Affiliate domain/policy contract;
- durable schema/repository integration;
- Ordering relationship integration;
- Financial verified-evidence integration;
- idempotency/concurrency/replay safety;
- authorization/security/privacy/retention;
- materialization delivery/readback/retry where implemented;
- authenticated HTTP/API/browser surfaces where implemented.

Do not create fake gate names or mark a row PASS before the corresponding permanent executable contract actually exists.

## 6. Environment/configuration evidence

Before final RC:

- [ ] exact integrated `.env.example` reconciled with `docs/operations/V2-ENVIRONMENT-INVENTORY.md`;
- [ ] `CRM_DATABASE_URL` accounted for;
- [ ] Ticketing activation/database/signing/offline variables accounted for;
- [ ] `VISUAL_CROSSING_API_KEY` accounted for as optional server-only provider configuration;
- [ ] Mapbox public token restrictions proven against deployed origin;
- [ ] Auth origin/secret/users/shared MySQL state validated;
- [ ] Ordering/Financial DB ownership separation validated;
- [ ] Payments provider/webhook/return-origin configuration validated;
- [ ] actual Payments replica topology recorded for rate-limit decision;
- [ ] OpenAI account hard limit/pricing/budgets/durable governance state validated against current provider account;
- [ ] release SHA/version/deployment ID injected and visible through runtime probes/headers;
- [ ] no secret appears in browser runtime config, Git history, logs or attached release artifacts.

## 7. Migration evidence

Record before/after schema/version evidence for:

- CRM cumulative M71 → M90 → M94 → M95 → M99;
- Ordering M137 → M139 → M151;
- Financial M137 → M141 → M142 → M144 → M145;
- Ordering Ticketing bridge/reservation schema;
- Ticketing M147 → M150 Reservation → Financial bridge → public API schema;
- Auth idempotent shared security-state tables.

Required release evidence:

- [ ] pre-migration backup/recovery point references;
- [ ] schema application logs with exact release identity/correlation where available;
- [ ] read compatibility check;
- [ ] no destructive Financial/Ordering/Ticketing history rewrite;
- [ ] Ticketing disabled while schema/connectivity validation occurs;
- [ ] no Affiliate migration claimed while none exists.

## 8. Health/readiness and release identity evidence

Capture from deployed candidate before traffic:

- `/healthz` HTTP 200;
- `/readyz` HTTP 200 with `readiness=ready`;
- critical checks: `http-listener`, `shutdown-readiness`, `release-identity`, `auth-security-state` all pass;
- `X-Correlation-ID`;
- `X-Release-SHA` = exact RC SHA;
- `X-Release-Version` = immutable release version;
- `X-Deployment-ID` = current deployment;
- `platform.runtime.started` for the same SHA/deployment;
- graceful shutdown proof showing readiness 503 before listener drain;
- bounded drain and completion/runtime-stop observations.

## 9. Browser/deployed smoke evidence

Record environment, browser/version, viewport, exact release identity and result for:

- Public Home/Design System;
- Map/Search;
- Navigation;
- Assistant;
- Auth;
- Business;
- CRM;
- Payments;
- Ticketing if enabled.

At minimum preserve the repository's canonical Chromium evidence. Any additional browser explicitly supported for production must have release smoke evidence before General Availability.

Affiliates currently has no production runtime/browser surface to smoke; an accidental monetary/runtime authority would be a defect, not evidence of completion.

## 10. Provider E2E evidence

### Mapbox

- [ ] real approved staging/production-candidate token works;
- [ ] origin restrictions/least privilege confirmed;
- [ ] map/search/routing expected path works;
- [ ] safe fallback/error behavior validated.

### Weather

- [ ] Visual Crossing call validated when key configured;
- [ ] Open-Meteo fallback validated;
- [ ] degradation and recovery observations emitted;
- [ ] optional provider outage does not incorrectly fail critical readiness.

### OpenAI

- [ ] provider hard spending limit actually configured and operator acknowledgement set;
- [ ] current configured model pricing copied at release time;
- [ ] persistent governance state healthy;
- [ ] exactly one paid runtime replica under current implementation;
- [ ] one bounded successful request;
- [ ] budget/concurrency/failure denial paths observable without secret leakage.

### Payments

- [ ] deployed third-party sandbox checkout created with stable idempotency;
- [ ] signed webhook accepted only after authenticity/timestamp validation;
- [ ] persisted verified success/failure becomes canonical Financial result;
- [ ] browser observes only persisted identity-matched result;
- [ ] redirect alone cannot confirm payment;
- [ ] replay does not create a second semantic mutation;
- [ ] refund readback and reconciliation evidence captured;
- [ ] product-money/recurrence Platform observations captured.

This Payments provider evidence is mandatory to close the currently documented provider PARTIAL.

### Ticketing

- [ ] Ticketing disabled on initial candidate deploy;
- [ ] Ordering/Financial/Ticketing DB connectivity/schema valid;
- [ ] canonical Payments checkout route healthy;
- [ ] safe Catalog → Hold → Order → Payments → verified Financial result → Reservation confirmation → Ticket issue → QR/human code → check-in fixture passes;
- [ ] verified refund cancels Reservation/Ticket;
- [ ] if offline enabled: device provision → sync → replay-safe result → revoke → subsequent sync denied.

## 11. Observability evidence

Record query/dashboard/alert evidence keyed by exact release SHA/deployment ID for:

- runtime start/stop/fatal/unhandled failures;
- security audit;
- provider degraded/recovered;
- shutdown transition/drain/timeout/failure/completion;
- rollback activation;
- Payment verified outcome/failure;
- provider webhook/replay/unmatched events;
- refunds;
- reconciliation findings;
- ledger/settlement;
- Subscription/recurrence;
- Ticketing hold/fulfillment/check-in/refund cancellation;
- Auth denials/revocation/rate-limit health.

The infrastructure collector/exporter may be external, but the application observation contract must remain canonical and must not be replaced with a second incompatible schema.

## 12. Rollback evidence

Before final GO:

- [ ] previous known-good immutable artifact SHA/digest is recorded and retrievable;
- [ ] `MORRO_ROLLBACK_FROM_SHA` procedure validated;
- [ ] Ticketing disable-first path validated;
- [ ] Business → Payments new-start disable path validated while in-flight webhook/reconciliation remains safe;
- [ ] recurrence stop/resume preserves renewal-intent idempotency;
- [ ] no durable financial/ticket/audit history is erased;
- [ ] rollback candidate reaches `/healthz=200` and `/readyz=200` before traffic;
- [ ] `platform.release.rollback_activated` contains correct BAD_SHA → GOOD_SHA;
- [ ] response headers expose GOOD_SHA after rollback.

## 13. Final Go / No-Go record

Fill only after all final merges, exact-head/current-main CI, deployment, provider E2E, observability and rollback validation.

```text
FINAL_MAIN_SHA=
RELEASE_VERSION=
ARTIFACT_ID=
ARTIFACT_DIGEST=
DEPLOYMENT_ID=
STAGING_ENVIRONMENT=
PRODUCTION_ENVIRONMENT=
QUALITY_RUN=
RELEASE_PROMOTION_RUN=
PLATFORM_READINESS_RUN=
DOMAIN_GATE_INDEX=
BROWSER_GATE_INDEX=
MIGRATION_EVIDENCE=
PROVIDER_E2E_EVIDENCE=
OBSERVABILITY_EVIDENCE=
ROLLBACK_EVIDENCE=
KNOWN_ACCEPTED_RISKS=
RELEASE_DECISION=NO-GO
DECIDED_BY=
DECIDED_AT=
```

The default remains `NO-GO`. Change it to `GO` only after every mandatory release-scope criterion has current evidence. Do not use `100%`, `production-ready` or `released` as a substitute for the evidence above.

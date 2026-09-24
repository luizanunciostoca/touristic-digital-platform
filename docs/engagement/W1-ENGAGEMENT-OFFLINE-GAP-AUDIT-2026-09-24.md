# W1 Engagement / Offline Gap Audit — 2026-09-24

ChangeSet: `MD-W1-ENGAGEMENT-OFFLINE-GAP`

Base main SHA: `b92fbc17fa383defd95274a3dea607895fe7e6dd`

Audit mode: documentation-only. No runtime, workflow, provider activation, credential, Auth, Analytics, Notifications or Service Worker code is modified by this ChangeSet.

## 1. Executive result

The current main already contains material foundations for Analytics, Notifications and PWA/Offline. The correct recovery strategy is therefore **preserve and integrate**, not rebuild.

The largest real gaps are:

1. production activation/provisioning for Analytics;
2. durable Notifications delivery infrastructure and real provider adapters;
3. push subscription/background-push delivery;
4. durable Notification preferences/idempotency/job scheduling;
5. domain-aware offline behavior beyond the conservative shell;
6. background sync only where a product domain explicitly permits replay;
7. production device/installability verification for the PWA;
8. user-facing engagement orchestration that consumes existing primitives without moving authority from source domains.

The current PWA intentionally keeps every `/api/*` request and all non-GET requests outside Service Worker authority. This must remain an invariant unless a later domain-specific ChangeSet proves that a mutation is safe to queue/replay.

## 2. Source-of-truth inventory

### Analytics

Verified in current main:

- canonical package `@touristic/analytics`;
- versioned event envelope;
- canonical event taxonomy:
  - `session_started`
  - `category_viewed`
  - `place_viewed`
  - `search_submitted`
  - `assistant_query`
  - `directions_started`
  - `tour_started`
  - `tour_completed`
  - `commerce_clicked`
  - `offer_selected`
  - `reservation_started`
  - `checkout_started`
  - `payment_approved`
  - `ticket_issued`;
- canonical funnel stages from Discover through Ticket;
- explicit browser consent states `unknown | granted | denied`;
- default no-collection behavior until consent is granted;
- strict attribute allowlists by event;
- rejection of raw Search/Assistant text and direct sensitive keys;
- bounded primitive-only attributes;
- opaque session id held in `sessionStorage`;
- same-origin browser transport to `POST /api/analytics/v1/events`;
- browser instrumentation for public experience events;
- transaction milestone ports that consume authoritative Commerce/Ticketing/Financial transitions without creating authority;
- durable ingestion boundary in `services/analytics`;
- canonical wire parsing and validation;
- dedicated MySQL persistence via `analytics_events`;
- server-side SHA-256 session hash instead of raw browser session id persistence;
- primary-key event idempotency;
- identical replay handling;
- divergent same-event-id conflict handling;
- server-owned retention deadline;
- configurable purge support;
- explicit `ANALYTICS_FEATURE_ENABLED`;
- dedicated `ANALYTICS_DATABASE_URL`;
- runtime composition and readiness behavior;
- analytics API tests and package tests;
- performance-budget integration for the browser-imported Analytics package.

### Analytics privacy boundaries

Verified:

- no implicit consent grant;
- no analytics delivery while consent is `unknown` or `denied`;
- raw Search query, Assistant message/prompt, email, phone, address, CPF, card, token and secret keys are rejected from portable Analytics attributes;
- only allowlisted bounded primitive attributes survive sanitation;
- raw browser session id is not persisted by the durable repository;
- Analytics remains observational and does not become Commerce, Financial, Ticketing or CMS authority;
- browser transport is same-origin;
- production Analytics database is isolated by dedicated configuration rather than implicitly sharing a monetary-domain database.

Known operational boundary:

- production feature activation and real database provisioning are configuration/infrastructure concerns and are not proven merely by the versioned implementation.

### Notifications

Verified in current main:

- provider-neutral `@touristic/notifications` package;
- channels: email, push and SMS;
- initial canonical templates:
  - ticket confirmation;
  - reservation reminder;
  - tour reminder;
  - payment issue;
  - cancellation;
  - refund;
- opaque `recipientReference` instead of direct delivery address in portable domain contracts;
- primitive template variables;
- rejection of direct sensitive delivery keys;
- `NotificationPreferencePort`;
- preference evaluation before idempotency claim/provider call;
- explicit idempotency key;
- `NotificationIdempotencyPort` with claim/release semantics;
- duplicate suppression;
- provider ordering and same-channel fallback;
- release of idempotency claim when all providers fail or no provider exists;
- browser Push permission boundary;
- no automatic browser permission prompt on bootstrap;
- explicit passive permission read vs user-initiated permission request;
- `NotificationJobPort` for provider-neutral scheduling/queueing;
- domain-event mapping:
  - `ticket_issued` -> `ticket_confirmation`;
  - `reservation_reminder_requested` -> `reservation_reminder`;
  - `tour_reminder_requested` -> `tour_reminder`;
  - `payment_issue_detected` -> `payment_issue`;
  - `reservation_cancelled` -> `cancellation`;
  - `refund_confirmed` -> `refund`;
- deterministic notification idempotency key derived from template + source event + recipient reference;
- reminder jobs require an explicit authoritative `deliverAt`.

### Notifications gaps verified as real

Not currently claimed/proven as production capabilities:

- durable queue/outbox worker;
- production scheduler for reminder jobs;
- durable cross-replica idempotency adapter;
- durable notification preference store;
- real email provider adapter;
- real SMS provider adapter;
- Web Push/APNs/FCM provider adapter;
- Push subscription persistence;
- VAPID/APNs/FCM credentials;
- provider retry/backoff policy;
- dead-letter queue;
- provider delivery observability/receipts beyond the portable receipt contract;
- template rendering/localization storage/runtime;
- notification administration surface;
- production provider credentials;
- production delivery certification.

These are additive integration/runtime ChangeSets. They must not replace the existing dispatcher, opt-in boundary, idempotency contract or event mapping.

### PWA / Offline

Verified in current main:

- installable web manifest;
- standalone display metadata;
- 192x192 and 512x512 install icons;
- root-scope Service Worker;
- registration only in Service Worker-capable secure context;
- root offline fallback document;
- public-static stale-while-revalidate cache;
- root navigation network-first behavior;
- old-cache cleanup at activation;
- explicit waiting-worker update event;
- explicit `SKIP_WAITING` apply-update control;
- reload after intentional controller transition;
- online/offline browser state events;
- dedicated PWA contract tests;
- dedicated Chromium browser workflow;
- browser evidence covering:
  - manifest;
  - active Service Worker;
  - cached static asset availability while offline;
  - root shell availability while offline;
  - offline fallback;
  - API failure while offline;
  - browser page errors.

### PWA authority boundary

Verified:

- non-GET requests are not intercepted;
- `/api/*` is network-only;
- `/runtime-config.js` is network-only;
- `/healthz` is network-only;
- `/readyz` is network-only;
- cross-origin provider resources are not converted into offline authority;
- the current offline layer cannot approve payments, confirm reservations, issue tickets or replay mutations.

This boundary is correct and should remain the default.

### PWA / Offline gaps verified as real

Not currently implemented/proven:

- background sync of allowed mutations;
- domain-specific offline mutation queues;
- full destination/place/tour data persistence;
- durable cached domain snapshots with freshness/version semantics;
- offline write conflict resolution;
- offline reservation/payment/ticket authority;
- background push handling;
- production installability certification across the final browser/device matrix.

The absence of offline Payment/Ordering/Ticketing authority is **not a defect**. It is an intentional invariant.

## 3. Capability vs evidence matrix

| Capability | Code in current main | Tests/evidence in current main | Production/external effect | Classification |
| --- | --- | --- | --- | --- |
| Analytics canonical taxonomy | Yes | Unit tests | None required | IMPLEMENTED_AND_PROVEN |
| Analytics browser consent boundary | Yes | Browser/unit tests and evidence docs | Browser storage only | IMPLEMENTED_AND_PROVEN |
| Analytics privacy sanitation | Yes | Negative unit tests | None required | IMPLEMENTED_AND_PROVEN |
| Analytics browser instrumentation | Yes | Contract/unit evidence | Requires live product events | IMPLEMENTED_AND_PROVEN |
| Analytics same-origin transport | Yes | Unit/integration evidence | Requires configured host | IMPLEMENTED_AND_PROVEN |
| Analytics durable ingestion | Yes | Package/service tests | Requires DB | IMPLEMENTED_AND_PROVEN |
| Analytics durable MySQL persistence | Yes | Schema/repository tests and evidence | Requires provisioned database | CODE_PRESENT_EXTERNAL_EFFECT_MISSING |
| Analytics runtime composition | Yes | Runtime tests | Feature flag + DB required | CODE_PRESENT_EXTERNAL_EFFECT_MISSING |
| Analytics production activation | No repository proof of activation | No production credential/provision proof | External configuration | EXTERNAL_EFFECT_GAP |
| Notifications provider-neutral dispatcher | Yes | Unit tests | None required | IMPLEMENTED_AND_PROVEN |
| Notification templates/topics | Yes | Unit tests | None required | IMPLEMENTED_AND_PROVEN |
| Notification preferences contract | Yes | Unit tests | Durable store absent | FOUNDATION_IMPLEMENTED |
| Notification idempotency contract | Yes | Unit tests | Durable atomic adapter absent | FOUNDATION_IMPLEMENTED |
| Notification provider fallback | Yes | Unit tests | Real providers absent | FOUNDATION_IMPLEMENTED |
| Browser Push permission boundary | Yes | Package evidence/tests | User permission still required | IMPLEMENTED_AND_PROVEN |
| Notification event mapping | Yes | Unit/evidence | Source-domain event wiring required per integration | IMPLEMENTED_AND_PROVEN |
| Durable Notification queue/outbox | No production adapter located | None proving durable runtime | Database/worker required | CODE_GAP |
| Production email/SMS/push delivery | No real provider located | None | Credentials/provider accounts required | CODE_PLUS_EXTERNAL_GAP |
| Push subscription persistence | No | None | Browser + backend + VAPID/provider | CODE_PLUS_EXTERNAL_GAP |
| PWA manifest/install shell | Yes | Unit + browser CI | Device install action | IMPLEMENTED_AND_PROVEN |
| Service Worker static caching | Yes | Unit + browser CI | Browser runtime | IMPLEMENTED_AND_PROVEN |
| PWA explicit update flow | Yes | Contract tests | User/app update action | IMPLEMENTED_AND_PROVEN |
| Network-only server APIs | Yes | Unit + browser offline test | Network required | IMPLEMENTED_AND_PROVEN |
| Root offline shell | Yes | Browser evidence | Browser cache | IMPLEMENTED_AND_PROVEN |
| Offline domain snapshots | No general durable model located | None | Product-specific | CODE_GAP |
| Background sync | No | Current docs explicitly exclude it | Browser support + backend semantics | CODE_GAP |
| Offline server-authoritative mutations | Intentionally absent | Current tests prove network-only boundary | Server required | NOT_A_GAP_BY_DEFAULT |
| Production device/install matrix | Workflow proves Chromium contract only | Chromium evidence | Real device/browser matrix | EXTERNAL_EVIDENCE_GAP |

## 4. Tests and workflow inventory

Current evidence relevant to this scope includes:

- `packages/analytics/src/index.test.ts`;
- `packages/analytics/src/ingestion.test.ts`;
- `apps/morro-digital-platform/src/analytics/browser-analytics.test.ts`;
- `apps/morro-digital-platform/src/analytics/ticketing-analytics-contract.test.ts`;
- `apps/morro-digital-platform/tooling/analytics-api.test.mjs`;
- Analytics service/repository/schema tests under the Analytics workspace;
- `packages/notifications/src/index.test.ts`;
- `packages/notifications/src/event-integration.test.ts`;
- browser-permission coverage in the Notifications package;
- `apps/morro-digital-platform/src/pwa/pwa-contract.test.ts`;
- `.github/workflows/pwa-offline-browser-contract.yml`;
- `.github/workflows/morro-performance-budget.yml` for browser Analytics weight;
- Final Release Acceptance references the PWA browser contract.

No workflow change is required by this audit.

## 5. Implemented capability vs documentation-only claims

### Implemented in code and backed by executable evidence

- Analytics event taxonomy and privacy boundary;
- Analytics consent-aware browser instrumentation;
- Analytics durable ingestion/persistence implementation;
- Analytics runtime feature-gate composition;
- Notifications dispatcher/preferences/idempotency/provider-neutral contracts;
- Notifications event-intent mapping;
- browser Push permission gating;
- PWA manifest, Service Worker, offline shell, update lifecycle and network-only API boundary.

### Documented but not equivalent to production capability

- Analytics production activation;
- Analytics production database provisioning;
- periodic production retention purge scheduling;
- Notifications production queue/outbox;
- production Notification provider delivery;
- Push subscription storage and background push;
- production Notification credentials;
- general offline destination/place/tour persistence;
- background synchronization of mutations;
- production installability across final supported device/browser matrix.

A versioned evidence document describing a non-goal is treated as evidence of **absence/boundary**, not as evidence that the capability exists.

## 6. Code gaps vs external/provider gaps

### Primarily code gaps

- durable Notification preference repository;
- durable atomic Notification idempotency adapter;
- Notification queue/outbox + worker;
- reminder scheduler integration;
- template rendering/localization store;
- Push subscription model and server endpoints;
- provider adapters implementing the existing provider contract;
- delivery status/receipt observability;
- product-domain offline read models/snapshots;
- explicit offline mutation queue only for domains that can prove safe replay;
- conflict/version/freshness semantics for offline domain data;
- engagement orchestration consuming existing Analytics/Notification primitives.

### Primarily external/provider/configuration gaps

- Analytics production database provisioning;
- enabling `ANALYTICS_FEATURE_ENABLED` in the intended environment;
- supplying `ANALYTICS_DATABASE_URL`;
- production purge scheduler execution environment;
- email/SMS/Push provider accounts;
- provider API credentials;
- VAPID/APNs/FCM material;
- real browser Push permission/subscription state;
- production device/browser installability validation.

### Mixed code + external gaps

- production Notification delivery;
- Web Push;
- provider retries/DLQ;
- durable scheduled reminders;
- production Analytics operational verification.

## 7. Engagement gaps

The repository contains the primitives needed to observe and notify, but a complete engagement product layer is not yet proven.

Real remaining work should be decomposed around explicit user/product outcomes rather than a generic “engagement platform”. Candidate scopes:

- notification preference persistence and self-service UI;
- transactional notification delivery;
- reminder scheduling;
- opt-in Web Push subscription lifecycle;
- delivery telemetry;
- destination/place/tour offline read models;
- engagement journeys only after source-domain event ownership is defined.

Analytics must remain observational. Notifications must remain downstream of authoritative domain events. Offline must not become monetary or ticketing authority.

## 8. Invariants for subsequent waves

- Analytics never mutates source-domain state.
- Analytics collection remains consent-gated.
- Raw sensitive text/data does not enter portable Analytics attributes.
- Notification preference checks happen before send.
- Notification idempotency is atomic before production multi-replica delivery.
- Notification recipient addressing remains behind authorized integration boundaries.
- Push permission is never auto-requested at bootstrap.
- Service Worker does not acquire authority over `/api/*` by default.
- Non-GET requests remain network/server authoritative unless a domain-specific proof explicitly permits queueing.
- Payment, Ordering, Reservation, Ticketing, Auth and readiness remain server authoritative.
- Provider credentials are never committed to the repository.

## 9. Recommended follow-up ChangeSets

These can proceed independently unless later dependency analysis finds shared ownership.

### MD-W2-NOTIFICATIONS-DURABILITY

Own a service-side Notifications persistence layer only.

Scope:

- durable preference repository;
- atomic idempotency claims;
- outbox/job persistence;
- retry metadata;
- no real provider credentials.

Dependency: existing `@touristic/notifications` contracts.

### MD-W2-NOTIFICATIONS-PROVIDERS

Own real provider adapters behind the existing provider contract.

Scope:

- email/SMS/Push adapters;
- provider receipts;
- retry classification;
- no change to portable Notification semantics.

Dependency: durability recommended before production activation.

### MD-W2-WEB-PUSH-LIFECYCLE

Own Push subscription lifecycle.

Scope:

- explicit user-triggered permission request;
- subscription registration/revocation;
- VAPID/provider abstraction;
- background Push handler;
- durable subscription storage.

Dependency: Notifications durability.

### MD-W2-ANALYTICS-PRODUCTION-ACTIVATION

Infrastructure/configuration acceptance only unless code gaps are discovered.

Scope:

- dedicated production DB;
- feature activation;
- migration/readiness verification;
- retention purge scheduler;
- production smoke/evidence.

Must not redesign `@touristic/analytics`.

### MD-W2-OFFLINE-DOMAIN-READ-MODELS

Own offline read-only product data.

Scope:

- selected destination/place/tour snapshots;
- cache freshness/version semantics;
- storage quotas/eviction;
- offline UX;
- no mutation replay.

Independent of Notifications.

### MD-W2-OFFLINE-SAFE-SYNC

Only after each candidate mutation is explicitly classified replay-safe.

Scope:

- background sync infrastructure for allowlisted operations;
- deduplication/idempotency;
- conflict policy;
- reconnect behavior.

Must exclude payment approval, ticket issuance and other monetary/authority transitions unless the authoritative domain itself supplies a safe idempotent protocol.

### MD-W2-ENGAGEMENT-ORCHESTRATION

Consumes authoritative domain events and existing Analytics/Notifications primitives.

Scope:

- explicit lifecycle journeys/reminders;
- opt-in rules;
- rate/frequency controls;
- observability.

Must not become source-domain authority.

## 10. Audit conclusion

No foundation replacement is justified.

The correct next step is a set of narrow additive ChangeSets, with provider activation and credentials treated separately from repository capability.

This audit does not modify runtime behavior.

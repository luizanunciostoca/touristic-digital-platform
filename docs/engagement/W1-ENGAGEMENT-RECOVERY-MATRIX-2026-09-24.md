# W1 Engagement Recovery Matrix — 2026-09-24

ChangeSet: `MD-W1-ENGAGEMENT-OFFLINE-GAP`

Base main SHA: `b92fbc17fa383defd95274a3dea607895fe7e6dd`

Purpose: convert the current-main audit into an executable recovery matrix without changing runtime.

## Classification legend

- `PRESERVE`: implemented foundation that later waves must reuse.
- `CODE_GAP`: repository implementation still required.
- `EXTERNAL_GAP`: provider/configuration/provisioning/evidence required outside the portable foundation.
- `MIXED_GAP`: both repository implementation and external integration are required.
- `INTENTIONAL_BOUNDARY`: absence is deliberate and should not be “fixed” generically.
- `VERIFY_IN_TARGET`: implementation exists, but target-environment evidence is still required.

## Recovery matrix

| ID | Area | Capability | Current state | Evidence class | Gap class | Recommended owner / next ChangeSet |
| --- | --- | --- | --- | --- | --- | --- |
| ENG-001 | Analytics | Canonical taxonomy/funnel | Present in `@touristic/analytics` | Executable unit tests | PRESERVE | None |
| ENG-002 | Analytics | Consent-gated collection | Present; unknown/denied drops before transport | Unit/browser evidence | PRESERVE | None |
| ENG-003 | Analytics | Privacy allowlist + forbidden keys | Present | Negative unit tests | PRESERVE | None |
| ENG-004 | Analytics | Same-origin browser transport | Present | Code/tests | PRESERVE | None |
| ENG-005 | Analytics | Browser instrumentation | Present | Code/contract evidence | PRESERVE | None |
| ENG-006 | Analytics | Durable ingestion | Present | Service/package tests | PRESERVE | None |
| ENG-007 | Analytics | MySQL event persistence | Present in code | Repository/schema evidence | VERIFY_IN_TARGET | MD-W2-ANALYTICS-PRODUCTION-ACTIVATION |
| ENG-008 | Analytics | Replay/idempotency conflict rules | Present | Unit/service tests | PRESERVE | None |
| ENG-009 | Analytics | Server-owned retention | Present | Ingestion/service evidence | PRESERVE | None |
| ENG-010 | Analytics | Periodic production purge execution | Scheduler not proven active | Documentation + code boundary | EXTERNAL_GAP | MD-W2-ANALYTICS-PRODUCTION-ACTIVATION |
| ENG-011 | Analytics | Production feature activation | Explicitly disabled by default | Env contract | EXTERNAL_GAP | MD-W2-ANALYTICS-PRODUCTION-ACTIVATION |
| ENG-012 | Analytics | Production dedicated DB | Config contract exists; provisioning not proven | Env/schema evidence | EXTERNAL_GAP | MD-W2-ANALYTICS-PRODUCTION-ACTIVATION |
| ENG-013 | Notifications | Provider-neutral dispatcher | Present | Unit tests | PRESERVE | None |
| ENG-014 | Notifications | Canonical templates/topics | Present | Unit tests | PRESERVE | None |
| ENG-015 | Notifications | Preference contract | Present | Unit tests | PRESERVE | None |
| ENG-016 | Notifications | Durable preference persistence | No durable production adapter proven | Foundation docs | CODE_GAP | MD-W2-NOTIFICATIONS-DURABILITY |
| ENG-017 | Notifications | Idempotency contract | Present | Unit tests | PRESERVE | None |
| ENG-018 | Notifications | Cross-replica atomic idempotency | Production adapter absent | Foundation docs | CODE_GAP | MD-W2-NOTIFICATIONS-DURABILITY |
| ENG-019 | Notifications | Provider fallback | Present | Unit tests | PRESERVE | None |
| ENG-020 | Notifications | Event-to-template mapping | Present | Unit/evidence | PRESERVE | None |
| ENG-021 | Notifications | Reminder `deliverAt` contract | Present | Unit/evidence | PRESERVE | None |
| ENG-022 | Notifications | Durable queue/outbox | Absent | Explicit non-goal | CODE_GAP | MD-W2-NOTIFICATIONS-DURABILITY |
| ENG-023 | Notifications | Production scheduler/worker | Absent | Explicit non-goal | CODE_GAP | MD-W2-NOTIFICATIONS-DURABILITY |
| ENG-024 | Notifications | Email provider | No real adapter/credential proof | Provider-neutral only | MIXED_GAP | MD-W2-NOTIFICATIONS-PROVIDERS |
| ENG-025 | Notifications | SMS provider | No real adapter/credential proof | Provider-neutral only | MIXED_GAP | MD-W2-NOTIFICATIONS-PROVIDERS |
| ENG-026 | Notifications | Push provider | No real adapter/credential proof | Provider-neutral only | MIXED_GAP | MD-W2-WEB-PUSH-LIFECYCLE + providers |
| ENG-027 | Notifications | Browser Push permission gate | Present; no auto prompt | Code/evidence | PRESERVE | None |
| ENG-028 | Notifications | Push subscription persistence | Absent | Explicit non-goal | MIXED_GAP | MD-W2-WEB-PUSH-LIFECYCLE |
| ENG-029 | Notifications | Background push handler | Absent | Explicit non-goal | CODE_GAP | MD-W2-WEB-PUSH-LIFECYCLE |
| ENG-030 | Notifications | Retry/backoff/DLQ | Absent | Explicit non-goal | CODE_GAP | MD-W2-NOTIFICATIONS-DURABILITY |
| ENG-031 | Notifications | Template rendering/localization runtime | Not proven | Explicit non-goal | CODE_GAP | Separate template ChangeSet if product requires |
| ENG-032 | Notifications | Production provider credentials | Forbidden from this wave | No repository proof expected | EXTERNAL_GAP | Provider activation procedure |
| ENG-033 | PWA | Manifest/install metadata | Present | Unit + browser CI | PRESERVE | None |
| ENG-034 | PWA | Root Service Worker | Present | Unit + browser CI | PRESERVE | None |
| ENG-035 | PWA | Static shell caching | Present | Browser offline evidence | PRESERVE | None |
| ENG-036 | PWA | Root offline fallback | Present | Browser evidence | PRESERVE | None |
| ENG-037 | PWA | Explicit update lifecycle | Present | Contract tests | PRESERVE | None |
| ENG-038 | PWA | Online/offline state signal | Present | Contract tests | PRESERVE | None |
| ENG-039 | PWA | `/api/*` network-only | Present | Unit + browser negative evidence | INTENTIONAL_BOUNDARY | None |
| ENG-040 | PWA | Non-GET network/server authority | Present by non-interception | Contract tests/code | INTENTIONAL_BOUNDARY | None |
| ENG-041 | PWA | Offline destination/place/tour snapshots | General durable product model absent | No executable evidence | CODE_GAP | MD-W2-OFFLINE-DOMAIN-READ-MODELS |
| ENG-042 | PWA | Snapshot freshness/version semantics | Absent | No executable evidence | CODE_GAP | MD-W2-OFFLINE-DOMAIN-READ-MODELS |
| ENG-043 | PWA | Offline mutation queue | Absent | Explicit non-goal | INTENTIONAL_BOUNDARY until domain allowlist exists | MD-W2-OFFLINE-SAFE-SYNC only after proof |
| ENG-044 | PWA | Background Sync | Absent | Explicit non-goal | CODE_GAP | MD-W2-OFFLINE-SAFE-SYNC |
| ENG-045 | PWA | Offline payment/order/ticket authority | Absent | Browser negative evidence | INTENTIONAL_BOUNDARY | Must remain server authoritative |
| ENG-046 | PWA | Final device/browser install matrix | Chromium CI only | Browser CI | VERIFY_IN_TARGET | Device/browser acceptance ChangeSet |
| ENG-047 | Engagement | Source-domain event consumption | Partial primitives exist | Notification/Analytics mappings | PRESERVE_AND_EXTEND | MD-W2-ENGAGEMENT-ORCHESTRATION |
| ENG-048 | Engagement | Journey/frequency orchestration | Not proven as complete product layer | No dedicated runtime proof | CODE_GAP | MD-W2-ENGAGEMENT-ORCHESTRATION |
| ENG-049 | Engagement | Delivery observability | Portable receipt only | No production provider proof | MIXED_GAP | Durability/providers |
| ENG-050 | Privacy | Analytics explicit consent | Present | Negative tests | PRESERVE | None |
| ENG-051 | Privacy | Push permission user action boundary | Present | Code/evidence | PRESERVE | None |
| ENG-052 | Privacy | Provider-side address resolution | Kept outside portable contract | Domain evidence | PRESERVE | Provider adapters must respect |
| ENG-053 | Privacy | Credential secrecy | No credentials required/added by this wave | Repository policy | PRESERVE | Provider activation outside source control |

## Provider and external dependency matrix

| Dependency | Current repository contract | External material required | Repository code still required | Activation rule |
| --- | --- | --- | --- | --- |
| Analytics MySQL | Dedicated DB URL, schema/repository/runtime composition exist | Provisioned DB + secret URL | No foundational redesign | Enable only with readiness/migration evidence |
| Analytics retention purge | Purge capability exists | Scheduler/runtime execution | Possibly host scheduling composition if target lacks it | Verify retention task against target environment |
| Email delivery | Provider-neutral `NotificationProvider` exists | Provider account + API credential/domain setup | Concrete adapter + durable worker | Activate only after preferences/idempotency are durable |
| SMS delivery | Provider-neutral `NotificationProvider` exists | Provider account + API credential/sender setup | Concrete adapter + durable worker | Same as email |
| Web Push | Permission abstraction exists | VAPID/provider material + real browser subscription | Subscription store, adapter, background handler | Explicit user opt-in only |
| APNs/FCM | Push channel is abstract | APNs/FCM project/credentials | Adapter if selected | Never embed credentials in client/source |
| Background Sync | No generic authority contract | Browser support varies | Allowlisted replay-safe queue/sync implementation | Domain-by-domain opt-in only |
| Device installability | Manifest/SW exist | Physical/browser matrix | No base rewrite unless failures reveal defects | Certification evidence belongs to exact release SHA |

## Capability/evidence distinctions

### Capability implemented and executable

A capability is classified as implemented only when current-main code contains the behavior and there is executable evidence covering its essential contract.

Examples:

- Analytics sanitation;
- Analytics durable ingestion;
- Notification duplicate suppression contract;
- PWA network-only API behavior.

### Foundation implemented, production effect absent

A portable interface or implementation can be valid while production activation remains absent.

Examples:

- Analytics MySQL repository without provisioned production DB;
- Notification provider interface without email/SMS/Push credentials;
- Push permission gate without a stored Push subscription.

### Documentation-only boundary

Some documents explicitly state what a wave did **not** implement. These statements are used as absence/boundary evidence, never promoted to a capability.

Examples:

- no durable Notification queue/outbox;
- no background sync;
- no production provider activation.

## Independent follow-up ChangeSet graph

```text
MD-W2-ANALYTICS-PRODUCTION-ACTIVATION
  └─ independent of Notifications and Offline code waves

MD-W2-NOTIFICATIONS-DURABILITY
  ├─> MD-W2-NOTIFICATIONS-PROVIDERS
  └─> MD-W2-WEB-PUSH-LIFECYCLE

MD-W2-OFFLINE-DOMAIN-READ-MODELS
  └─ independent of Notifications
      └─ may inform MD-W2-OFFLINE-SAFE-SYNC

MD-W2-OFFLINE-SAFE-SYNC
  └─ requires explicit per-domain replay-safe proof

MD-W2-ENGAGEMENT-ORCHESTRATION
  └─ consumes existing source-domain events
     and should depend only on the delivery capabilities it actually uses
```

## No-foundation-replacement rules

Subsequent ChangeSets must not:

- create a second Analytics event schema;
- bypass Analytics consent/sanitation;
- replace the current Notification dispatcher semantics;
- send before preference checks;
- implement non-atomic production notification idempotency;
- auto-request Push permission on bootstrap;
- make the Service Worker a generic API cache;
- queue arbitrary non-GET requests;
- make offline state authoritative for payment, order, reservation confirmation, ticket issuance or Auth;
- commit provider credentials;
- infer production activation from the presence of code.

## Audit acceptance mapping

| Acceptance item | Result |
| --- | --- |
| Inventory Analytics, events and privacy boundaries | PASS |
| Inventory provider-neutral Notifications, templates, preferences and idempotency | PASS |
| Inventory manifest, Service Worker, offline shell, update flow and network-only APIs | PASS |
| Identify real provider/delivery, background-sync and offline-domain gaps | PASS |
| Separate implemented capability from documented-only capability | PASS |
| Separate code gaps from external/provider effects | PASS |
| Prepare independent subsequent ChangeSets where possible | PASS |
| Preserve existing foundations | PASS |
| Runtime diff | NONE by design |

## Final classification

Current main is **not missing the foundations**.

The recovery program should close production/runtime gaps additively while preserving:

- Analytics privacy-first observational semantics;
- Notification provider neutrality, preference ordering and idempotency;
- PWA network/server authority boundaries.

This matrix is documentation-only and introduces no runtime authority.

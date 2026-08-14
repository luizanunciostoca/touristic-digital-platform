# Payments / Ordering / Financial — Migration Matrix (M139 HTTP/Auth/security)

## Status semantics

- `PASS` — V2 exposes the audited contract with executable evidence at the current layer.
- `PARTIAL` — a reusable V2 primitive/port exists, but execution or durable integration is incomplete.
- `GAP` — no V2 Payments/Financial equivalent exists yet.
- `N/A` — contract intentionally belongs to another feature and must only be consumed.

## Frozen sources

- V1: `luizidebook/morro-de-sao-paulo-digital@60746fd7fed97b805758b37adfdbe3bad2582bfe`;
- V1 server: `server/business-checkout.js`;
- V1 browser: `js/onboarding/runtime/business-checkout-client.js`;
- V1 tests: `server/__tests__/business-checkout.test.js`;
- V2 baseline checkpoint: `luizidebook/touristic-digital-platform@881b5a2a943f00325b90a9d0f75d7a291d9cbeae` (M135);
- V2 Business handoff: `@touristic/business/onboarding-commercial-conversion`.

## M139 implementation boundary

M139 builds on the provider-neutral M138 application and the separate M137 MySQL stores. It adds an HTTP/Auth/security adapter without moving provider authority into Business and without calling any payment provider.

The create route revalidates the complete handoff, binds the exact Business logical idempotency header, enforces an exact return-origin allowlist and accepts either a platform session protected by origin/CSRF/role/business scope or a short-lived HMAC guest capability bound to the entire normalized handoff, destination and tenant.

A durable `ordering_checkout_access` record binds Order, Payment, request fingerprint and requester context. The public status token is deterministic for safe exact retry, but plaintext is never stored: MySQL receives only its SHA-256 hash. Status lookup uses timing-safe verification, identical 404 projections for unknown/invalid authority and a minimal non-PII result.

The Morro Digital Node runtime parses bounded JSON, composes both database pools, pricing, repositories and transport, propagates correlation IDs and fails closed when any required database, catalog, secret, destination or origin policy is missing. Rate limiting is deliberately single-process in M139 and therefore remains PARTIAL for a horizontally scaled deployment.

M139 still adds **no** provider adapter/SDK/call, provider checkout URL, webhook endpoint, verified payment outcome, browser checkout, subscription runtime or real money movement.

## Matrix

| Contract                                | Frozen V1 / architecture evidence                                                               | V2 state at M138                                                                                                                                           | Status  | Migration decision                                                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Business commercial preparation         | V1 commercial adapter prepares plan/contractor/terms                                            | M61/M62 provide the immutable Business-owned handoff; M138 consumes and revalidates it without moving ownership                                            | N/A     | Business remains owner; Ordering receives only a bounded application request.                                                   |
| Payments ownership boundary             | checkout client/server perform financial execution                                              | Domain packages plus M138 application composition keep provider/financial authority outside Business                                                       | PASS    | Preserve this direction in HTTP and provider milestones.                                                                        |
| Server-authoritative plan pricing       | `BUSINESS_PLANS_JSON`; browser supplies only `planId`                                           | required `ORDERING_PRICING_CATALOG_JSON`, immutable `PricingQuote`/snapshot, integer minor units, duplicate/zero/malformed fail-closed behavior            | PASS    | Operations must configure a versioned server catalog; browser amounts are ignored.                                              |
| Checkout input normalization/validation | session, plan, contractor, sandbox draft, required terms | M138 application validation plus M139 bounded JSON, exact return-origin policy and authenticated/signed requester boundary | PASS | Transport cannot weaken the server application validation. |
| Logical checkout/order identity         | V1 `bco_<uuid>`                                                                                 | cryptographically random server Order/Payment IDs are validated before durable persistence; logical Business request key remains separate                  | PASS    | Public checkout identity/token remains a later HTTP/security concern.                                                           |
| Client idempotency key | `business:<sessionId>:<planId>` | M139 requires the exact derived `Idempotency-Key` before application execution; absent/divergent headers fail deterministically | PASS | Keep the header and durable request key coupled before any provider call. |
| Server idempotency                      | repository lookup before provider call                                                          | M138 finds/claims durable `payment:v1:<orderReference>` before any future provider and repairs a claim without Payment after interruption                  | PASS    | Provider execution must reuse this authority and never invent a second key.                                                     |
| Checkout session creation API | `POST /api/business-checkout/sessions` | versioned `POST /api/payments/v1/checkouts` returns authoritative pending Order/Payment, plan snapshot and bounded status capability | PASS | Provider creation remains a separate port execution contract. |
| Provider port                           | V1 calls configured payment API URL/token                                                       | provider-neutral `FinancialCheckoutProviderPort` + `FinancialWebhookVerifierPort`; no SDK/import in domain                                                 | PASS    | Future adapters implement these ports server-side.                                                                              |
| Provider checkout creation | external reference, amount/currency, payer, return URL, webhook URL, metadata | M139 stops at authoritative pending Order/Payment and performs no provider request | GAP | M140 implements only behind the frozen provider port and M139 authority. |
| Public checkout token | cryptographic 24-byte random token, timing-safe comparison | opaque HMAC-derived `cst_v1_*` capability, SHA-256-only persistence, timing-safe exact verification and bounded expiry | PASS | Never persist or log plaintext; secret rotation intentionally invalidates existing capabilities. |
| Public payment status | limited projection under `/sessions/:id` | `GET /api/payments/v1/checkouts/:orderId` returns a minimal non-PII projection; invalid token and unknown Order share the same 404 | PASS | Provider/Business outcome fields remain null until later authoritative composition. |
| Browser checkout launch                 | popup `noopener,noreferrer`, location fallback                                                  | V2 Business does not execute checkout; Payments browser adapter absent                                                                                     | GAP     | Add after protected server lifecycle exists.                                                                                    |
| Browser confirmation wait               | poll every 2.5 s, max 240 attempts                                                              | absent                                                                                                                                                     | GAP     | Preserve bounded wait/result semantics; transport may evolve.                                                                   |
| Browser verified-payment event          | `businessPaymentVerified` after server says `CONFIRMED`                                         | Business consumer exists; Financial exposes versioned `PaymentApproved`; adapter to Business absent                                                        | PARTIAL | Later composition maps authoritative payment result to Business correlation.                                                    |
| Browser failure event                   | `businessPaymentVerificationFailed`                                                             | Business fail-closed consumer exists; Financial statuses/events provide vocabulary, producer/browser adapter absent                                        | PARTIAL | Add typed Payments failure result without synthetic confirmation.                                                               |
| Webhook authenticity | HMAC-SHA256 over raw body + timing-safe compare | `FinancialWebhookVerifierPort` freezes verification boundary and raw-body contract; cryptographic provider adapter absent | PARTIAL | M141 must verify the selected sandbox provider signature before parsing/mutation. |
| Webhook unmatched handling              | valid unknown event -> 202 matched false                                                        | absent                                                                                                                                                     | GAP     | Preserve non-leaking acknowledgement semantics in HTTP layer.                                                                   |
| Webhook replay/idempotency              | repeated `CONFIRMED` record does not reconvert                                                  | provider event identity vocabulary exists, but durable event dedup/out-of-order store is absent                                                            | GAP     | Add durable provider-event claim before state mutation.                                                                         |
| Payment state authority                 | paid/approved/confirmed -> `CONFIRMED`; non-paid does not promote                               | domain transition guards plus repository compare-and-swap prevent invalid/stale lifecycle overwrites; application orchestration is absent                  | PARTIAL | Apply verified provider outcomes atomically in the later payment-state service.                                                 |
| Business conversion after payment       | confirmed payment creates non-publishable conversion                                            | Business verified-payment consumer + provider-agnostic `PaymentApproved` event exist; bridge absent                                                        | PARTIAL | Financial result producer must remain separate from Business activation.                                                        |
| Durable payment persistence             | V1 reference implementation is memory-only                                                      | `MySqlPaymentRepository` persists validated Payment state with immutable amount/subject/idempotency, canonical UTC and optimistic concurrency              | PASS    | Keep provider execution outside the repository and add integration/database tests before release.                               |
| Order model                             | architecture CAP-0015 requires `OrderPlaced`                                                    | durable Order plus M138 allocation, authoritative snapshot and `draft → pending_payment` composition are executable; retries never reprice                 | PASS    | Event publication/outbox remains a later operational concern.                                                                   |
| Financial ledger                        | architecture CAP-0016/0017 and Domain Map define Financial as money source of truth             | balanced domain ledger plus transactional MySQL header/postings append, full rollback, exact-replay idempotency and corruption checks                      | PASS    | Operational posting/reversal/reconciliation remain later milestones.                                                            |
| Refund/reversal                         | architecture requires refund events/financial correctness; V1 checkout slice has no formal flow | `refunded` terminal state + `PaymentRefunded` v1 event exist; refund application/ledger reversal/provider flow absent                                      | PARTIAL | Implement deterministic reversal only after durable Payment/Ledger.                                                             |
| Reconciliation                          | Release/Financial architecture requires reconciliation                                          | absent                                                                                                                                                     | GAP     | Provider state must reconcile against internal Payment/Ledger.                                                                  |
| Split/repasse                           | CAP-0017                                                                                        | balanced ledger foundation exists, but no split/transfer/settlement model                                                                                  | GAP     | Implement only after durable ledger and reconciliation.                                                                         |
| Subscription lifecycle                  | FEATURE-0009 is "Pagamentos e Assinaturas"; V1 frozen slice only covers initial checkout        | absent                                                                                                                                                     | GAP     | Freeze recurrence semantics separately; do not infer them from checkout.                                                        |
| Financial audit/observability | architecture requires audit/metrics; M134 covers provider-cost ops only, not product money | M139 emits structured checkout create/status/runtime audit with correlation and no PII/token; durable audit, metrics and financial-operation telemetry remain absent | PARTIAL | Add durable/central observability around verified provider and ledger operations. |
| Sandbox/provider E2E                    | V1 has injected fetch tests; architecture requires payment sandbox                              | no provider adapter or sandbox integration                                                                                                                 | GAP     | Require deterministic adapter tests plus provider sandbox before equivalence.                                                   |
| Rate limiting | V1 create/status optionally 12/minute | M139 enforces 12/min create and 60/min status with bounded in-memory buckets keyed by requester/IP | PARTIAL | Replace/compose with a distributed limiter before horizontally scaled production. |
| Auth/tenant context | platform Auth exists; V1 checkout is onboarding session oriented | authenticated requests require valid session, origin, CSRF, mutation role and business scope; guests require a short-lived signed full-handoff capability bound to destination/tenant | PASS | Business may issue the guest capability server-side; browsers never mint authority. |
| Rollback/migration strategy | release process requires migration and rollback | M139 adds only an additive access-authority table and provider-neutral runtime; removing routes leaves M137/M138 Order/Payment data intact and no external side effect exists | PARTIAL | Use expand/contract for future provider-event/reconciliation schemas and explicit compensation after external side effects. |

## M139 score

- `PASS`: 14
- `PARTIAL`: 9
- `GAP`: 10
- `N/A`: 1
- total: 34

M139 closes the provider-neutral HTTP/Auth/security boundary. Provider execution, webhook, browser, verified Business activation, reconciliation, settlement and subscription contracts remain deliberately below PASS.

## Promotion decision

After M139 and green Quality plus Payments Persistence Integration gates on the final head:

- `FEATURE-0009` and `MIG-0010` remain `migrating`;
- behavior/visual/API equivalence flags remain `false`;
- `@touristic/ordering-server` owns durable checkout access and transport security;
- the Morro Digital Node adapter composes Auth, two domain databases and the versioned routes fail-closed;
- no payment provider, checkout URL or money movement is enabled.

## Next milestone

M140 should implement one sandbox payment provider behind `FinancialCheckoutProviderPort`:

1. provider configuration and credentials remain server-only and fail-closed;
2. exact mapping from authoritative Payment/Order to provider request;
3. provider idempotency reuses `payment:v1:<orderReference>`;
4. timeouts, normalized failures and safe audit without secrets/PII;
5. deterministic adapter tests plus a real sandbox contract gate;
6. no provider outcome is trusted until a later cryptographically verified webhook milestone.

Webhook replay protection is M141. Authoritative provider outcome application and Business verified-result composition remain later milestones. Affiliates stays blocked.

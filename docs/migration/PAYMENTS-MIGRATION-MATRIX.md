# Payments / Ordering / Financial — Migration Matrix (M138 checkout application)

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

## M138 implementation boundary

M138 builds on the M137 repositories without adding a provider or transport. The provider-neutral application service in `@touristic/ordering` now composes the public Ordering and Financial ports.

The application boundary revalidates the immutable Business handoff, resolves new Orders through the required server-only `ORDERING_PRICING_CATALOG_JSON`, allocates cryptographically random server identities, persists Order/Payment and claims `payment:v1:<orderReference>`.

Retries first load the existing Order by `business:<sessionId>:<planId>`; therefore a previously captured price is never replaced by a newer catalog value. Because Ordering and Financial intentionally own separate databases, the service does not claim distributed ACID. It instead leaves durable checkpoints and repairs a missing Payment/order transition idempotently after interruption. A permanent MySQL 8.4 test proves this sequence across the two real schemas.

The result exposes Order/Payment state only. Contractor PII, provider URL/token, public checkout token and provider details are not returned.

M138 still adds **no** HTTP/Auth checkout boundary, provider adapter/SDK, provider call, webhook endpoint, browser checkout, subscription runtime or real money movement.

## Matrix

| Contract                                | Frozen V1 / architecture evidence                                                               | V2 state at M138                                                                                                                                           | Status  | Migration decision                                                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Business commercial preparation         | V1 commercial adapter prepares plan/contractor/terms                                            | M61/M62 provide the immutable Business-owned handoff; M138 consumes and revalidates it without moving ownership                                            | N/A     | Business remains owner; Ordering receives only a bounded application request.                                                   |
| Payments ownership boundary             | checkout client/server perform financial execution                                              | Domain packages plus M138 application composition keep provider/financial authority outside Business                                                       | PASS    | Preserve this direction in HTTP and provider milestones.                                                                        |
| Server-authoritative plan pricing       | `BUSINESS_PLANS_JSON`; browser supplies only `planId`                                           | required `ORDERING_PRICING_CATALOG_JSON`, immutable `PricingQuote`/snapshot, integer minor units, duplicate/zero/malformed fail-closed behavior            | PASS    | Operations must configure a versioned server catalog; browser amounts are ignored.                                              |
| Checkout input normalization/validation | session, plan, contractor, sandbox draft, required terms                                        | M138 revalidates bounded contractor/draft/acceptances/return URL, requires sandbox + `publishable=false`, terms/privacy and the Payments capability marker | PASS    | HTTP may add authentication/allowlists but cannot weaken this application boundary.                                             |
| Logical checkout/order identity         | V1 `bco_<uuid>`                                                                                 | cryptographically random server Order/Payment IDs are validated before durable persistence; logical Business request key remains separate                  | PASS    | Public checkout identity/token remains a later HTTP/security concern.                                                           |
| Client idempotency key                  | `business:<sessionId>:<planId>`                                                                 | application service derives and consumes the logical key, loads it before pricing and returns the same Order/Payment; HTTP header enforcement is absent    | PARTIAL | M139 must bind the authenticated/bounded HTTP request to this correlation.                                                      |
| Server idempotency                      | repository lookup before provider call                                                          | M138 finds/claims durable `payment:v1:<orderReference>` before any future provider and repairs a claim without Payment after interruption                  | PASS    | Provider execution must reuse this authority and never invent a second key.                                                     |
| Checkout session creation API           | `POST /api/business-checkout/sessions`                                                          | no V2 Payments HTTP surface                                                                                                                                | GAP     | Build only after persistence and application service.                                                                           |
| Provider port                           | V1 calls configured payment API URL/token                                                       | provider-neutral `FinancialCheckoutProviderPort` + `FinancialWebhookVerifierPort`; no SDK/import in domain                                                 | PASS    | Future adapters implement these ports server-side.                                                                              |
| Provider checkout creation              | external reference, amount/currency, payer, return URL, webhook URL, metadata                   | M138 prepares authoritative pending Order/Payment only; it deliberately makes no provider request                                                          | GAP     | Implement only behind the frozen provider port after M139 HTTP/Auth/security.                                                   |
| Public checkout token                   | cryptographic 24-byte random token, timing-safe comparison                                      | absent                                                                                                                                                     | GAP     | Preserve bounded public access with server-side token handling.                                                                 |
| Public payment status                   | limited projection under `/sessions/:id`                                                        | absent                                                                                                                                                     | GAP     | Expose minimal projection after persistence.                                                                                    |
| Browser checkout launch                 | popup `noopener,noreferrer`, location fallback                                                  | V2 Business does not execute checkout; Payments browser adapter absent                                                                                     | GAP     | Add after protected server lifecycle exists.                                                                                    |
| Browser confirmation wait               | poll every 2.5 s, max 240 attempts                                                              | absent                                                                                                                                                     | GAP     | Preserve bounded wait/result semantics; transport may evolve.                                                                   |
| Browser verified-payment event          | `businessPaymentVerified` after server says `CONFIRMED`                                         | Business consumer exists; Financial exposes versioned `PaymentApproved`; adapter to Business absent                                                        | PARTIAL | Later composition maps authoritative payment result to Business correlation.                                                    |
| Browser failure event                   | `businessPaymentVerificationFailed`                                                             | Business fail-closed consumer exists; Financial statuses/events provide vocabulary, producer/browser adapter absent                                        | PARTIAL | Add typed Payments failure result without synthetic confirmation.                                                               |
| Webhook authenticity                    | HMAC-SHA256 over raw body + timing-safe compare                                                 | `FinancialWebhookVerifierPort` freezes verification boundary and raw-body contract; cryptographic adapter absent                                           | PARTIAL | M139+ provider adapter implements and proves HMAC/signature semantics.                                                          |
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
| Financial audit/observability           | architecture requires audit/metrics; M134 covers provider-cost ops only, not product money      | versioned Order/Payment events and immutable ledger vocabulary exist; durable audit/metrics/correlation runtime absent                                     | PARTIAL | Add audit/metrics around persisted operations; never reuse M134 budget as ledger.                                               |
| Sandbox/provider E2E                    | V1 has injected fetch tests; architecture requires payment sandbox                              | no provider adapter or sandbox integration                                                                                                                 | GAP     | Require deterministic adapter tests plus provider sandbox before equivalence.                                                   |
| Rate limiting                           | V1 create/status optionally 12/minute                                                           | no Payments HTTP surface                                                                                                                                   | GAP     | Define route-specific limits when HTTP layer is introduced.                                                                     |
| Auth/tenant context                     | platform Auth exists; V1 checkout is onboarding session oriented                                | reusable Auth primitives exist; Ordering/Financial are framework-independent and composition is intentionally absent                                       | PARTIAL | Apply Auth/tenant policy in HTTP/application composition, not domain value objects.                                             |
| Rollback/migration strategy             | release process requires migration and rollback                                                 | M137 additive schemas remain non-destructive; M138 adds no schema and proves recoverable cross-database checkpoints instead of claiming distributed ACID   | PARTIAL | Future schema changes need versioned expand/contract migrations; provider execution needs explicit compensation/reconciliation. |

## M138 score

- `PASS`: 9
- `PARTIAL`: 10
- `GAP`: 14
- `N/A`: 1
- total: 34

M138 closes the provider-neutral checkout application and authoritative pricing layer. Provider execution, HTTP/public status, webhook, browser, reconciliation, settlement and subscription contracts remain deliberately below PASS.

## Promotion decision

After M138 and a green Quality Gate on the final head:

- `FEATURE-0009` and `MIG-0010` remain `migrating`;
- behavior/visual/API equivalence flags remain `false`;
- `@touristic/ordering` owns the provider-neutral application service;
- `@touristic/ordering-server` owns server pricing configuration and identity/clock adapters;
- no payment provider, checkout route or money movement is enabled.

## Next milestone

M139 should implement the HTTP/Auth/security boundary:

1. versioned create/status contracts and stable error mapping;
2. authenticated or explicitly bounded guest context;
3. destination/tenant/correlation propagation;
4. strict request body and idempotency binding;
5. safe return URL policy;
6. minimal non-PII status projection;
7. cryptographic public status capability with timing-safe comparison;
8. route-specific rate limits and structured audit/observability.

Provider sandbox execution remains M140. Cryptographically verified webhook replay protection, authoritative provider outcome application and Business verified-result composition remain separate later milestones. Affiliates stays blocked.

# Payments / Ordering / Financial — Migration Matrix (M137 durable persistence)

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

## M137 implementation boundary

M137 preserves the framework-independent M136 domains and adds two server-side MySQL adapter packages:

```text
@touristic/ordering-server
@touristic/financial-server
```

`@touristic/ordering-server` owns durable Order storage under `ORDERING_DATABASE_URL`. `@touristic/financial-server` independently owns Payment, payment-idempotency claims and append-only Ledger storage under `FINANCIAL_DATABASE_URL`.

The adapters enforce parameterized access, exact case-sensitive identities, JavaScript safe-integer money constraints, canonical UTC timestamps, immutable commercial/financial fields, compare-and-swap lifecycle updates and fail-closed collision handling.

Ledger transaction headers and postings commit through one MySQL transaction; any failed posting rolls the whole append back. Exact duplicate external keys are idempotent only when the complete immutable ledger content matches.

M137 still adds **no** provider adapter/SDK, checkout application service, HTTP route, webhook endpoint, public token, browser checkout, subscription runtime or real money movement.

Ordering may consume Financial public contracts. Financial and Financial Server do not import Ordering, Business, UI or provider SDKs; the permanent architecture check now enforces this direction.

## Matrix

| Contract                                | Frozen V1 / architecture evidence                                                               | V2 state at M137                                                                                                                   | Status  | Migration decision                                                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------- |
| Business commercial preparation         | V1 commercial adapter prepares plan/contractor/terms                                            | M61/M62 already provide immutable Business-owned handoff                                                                           | N/A     | Business remains owner; Ordering/Financial consume the handoff through future composition.    |
| Payments ownership boundary             | checkout client/server perform financial execution                                              | Domain Map + physical `@touristic/ordering` / `@touristic/financial`; Business remains outside execution                           | PASS    | Keep provider/financial authority outside Business.                                           |
| Server-authoritative plan pricing       | `BUSINESS_PLANS_JSON`; browser supplies only `planId`                                           | `OrderPricingAuthorityPort`, `PricingQuote` and immutable `OrderPricingSnapshot` exist; concrete source absent                     | PARTIAL | Implement authoritative pricing adapter/application service next; never trust browser amount. |
| Checkout input normalization/validation | session, plan, contractor, sandbox draft, required terms                                        | Business handoff validates commercial input; Ordering validates source/key/pricing; Payments application revalidation still absent | PARTIAL | Revalidate complete handoff at future application boundary.                                   |
| Logical checkout/order identity | V1 `bco_<uuid>` | typed IDs plus durable Order/Payment repositories persist server-supplied identities; allocation service is absent | PARTIAL | Generate cryptographically strong IDs in M138 before persistence. |
| Client idempotency key                  | `business:<sessionId>:<planId>`                                                                 | `createBusinessOrderRequestKey()` preserves the logical V1 request identity; no Payments browser/API consumer yet                  | PARTIAL | Keep Business correlation separate from provider/payment authority.                           |
| Server idempotency | repository lookup before provider call | `MySqlPaymentIdempotencyPort` atomically claims `payment:v1:<orderReference>` under exact unique key/payment constraints and validates persisted mappings | PASS | M138 composition must claim before any future provider call. |
| Checkout session creation API           | `POST /api/business-checkout/sessions`                                                          | no V2 Payments HTTP surface                                                                                                        | GAP     | Build only after persistence and application service.                                         |
| Provider port                           | V1 calls configured payment API URL/token                                                       | provider-neutral `FinancialCheckoutProviderPort` + `FinancialWebhookVerifierPort`; no SDK/import in domain                         | PASS    | Future adapters implement these ports server-side.                                            |
| Provider checkout creation              | external reference, amount/currency, payer, return URL, webhook URL, metadata                   | request/session contracts exist, but no application service or adapter executes them                                               | GAP     | Implement after pricing/idempotency/persistence primitives.                                   |
| Public checkout token                   | cryptographic 24-byte random token, timing-safe comparison                                      | absent                                                                                                                             | GAP     | Preserve bounded public access with server-side token handling.                               |
| Public payment status                   | limited projection under `/sessions/:id`                                                        | absent                                                                                                                             | GAP     | Expose minimal projection after persistence.                                                  |
| Browser checkout launch                 | popup `noopener,noreferrer`, location fallback                                                  | V2 Business does not execute checkout; Payments browser adapter absent                                                             | GAP     | Add after protected server lifecycle exists.                                                  |
| Browser confirmation wait               | poll every 2.5 s, max 240 attempts                                                              | absent                                                                                                                             | GAP     | Preserve bounded wait/result semantics; transport may evolve.                                 |
| Browser verified-payment event          | `businessPaymentVerified` after server says `CONFIRMED`                                         | Business consumer exists; Financial exposes versioned `PaymentApproved`; adapter to Business absent                                | PARTIAL | Later composition maps authoritative payment result to Business correlation.                  |
| Browser failure event                   | `businessPaymentVerificationFailed`                                                             | Business fail-closed consumer exists; Financial statuses/events provide vocabulary, producer/browser adapter absent                | PARTIAL | Add typed Payments failure result without synthetic confirmation.                             |
| Webhook authenticity                    | HMAC-SHA256 over raw body + timing-safe compare                                                 | `FinancialWebhookVerifierPort` freezes verification boundary and raw-body contract; cryptographic adapter absent                   | PARTIAL | M139+ provider adapter implements and proves HMAC/signature semantics.                        |
| Webhook unmatched handling              | valid unknown event -> 202 matched false                                                        | absent                                                                                                                             | GAP     | Preserve non-leaking acknowledgement semantics in HTTP layer.                                 |
| Webhook replay/idempotency              | repeated `CONFIRMED` record does not reconvert                                                  | provider event identity vocabulary exists, but durable event dedup/out-of-order store is absent                                    | GAP     | Add durable provider-event claim before state mutation.                                       |
| Payment state authority | paid/approved/confirmed -> `CONFIRMED`; non-paid does not promote | domain transition guards plus repository compare-and-swap prevent invalid/stale lifecycle overwrites; application orchestration is absent | PARTIAL | Apply verified provider outcomes atomically in the later payment-state service. |
| Business conversion after payment       | confirmed payment creates non-publishable conversion                                            | Business verified-payment consumer + provider-agnostic `PaymentApproved` event exist; bridge absent                                | PARTIAL | Financial result producer must remain separate from Business activation.                      |
| Durable payment persistence | V1 reference implementation is memory-only | `MySqlPaymentRepository` persists validated Payment state with immutable amount/subject/idempotency, canonical UTC and optimistic concurrency | PASS | Keep provider execution outside the repository and add integration/database tests before release. |
| Order model | architecture CAP-0015 requires `OrderPlaced` | immutable Order/pricing/event model plus `MySqlOrderRepository` durable storage, unique request keys and compare-and-swap lifecycle updates | PASS | M138 allocates identities and composes authoritative pricing without provider details. |
| Financial ledger | architecture CAP-0016/0017 and Domain Map define Financial as money source of truth | balanced domain ledger plus transactional MySQL header/postings append, full rollback, exact-replay idempotency and corruption checks | PASS | Operational posting/reversal/reconciliation remain later milestones. |
| Refund/reversal                         | architecture requires refund events/financial correctness; V1 checkout slice has no formal flow | `refunded` terminal state + `PaymentRefunded` v1 event exist; refund application/ledger reversal/provider flow absent              | PARTIAL | Implement deterministic reversal only after durable Payment/Ledger.                           |
| Reconciliation                          | Release/Financial architecture requires reconciliation                                          | absent                                                                                                                             | GAP     | Provider state must reconcile against internal Payment/Ledger.                                |
| Split/repasse                           | CAP-0017                                                                                        | balanced ledger foundation exists, but no split/transfer/settlement model                                                          | GAP     | Implement only after durable ledger and reconciliation.                                       |
| Subscription lifecycle                  | FEATURE-0009 is "Pagamentos e Assinaturas"; V1 frozen slice only covers initial checkout        | absent                                                                                                                             | GAP     | Freeze recurrence semantics separately; do not infer them from checkout.                      |
| Financial audit/observability           | architecture requires audit/metrics; M134 covers provider-cost ops only, not product money      | versioned Order/Payment events and immutable ledger vocabulary exist; durable audit/metrics/correlation runtime absent             | PARTIAL | Add audit/metrics around persisted operations; never reuse M134 budget as ledger.             |
| Sandbox/provider E2E                    | V1 has injected fetch tests; architecture requires payment sandbox                              | no provider adapter or sandbox integration                                                                                         | GAP     | Require deterministic adapter tests plus provider sandbox before equivalence.                 |
| Rate limiting                           | V1 create/status optionally 12/minute                                                           | no Payments HTTP surface                                                                                                           | GAP     | Define route-specific limits when HTTP layer is introduced.                                   |
| Auth/tenant context                     | platform Auth exists; V1 checkout is onboarding session oriented                                | reusable Auth primitives exist; Ordering/Financial are framework-independent and composition is intentionally absent               | PARTIAL | Apply Auth/tenant policy in HTTP/application composition, not domain value objects.           |
| Rollback/migration strategy | release process requires migration and rollback | additive `CREATE TABLE IF NOT EXISTS` baseline, separate domain databases, non-destructive code rollback and transactional DML are defined; general expand/contract evolution is not yet automated | PARTIAL | Future schema changes must be versioned expand/contract migrations; never drop financial data during rollback. |

## M137 score

- `PASS`: 6
- `PARTIAL`: 13
- `GAP`: 14
- `N/A`: 1
- total: 34

M137 closes the durable Order/Payment/idempotency/Ledger adapter layer without enabling payment execution. Provider, HTTP, webhook, browser, reconciliation, settlement and subscription contracts remain deliberately below PASS.

## Promotion decision

After M137 and a green Quality Gate on the final head:

- `FEATURE-0009` and `MIG-0010` remain `migrating`;
- behavior/visual/API equivalence flags remain `false`;
- `@touristic/ordering-server` and `@touristic/financial-server` become canonical physical targets;
- no payment provider, checkout route or money movement is enabled.

## Next milestone

M138 should implement the provider-neutral checkout application service and authoritative pricing composition:

1. revalidate the immutable Business handoff;
2. resolve the official plan through `OrderPricingAuthorityPort`;
3. allocate server-owned Order/Payment identities;
4. persist Order and Payment through the M137 adapters;
5. claim the stable financial idempotency key before any future provider call;
6. return a provider-neutral application result with no HTTP or SDK coupling.

HTTP/Auth/security, sandbox provider execution and cryptographically verified webhook replay protection remain separate later milestones. Affiliates remains blocked until authoritative Payment/Ledger events and reversals exist.

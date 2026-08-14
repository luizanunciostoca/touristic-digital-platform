# Payments / Ordering / Financial — Migration Matrix (M136 domain vocabulary)

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

## M136 implementation boundary

M136 materializes two framework-independent packages:

```text
@touristic/ordering
@touristic/financial
```

It deliberately adds **no** provider adapter, HTTP route, database adapter, webhook endpoint, browser checkout or real money movement.

`@touristic/financial` owns:

- `Money` as non-negative safe-integer minor units + ISO-style three-letter currency;
- typed Payment/Ledger/Event identities;
- server-owned versioned payment idempotency-key derivation;
- explicit Payment lifecycle transitions;
- Payment repository/idempotency ports;
- provider-neutral checkout and webhook-verifier ports;
- balanced double-entry Ledger vocabulary and repository port;
- versioned `PaymentApproved` / `PaymentRefunded` events.

`@touristic/ordering` owns:

- typed Order identity;
- V1-equivalent logical Business request key;
- server-authoritative pricing quote/snapshot vocabulary;
- Order lifecycle;
- Order repository and pricing-authority ports;
- versioned `OrderPlaced` event.

Ordering may consume Financial public contracts. Financial does not import Ordering, Business, Marketplace or provider SDKs, preventing a dependency cycle and keeping Financial independent from UI/domain consumers.

## Matrix

| Contract                                | Frozen V1 / architecture evidence                                                               | V2 state at M136                                                                                                                   | Status  | Migration decision                                                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------- |
| Business commercial preparation         | V1 commercial adapter prepares plan/contractor/terms                                            | M61/M62 already provide immutable Business-owned handoff                                                                           | N/A     | Business remains owner; Ordering/Financial consume the handoff through future composition.    |
| Payments ownership boundary             | checkout client/server perform financial execution                                              | Domain Map + physical `@touristic/ordering` / `@touristic/financial`; Business remains outside execution                           | PASS    | Keep provider/financial authority outside Business.                                           |
| Server-authoritative plan pricing       | `BUSINESS_PLANS_JSON`; browser supplies only `planId`                                           | `OrderPricingAuthorityPort`, `PricingQuote` and immutable `OrderPricingSnapshot` exist; concrete source absent                     | PARTIAL | Implement authoritative pricing adapter/application service next; never trust browser amount. |
| Checkout input normalization/validation | session, plan, contractor, sandbox draft, required terms                                        | Business handoff validates commercial input; Ordering validates source/key/pricing; Payments application revalidation still absent | PARTIAL | Revalidate complete handoff at future application boundary.                                   |
| Logical checkout/order identity         | V1 `bco_<uuid>`                                                                                 | typed `OrderId`, `PaymentId`, `LedgerTransactionId`, `FinancialEventId`; durable allocation/persistence absent                     | PARTIAL | Generate and persist identities server-side in M137+.                                         |
| Client idempotency key                  | `business:<sessionId>:<planId>`                                                                 | `createBusinessOrderRequestKey()` preserves the logical V1 request identity; no Payments browser/API consumer yet                  | PARTIAL | Keep Business correlation separate from provider/payment authority.                           |
| Server idempotency                      | repository lookup before provider call                                                          | stable `payment:v1:<orderReference>` key plus atomic `PaymentIdempotencyPort.claim()` contract; durable adapter absent             | PARTIAL | M137 must enforce a durable unique/atomic claim before any provider call.                     |
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
| Payment state authority                 | paid/approved/confirmed -> `CONFIRMED`; non-paid does not promote                               | explicit `PaymentStatus`, `isPaymentTransitionAllowed` and fail-closed assertion; no application/persistence composition           | PARTIAL | Application service must apply transitions atomically against persisted state.                |
| Business conversion after payment       | confirmed payment creates non-publishable conversion                                            | Business verified-payment consumer + provider-agnostic `PaymentApproved` event exist; bridge absent                                | PARTIAL | Financial result producer must remain separate from Business activation.                      |
| Durable payment persistence             | V1 reference implementation is memory-only                                                      | `PaymentRepositoryPort` and atomic idempotency port exist; no MySQL/SQL adapter                                                    | PARTIAL | M137 is the durable persistence milestone.                                                    |
| Order model                             | architecture CAP-0015 requires `OrderPlaced`                                                    | executable immutable Order/pricing/lifecycle model, repository/pricing ports and versioned `OrderPlaced` event                     | PASS    | Keep Order independent of provider internals.                                                 |
| Financial ledger                        | architecture CAP-0016/0017 and Domain Map define Financial as money source of truth             | balanced double-entry `LedgerTransaction`/postings plus repository port and executable balance/currency/overflow invariants        | PARTIAL | Durable append-only persistence and posting application remain open.                          |
| Refund/reversal                         | architecture requires refund events/financial correctness; V1 checkout slice has no formal flow | `refunded` terminal state + `PaymentRefunded` v1 event exist; refund application/ledger reversal/provider flow absent              | PARTIAL | Implement deterministic reversal only after durable Payment/Ledger.                           |
| Reconciliation                          | Release/Financial architecture requires reconciliation                                          | absent                                                                                                                             | GAP     | Provider state must reconcile against internal Payment/Ledger.                                |
| Split/repasse                           | CAP-0017                                                                                        | balanced ledger foundation exists, but no split/transfer/settlement model                                                          | GAP     | Implement only after durable ledger and reconciliation.                                       |
| Subscription lifecycle                  | FEATURE-0009 is "Pagamentos e Assinaturas"; V1 frozen slice only covers initial checkout        | absent                                                                                                                             | GAP     | Freeze recurrence semantics separately; do not infer them from checkout.                      |
| Financial audit/observability           | architecture requires audit/metrics; M134 covers provider-cost ops only, not product money      | versioned Order/Payment events and immutable ledger vocabulary exist; durable audit/metrics/correlation runtime absent             | PARTIAL | Add audit/metrics around persisted operations; never reuse M134 budget as ledger.             |
| Sandbox/provider E2E                    | V1 has injected fetch tests; architecture requires payment sandbox                              | no provider adapter or sandbox integration                                                                                         | GAP     | Require deterministic adapter tests plus provider sandbox before equivalence.                 |
| Rate limiting                           | V1 create/status optionally 12/minute                                                           | no Payments HTTP surface                                                                                                           | GAP     | Define route-specific limits when HTTP layer is introduced.                                   |
| Auth/tenant context                     | platform Auth exists; V1 checkout is onboarding session oriented                                | reusable Auth primitives exist; Ordering/Financial are framework-independent and composition is intentionally absent               | PARTIAL | Apply Auth/tenant policy in HTTP/application composition, not domain value objects.           |
| Rollback/migration strategy             | release process requires migration and rollback                                                 | no financial persistence/migration yet                                                                                             | GAP     | M137+ must use expand/contract and non-destructive rollback paths.                            |

## M136 score

- `PASS`: 3
- `PARTIAL`: 15
- `GAP`: 15
- `N/A`: 1
- total: 34

M136 materially changes the platform from a documented seam to executable domain foundations, but **does not process money**. The score intentionally leaves all provider, HTTP, durable persistence and browser execution contracts below PASS.

## Promotion decision

After M136 and a green Quality Gate on the final head:

- `FEATURE-0009` may move from `baseline-pending` to `migrating`;
- `MIG-0010` may move from `snapshotted` to `migrating`;
- behavior/visual/API equivalence flags remain `false`;
- no payment provider, checkout route or money movement is enabled.

## Next milestone

M137 should implement durable server-side persistence for:

1. Order;
2. Payment;
3. Payment idempotency claim;
4. append-only Ledger transaction storage;
5. provider-event claim/dedup primitive if included in the schema dependency graph.

The persistence layer must prove prepared/parameterized access, constraints, unique idempotency, transactionality and safe schema evolution before any provider call is added.

Affiliates remains after authoritative Payment/Ledger events and reversals exist.

# Payments / Ordering / Financial — Migration Matrix (M141 verified webhook)

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

## M141 implementation boundary

M141 builds on the M140 sandbox checkout adapter but keeps every provider outcome non-authoritative until cryptographic verification and durable claim succeed. The public callback is fixed at `POST /api/payments/v1/webhooks/sandbox`.

The Node runtime retains the exact request bytes under a 64 KiB bound. `SandboxWebhookVerifier` validates `X-Sandbox-Signature: t=<unix-seconds>,v1=<hex>` using HMAC-SHA256 over `<timestamp>.<raw-body>`, timing-safe comparison and a configurable 60–900 second replay window. JSON decoding and event normalization happen only after signature success.

Verified events require a strongly normalized `pwe_*` identity, the M140 Payment ID as external reference, a known provider status and canonical UTC occurrence time. `financial_provider_events` stores the first payload hash, normalized event, receive time and optional matched Payment. Exact replay returns the first receipt; reuse of an event ID with different signed content fails without overwrite.

A valid event whose Payment is unknown remains durably accepted with `matched=false` and HTTP 202, preserving non-leaking V1 semantics and evidence for later reconciliation. M142 applies a matched receipt only after cryptographic verification and durable claim; an exact replay may re-enter the deterministic outcome service solely to replay or recover the same result after interruption.

## Matrix

| Contract                                | Frozen V1 / architecture evidence                                                               | V2 state at M142                                                                                                                                                                         | Status  | Migration decision                                                                                           |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| Business commercial preparation         | V1 commercial adapter prepares plan/contractor/terms                                            | M61/M62 provide the immutable Business-owned handoff; M138 consumes and revalidates it without moving ownership                                                                          | N/A     | Business remains owner; Ordering receives only a bounded application request.                                |
| Payments ownership boundary             | checkout client/server perform financial execution                                              | Domain packages plus M138 application composition keep provider/financial authority outside Business                                                                                     | PASS    | Preserve this direction in HTTP and provider milestones.                                                     |
| Server-authoritative plan pricing       | `BUSINESS_PLANS_JSON`; browser supplies only `planId`                                           | required `ORDERING_PRICING_CATALOG_JSON`, immutable `PricingQuote`/snapshot, integer minor units, duplicate/zero/malformed fail-closed behavior                                          | PASS    | Operations must configure a versioned server catalog; browser amounts are ignored.                           |
| Checkout input normalization/validation | session, plan, contractor, sandbox draft, required terms                                        | M138 application validation plus M139 bounded JSON, exact return-origin policy and authenticated/signed requester boundary                                                               | PASS    | Transport cannot weaken the server application validation.                                                   |
| Logical checkout/order identity         | V1 `bco_<uuid>`                                                                                 | cryptographically random server Order/Payment IDs are validated before durable persistence; logical Business request key remains separate                                                | PASS    | Public checkout identity/token remains a later HTTP/security concern.                                        |
| Client idempotency key                  | `business:<sessionId>:<planId>`                                                                 | M139 requires the exact derived `Idempotency-Key` before application execution; absent/divergent headers fail deterministically                                                          | PASS    | Keep the header and durable request key coupled before any provider call.                                    |
| Server idempotency                      | repository lookup before provider call                                                          | M138 finds/claims durable `payment:v1:<orderReference>` before any future provider and repairs a claim without Payment after interruption                                                | PASS    | Provider execution must reuse this authority and never invent a second key.                                  |
| Checkout session creation API           | `POST /api/business-checkout/sessions`                                                          | versioned `POST /api/payments/v1/checkouts` returns authoritative pending Order/Payment, plan snapshot and bounded status capability                                                     | PASS    | Provider creation remains a separate port execution contract.                                                |
| Provider port                           | V1 calls configured payment API URL/token                                                       | provider-neutral `FinancialCheckoutProviderPort` + `FinancialWebhookVerifierPort`; no SDK/import in domain                                                                               | PASS    | Future adapters implement these ports server-side.                                                           |
| Provider checkout creation              | external reference, amount/currency, payer, return URL, webhook URL, metadata                   | M140 maps the authoritative Payment/Order and validated handoff to the sandbox wire adapter, reuses the durable financial key and returns only an allowlisted checkout URL               | PASS    | Keep provider configuration server-only; no provider response is payment authority.                          |
| Public checkout token                   | cryptographic 24-byte random token, timing-safe comparison                                      | opaque HMAC-derived `cst_v1_*` capability, SHA-256-only persistence, timing-safe exact verification and bounded expiry                                                                   | PASS    | Never persist or log plaintext; secret rotation intentionally invalidates existing capabilities.             |
| Public payment status                   | limited projection under `/sessions/:id`                                                        | M142 keeps capability-bound 404 secrecy and adds a persisted-result projection: approval is Business-compatible, while verified terminal failure remains separate and bounded            | PASS    | A browser return never creates either result; only the verified Financial result repository can populate it. |
| Browser checkout launch                 | popup `noopener,noreferrer`, location fallback                                                  | V2 Business does not execute checkout; Payments browser adapter absent                                                                                                                   | GAP     | Add after protected server lifecycle exists.                                                                 |
| Browser confirmation wait               | poll every 2.5 s, max 240 attempts                                                              | absent                                                                                                                                                                                   | GAP     | Preserve bounded wait/result semantics; transport may evolve.                                                |
| Browser verified-payment event          | `businessPaymentVerified` after server says `CONFIRMED`                                         | Business consumer exists; Financial exposes versioned `PaymentApproved`; adapter to Business absent                                                                                      | PARTIAL | Later composition maps authoritative payment result to Business correlation.                                 |
| Browser failure event                   | `businessPaymentVerificationFailed`                                                             | Business fail-closed consumer exists; Financial statuses/events provide vocabulary, producer/browser adapter absent                                                                      | PARTIAL | Add typed Payments failure result without synthetic confirmation.                                            |
| Webhook authenticity                    | HMAC-SHA256 over raw body + timing-safe compare                                                 | M141 verifies HMAC-SHA256 over exact bounded bytes plus signed timestamp window before parsing, with timing-safe digest comparison                                                       | PASS    | Keep raw-body capture ahead of every parser/proxy transform and rotate the independent secret operationally. |
| Webhook unmatched handling              | valid unknown event -> 202 matched false                                                        | verified unknown Payment references are append-only persisted and acknowledged 202 with matched=false without revealing internal lookup details                                          | PASS    | Reconciliation may later inspect unmatched evidence; webhook retry must remain a safe exact replay.          |
| Webhook replay/idempotency              | repeated `CONFIRMED` record does not reconvert                                                  | provider-event claim remains immutable; exact delivery replay may only replay/recover the same deterministic result, while divergent event-ID reuse still fails without overwrite        | PASS    | Retry after an interrupted Payment/result write converges without a second transition or Business result.    |
| Payment state authority                 | paid/approved/confirmed -> `CONFIRMED`; non-paid does not promote                               | M142 maps verified provider status through the explicit transition table, persists Payment with CAS and preserves stale/out-of-order conflicts as evidence without state fabrication     | PASS    | Only a durably claimed matched verified event reaches the outcome service.                                   |
| Business conversion after payment       | confirmed payment creates non-publishable conversion                                            | a persisted approved result projects the existing Business `verified/sessionId/reference` contract; failure has a distinct projection and no result can publish a Business automatically | PASS    | Business activation remains separate, non-publishable and correlated to the exact onboarding session.        |
| Durable payment persistence             | V1 reference implementation is memory-only                                                      | `MySqlPaymentRepository` persists validated Payment state with immutable amount/subject/idempotency, canonical UTC and optimistic concurrency                                            | PASS    | Keep provider execution outside the repository and add integration/database tests before release.            |
| Order model                             | architecture CAP-0015 requires `OrderPlaced`                                                    | durable Order plus M138 allocation, authoritative snapshot and `draft → pending_payment` composition are executable; retries never reprice                                               | PASS    | Event publication/outbox remains a later operational concern.                                                |
| Financial ledger                        | architecture CAP-0016/0017 and Domain Map define Financial as money source of truth             | balanced domain ledger plus transactional MySQL header/postings append, full rollback, exact-replay idempotency and corruption checks                                                    | PASS    | Operational posting/reversal/reconciliation remain later milestones.                                         |
| Refund/reversal                         | architecture requires refund events/financial correctness; V1 checkout slice has no formal flow | `refunded` terminal state + `PaymentRefunded` v1 event exist; refund application/ledger reversal/provider flow absent                                                                    | PARTIAL | Implement deterministic reversal only after durable Payment/Ledger.                                          |
| Reconciliation                          | Release/Financial architecture requires reconciliation                                          | absent                                                                                                                                                                                   | GAP     | Provider state must reconcile against internal Payment/Ledger.                                               |
| Split/repasse                           | CAP-0017                                                                                        | balanced ledger foundation exists, but no split/transfer/settlement model                                                                                                                | GAP     | Implement only after durable ledger and reconciliation.                                                      |
| Subscription lifecycle                  | FEATURE-0009 is "Pagamentos e Assinaturas"; V1 frozen slice only covers initial checkout        | absent                                                                                                                                                                                   | GAP     | Freeze recurrence semantics separately; do not infer them from checkout.                                     |
| Financial audit/observability           | architecture requires audit/metrics; M134 covers provider-cost ops only, not product money      | M142 adds applied/replayed/recovered/stale/deferred/unmatched outcome disposition to non-PII webhook audit; durable central audit and operational metrics remain absent                  | PARTIAL | Add durable/central observability around ledger operations and reconciliation.                               |
| Sandbox/provider E2E                    | V1 has injected fetch tests; architecture requires payment sandbox                              | deterministic unit coverage plus a permanent local HTTP sandbox wire/idempotency contract; no live third-party sandbox credential or browser journey yet                                 | PARTIAL | Keep the local wire proof; require deployed provider sandbox plus browser E2E before equivalence.            |
| Rate limiting                           | V1 create/status optionally 12/minute                                                           | M139 enforces 12/min create and 60/min status with bounded in-memory buckets keyed by requester/IP                                                                                       | PARTIAL | Replace/compose with a distributed limiter before horizontally scaled production.                            |
| Auth/tenant context                     | platform Auth exists; V1 checkout is onboarding session oriented                                | authenticated requests require valid session, origin, CSRF, mutation role and business scope; guests require a short-lived signed full-handoff capability bound to destination/tenant    | PASS    | Business may issue the guest capability server-side; browsers never mint authority.                          |
| Rollback/migration strategy             | release process requires migration and rollback                                                 | M142 is expand-only: the result table references immutable provider evidence and Payment; disabling application/projection retains all rows for retry, forensics and reconciliation      | PARTIAL | Keep result/event rows on rollback; schema removal is forbidden while evidence may be referenced.            |

## M142 score

- `PASS`: 20
- `PARTIAL`: 7
- `GAP`: 6
- `N/A`: 1
- total: 34

M142 closes verified Payment state application and the authoritative result bridge to Business. Operational ledger posting, refund/reversal execution, reconciliation, settlement, subscriptions and browser execution remain below PASS.

## Promotion decision

After M142 and green Quality, Payments Persistence Integration, Sandbox Provider, Verified Webhook and Verified Outcome gates on the final head:

- `FEATURE-0009` and `MIG-0010` remain `migrating`;
- behavior/visual/API equivalence flags remain `false`;
- only cryptographically verified, durably claimed and matched evidence may change Payment;
- exact retries converge on one deterministic persisted result;
- Business receives approval only from that persisted result and never from browser return;
- no operational ledger posting or real money movement is enabled.

## Next milestone

M143 must make the existing balanced ledger operational around authoritative Payment outcomes:

1. post an idempotent double-entry transaction for an approved Payment;
2. define provider-neutral refund/reversal commands and verified completion;
3. post compensating entries instead of mutating historical ledger rows;
4. reconcile provider evidence, Payment, result and ledger with explicit mismatch states;
5. expose durable audit/metrics for unresolved mismatches;
6. prove crash/retry and concurrent delivery recovery in MySQL.

Split/repasse/settlement and subscriptions remain later milestones. Browser checkout/E2E follows the protected server lifecycle. Affiliates stays blocked.

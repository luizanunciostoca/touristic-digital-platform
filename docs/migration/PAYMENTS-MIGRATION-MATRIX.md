# Payments / Ordering / Financial — Migration Matrix (M135 baseline)

## Status semantics

- `PASS` — V2 already exposes the audited contract with executable evidence.
- `PARTIAL` — a reusable seam exists, but Payments-owned execution is incomplete.
- `GAP` — no V2 Payments/Financial equivalent exists yet.
- `N/A` — contract intentionally belongs to another feature and must only be consumed.

## Frozen sources

- V1: `luizidebook/morro-de-sao-paulo-digital@60746fd7fed97b805758b37adfdbe3bad2582bfe`;
- V1 server: `server/business-checkout.js`;
- V1 browser: `js/onboarding/runtime/business-checkout-client.js`;
- V1 tests: `server/__tests__/business-checkout.test.js`;
- V2 opening checkpoint: `luizidebook/touristic-digital-platform@9ae94f64f7f644a480ae4313d7f2fca32b53c613`;
- V2 Business handoff: `@touristic/business/onboarding-commercial-conversion`.

## Matrix

| Contract | Frozen V1 / architecture evidence | V2 state at M135 | Status | Migration decision |
| --- | --- | --- | --- | --- |
| Business commercial preparation | V1 commercial adapter prepares plan/contractor/terms | M61/M62 already provide immutable Business-owned handoff | N/A | Business remains owner; Payments consumes the handoff. |
| Payments ownership boundary | checkout client/server perform financial execution | Domain Map/Module Contracts declare Ordering/Financial ownership; Business explicitly excludes checkout execution | PASS | Keep provider/financial authority outside Business. |
| Server-authoritative plan pricing | `BUSINESS_PLANS_JSON`; browser supplies only `planId` | no Payments-owned V2 pricing source | GAP | Introduce typed pricing/catalog contract; never trust browser amount. |
| Checkout input normalization/validation | session, plan, contractor, sandbox draft, required terms | Business handoff already sanitizes equivalent commercial inputs, but Payments validation does not exist | PARTIAL | Revalidate at Payments boundary; do not trust upstream solely because Business validated. |
| Logical checkout/order identity | V1 `bco_<uuid>` | no Payments-owned V2 Order/Payment identity | GAP | Introduce typed immutable IDs and explicit ownership. |
| Client idempotency key | `business:<sessionId>:<planId>` | Business deliberately does not create payment idempotency in V2 | GAP | Payments browser/API boundary owns key derivation/acceptance policy. |
| Server idempotency | repository lookup before provider call | no durable Payments repository | GAP | Require durable unique constraint/atomic claim before external call. |
| Checkout session creation API | `POST /api/business-checkout/sessions` | no V2 Payments HTTP surface | GAP | Build versioned Payments API; consume Business handoff. |
| Provider port | V1 calls configured payment API URL/token | no provider-neutral V2 port | GAP | Define provider interface before adapter; provider SDK cannot enter domain. |
| Provider checkout creation | external reference, amount/currency, payer, return URL, webhook URL, metadata | absent | GAP | Implement only after pricing/idempotency/persistence primitives. |
| Public checkout token | cryptographic 24-byte random token, timing-safe comparison | absent | GAP | Preserve bounded public access with token hashing/rotation decision server-side. |
| Public payment status | limited projection under `/sessions/:id` | absent | GAP | Expose minimal projection; never leak contractor/provider secrets. |
| Browser checkout launch | popup `noopener,noreferrer`, location fallback | V2 Business does not execute checkout | GAP | Payments-owned browser adapter may reproduce behavior or safer equivalent. |
| Browser confirmation wait | poll every 2.5 s, max 240 attempts | absent | GAP | Preserve bounded wait/result semantics; transport may evolve. |
| Browser verified-payment event | `businessPaymentVerified` after server says `CONFIRMED` | Business M61/M62 already consumes a separately verified same-session signal | PARTIAL | Payments must become the producer of the verified result. |
| Browser failure event | `businessPaymentVerificationFailed` | Business has fail-closed consumer path; Payments producer absent | PARTIAL | Add typed failure result/event without financial ambiguity. |
| Webhook authenticity | HMAC-SHA256 over raw body + timing-safe compare | absent | GAP | Implement provider adapter verification with raw payload preservation. |
| Webhook unmatched handling | valid unknown event -> 202 matched false | absent | GAP | Preserve non-leaking acknowledgement semantics. |
| Webhook replay/idempotency | repeated `CONFIRMED` record does not reconvert | no durable event identity/dedup | GAP | Add durable provider-event dedup and out-of-order handling. |
| Payment state authority | paid/approved/confirmed -> `CONFIRMED`; non-paid does not promote | absent | GAP | Define explicit server-authoritative state machine. |
| Business conversion after payment | confirmed payment creates non-publishable conversion | Business verified-payment consumer exists; Payments result producer absent | PARTIAL | Payments emits verified result; Business owns later profile activation workflow. |
| Durable payment persistence | V1 reference implementation is memory-only | absent | GAP | Mandatory production hardening, not optional parity. |
| Order model | architecture CAP-0015 requires `OrderPlaced` | no V1 formal order model and no V2 Ordering package | GAP | Introduce Ordering identity/state before broad payment flows. |
| Financial ledger | architecture CAP-0016/0017 and Domain Map define Financial as money source of truth | absent | GAP | Implement immutable financial ledger/invariants independent of UI. |
| Refund/reversal | architecture requires refund events/financial correctness; V1 checkout slice has no formal flow | absent | GAP | New V2 hardening; must reverse financial effects deterministically. |
| Reconciliation | Release/Financial architecture requires reconciliation | absent | GAP | Provider state must reconcile against internal Payment/Ledger. |
| Split/repasse | CAP-0017 | absent | GAP | Implement only after ledger and reconciliation. |
| Subscription lifecycle | FEATURE-0009 is "Pagamentos e Assinaturas"; V1 frozen slice only covers initial checkout | absent | GAP | Freeze product recurrence semantics before implementation; do not infer them from checkout. |
| Financial audit/observability | architecture requires audit/metrics; M134 covers provider-cost ops only, not product money | absent for product Financial | GAP | Add correlation, immutable audit and financial metrics; never reuse M134 provider budget as ledger. |
| Sandbox/provider E2E | V1 has injected fetch tests; architecture requires payment sandbox | no Payments sandbox integration V2 | GAP | Require deterministic adapter tests plus provider sandbox before equivalence. |
| Rate limiting | V1 create/status optionally 12/minute | no Payments surface yet | GAP | Define per-route limits without dropping legitimate provider webhooks. |
| Auth/tenant context | platform Auth exists; V1 checkout is onboarding session oriented | reusable Auth primitives exist, Payments composition absent | PARTIAL | Apply platform Auth/tenant rules where private ownership exists; public token endpoints remain separately bounded. |
| Rollback/migration strategy | release process requires migration and rollback | no Payments persistence yet | GAP | Use expand/contract migrations and non-destructive rollback paths. |

## M135 score

- `PASS`: 1
- `PARTIAL`: 5
- `GAP`: 27
- `N/A`: 1
- total: 34

The score is intentionally conservative. M135 proves that Business already exposes the correct seam and that architecture ownership is defined; it does **not** claim a Payments implementation.

## Promotion decision

After M135:

- `FEATURE-0009` may move from `planned` to `baseline-pending`;
- `MIG-0010` may move from `discovered` to `snapshotted`;
- behavior/visual/API equivalence flags remain `false`;
- no payment provider, money movement or production billing is enabled by this milestone.

## Implementation order derived from dependencies

1. Payments/Ordering/Financial typed vocabulary and ports.
2. Durable order/payment/idempotency persistence.
3. Pricing authority and checkout application service.
4. Versioned HTTP boundary and security context.
5. Provider-neutral sandbox adapter.
6. Webhook authenticity, durable event dedup and state machine.
7. Verified result adapter back to Business.
8. Ledger and financial invariants.
9. Refund/reversal.
10. Reconciliation.
11. Split/repasse/settlement.
12. Subscription semantics when frozen.
13. Browser checkout lifecycle.
14. E2E, observability, migration/rollback and release gates.

Affiliates begins only after authoritative payment/ledger events exist.

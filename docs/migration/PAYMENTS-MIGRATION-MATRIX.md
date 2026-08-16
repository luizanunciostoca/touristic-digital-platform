# Payments / Ordering / Financial — Migration Matrix (post-M150/M151/M152 reconciliation)

## Status semantics

- `PASS` — V2 exposes the audited contract with executable evidence at the current layer.
- `PARTIAL` — a reusable V2 primitive/port exists, but production composition or durable end-to-end execution is incomplete.
- `GAP` — no V2 equivalent exists yet.
- `N/A` — contract intentionally belongs to another feature and must only be consumed.

## Frozen sources and authority

- V1: `luizidebook/morro-de-sao-paulo-digital@60746fd7fed97b805758b37adfdbe3bad2582bfe`;
- V1 server: `server/business-checkout.js`;
- V1 browser: `js/onboarding/runtime/business-checkout-client.js`;
- V1 tests: `server/__tests__/business-checkout.test.js`;
- V2 baseline checkpoint: `luizidebook/touristic-digital-platform@881b5a2a943f00325b90a9d0f75d7a291d9cbeae` (M135);
- Business handoff: `@touristic/business/onboarding-commercial-conversion`;
- Ordering owns Order/Subscription schedule and idempotent renewal intent;
- Financial owns Payment, provider execution, verified outcomes, ledger, reconciliation and settlement;
- browser/provider redirects and provider command acceptance are never financial confirmation.

## Reconciled main state

This matrix was stale at M149 after M150/M151 had already reached `main`. The canonical lineage revalidated for this reconciliation is:

- M150 Subscription recurrence contract — commit `91830cdbb485fbf4145e5655e81bffc13b459627`, ancestor of `main`;
- Financial M152 bounded provider retries — commit `8d07e4db0e3c619d520f1a3fc36dc4b14a6a65a2`, ancestor of `main`;
- M151 durable Subscription persistence — PR #258, merged as `e96fe6d5e025a2084437aa51a8691b65edfc9eec`.

M150 defines the provider-neutral Subscription lifecycle with `active`, `cancel_at_period_end`, `past_due` and `cancelled`; immutable paid-period identity; deterministic `<subscriptionId>:period:<n>` renewal keys; server-snapshot pricing; verified-outcome-only advancement; verified terminal failure to `past_due`; and no blind recharge.

M151 persists Subscription snapshots and renewal-intent claims in Ordering MySQL with optimistic compare-and-swap, exact replay convergence, unique Subscription/period and renewal Order identities, fail-closed semantic collision handling and no cross-domain Financial foreign key.

Financial M152 adds bounded transient retries around existing provider commands without changing financial authority. Those retries do not authorize an automatic second recurring charge after a verified terminal renewal failure.

The runtime still requires application composition for recurrence. Therefore the Subscription row is now `PARTIAL`, not `GAP` and not `PASS`.

## Matrix

| Contract | Frozen V1 / architecture evidence | Reconciled V2 state | Status | Migration decision |
| --- | --- | --- | --- | --- |
| Business commercial preparation | V1 commercial adapter prepares plan/contractor/terms | M61/M62 provide the immutable Business-owned handoff; Ordering/Payments consume it without moving financial ownership | N/A | Business remains commercial owner; checkout execution is outside Business. |
| Payments ownership boundary | checkout client/server perform financial execution | Ordering and Financial packages plus server composition keep provider/payment authority outside Business/browser | PASS | Preserve server-side financial authority. |
| Server-authoritative plan pricing | browser supplies plan identity, server owns price | versioned server catalog and immutable `OrderPricingSnapshot`; browser amounts cannot redefine money facts | PASS | Recurrence must inherit the contracted snapshot. |
| Checkout input normalization/validation | bounded checkout request | normalized Business handoff, bounded JSON, return-origin policy and audited requester authority | PASS | Transport cannot weaken application validation. |
| Logical checkout/order identity | V1 checkout identity | cryptographically random server Order/Payment IDs with validated durable persistence | PASS | Keep Business request identity separate from financial IDs. |
| Client idempotency key | `business:<sessionId>:<planId>` | exact derived key required before application execution | PASS | Browser cannot choose an unrelated idempotency key. |
| Server idempotency | repository lookup before provider call | durable Payment idempotency claim repairs interrupted creation without a second provider command | PASS | Recurrence must reuse deterministic per-period authority. |
| Checkout session creation API | V1 `/api/business-checkout/sessions` | `POST /api/payments/v1/checkouts` returns authoritative pending state and bounded status capability | PASS | Provider response is not confirmation. |
| Provider port | external payment API | provider-neutral Financial ports, no provider SDK in domain | PASS | Provider adapters stay server-only. |
| Provider checkout creation | server creates provider checkout | sandbox adapter uses authoritative Order/Payment and stable idempotency; M152 bounds transient retries | PASS | Command acceptance remains non-authoritative. |
| Public checkout token | cryptographic capability | HMAC-derived status capability persisted only as SHA-256 and verified timing-safely | PASS | Never persist/log plaintext. |
| Public payment status | bounded projection | capability-bound status exposes persisted verified approval/failure projections | PASS | Redirect/bare Payment status never creates verification. |
| Browser checkout launch | popup + fallback | Payments-owned client launches only server-projected URL with `noopener,noreferrer` and blocked-popup fallback | PASS | Browser receives no HMAC secret. |
| Browser confirmation wait | 2.5 s × 240 | M149 preserves 2500 ms × 240 and requires identity-matched persisted Financial evidence | PASS | Timeout is local waiting failure only. |
| Browser verified-payment event | Business signal after confirmed payment | emitted only from persisted identity-matched `verifiedPayment` | PASS | Never synthesize from provider return state. |
| Browser failure event | terminal failure signal | emitted only from persisted identity-matched `verifiedFailure` | PASS | Signal has no mutation authority. |
| Business → Payments authority composition | V1 public onboarding can begin checkout | server-only guest capability issuer/verifier exists, but public Business onboarding is not yet composed with a legitimate server bootstrap; authenticated path still requires real session/CSRF/scope | PARTIAL | Compose the existing issuer server-side; no fabricated CSRF, browser HMAC secret or Business financial authority. |
| Webhook authenticity | raw-body HMAC | bounded raw bytes, timestamp window and timing-safe verification | PASS | Verify before parsing/mutation. |
| Webhook unmatched handling | unknown verified event accepted safely | append-only verified unmatched evidence with bounded response | PASS | Reconciliation may inspect; do not fabricate Payment. |
| Webhook replay/idempotency | repeated event does not reconvert | immutable provider-event claim and deterministic result recovery | PASS | Divergent event-ID reuse fails closed. |
| Payment state authority | provider paid -> canonical confirmation | explicit transition table + CAS + persisted verified result | PASS | Only verified Financial evidence is authoritative. |
| Business conversion after payment | conversion only after payment | Business-compatible projection derives from persisted approved result and exact onboarding correlation | PASS | Business activation remains separate from financial mutation. |
| Durable payment persistence | V1 reference memory-only | MySQL Payment with immutable subject/amount/idempotency and optimistic concurrency | PASS | Preserve historical state. |
| Order model | CAP-0015 | durable Order, authoritative pricing snapshot and replay-safe `draft → pending_payment` lifecycle | PASS | Renewal Order must remain Ordering-owned. |
| Financial ledger | CAP-0016/0017 | deterministic balanced immutable approval/reversal/accounting transactions | PASS | Never rewrite historical postings. |
| Refund/reversal | financial correctness | durable full-refund command, stable provider idempotency, verified webhook completion and immutable reversal | PASS | Provider acceptance alone is not refund completion. |
| Reconciliation | release/financial architecture | read-only provider comparison with durable deterministic runs/findings and acknowledgement history | PASS | Remediation remains a separate verified command. |
| Split/repasse | CAP-0017 | durable allocation/payable/settlement with verified provider read-back and immutable balanced postings | PASS | Affiliates is separate and receives no implicit authority. |
| Subscription lifecycle | FEATURE-0009 includes subscriptions | M150 executable lifecycle + M151 durable MySQL Subscription/renewal-intent persistence; application executor/provider recurrence wiring not yet composed | PARTIAL | Close application/runtime composition before equivalence. |
| Financial audit/observability | platform requires audit/metrics | durable reconciliation findings and bounded audit exist; cross-module `PLATFORM-OBSERVATION` metrics/alerts for product-money/recurrence are not yet complete | PARTIAL | Observability must stay read-only and non-authoritative. |
| Sandbox/provider E2E | architecture requires payment sandbox | deterministic local HTTP sandbox/provider/browser contracts exist; deployed third-party sandbox browser journey is not yet evidenced | PARTIAL | Do not claim deployed E2E without real provider evidence. |
| Rate limiting | V1 bounded create/status | checkout/refund/reconciliation have bounded in-memory actor/IP buckets | PARTIAL | Distributed limiter is required only if production is actually multi-replica/horizontally scaled. |
| Auth/tenant context | platform Auth | authenticated checkout/refund/reconciliation boundaries bind real session/CSRF/tenant/admin scope; guest handoff verification is separate | PASS | Do not infer authority from browser state. |
| Rollback/migration strategy | release process | state/ledger writes are expand-only and replay-safe; historical Financial evidence survives disable/revert, but recurrence release/runbook activation remains incomplete | PARTIAL | Rollback disables composition and recovers from persisted state; never delete Financial history. |

## Reconciled score after M150/M151/M152

```text
PASS      27
PARTIAL    6
GAP        0
N/A        1
TOTAL     34
```

This score corrects the previous M149 documentary truth. M150/M151 eliminate the semantic/persistence `GAP`, but the Subscription row remains `PARTIAL` because production application composition has not yet been proven.

## Real remaining work

1. compose the existing server-only checkout-handoff capability issuer into public Business → Payments without browser secrets or fabricated CSRF;
2. add a recurrence application executor over M150/M151 durable state, exact claims and verified Financial outcomes;
3. issue recurring provider commands only through existing Financial provider authority and stable idempotency if the approved product contract requires it;
4. preserve `past_due`, no-blind-recharge and cancel-at-period-end semantics;
5. emit recurrence/payment operational observations through the canonical platform observability contract without mutation authority;
6. obtain deployed provider-sandbox/browser E2E evidence before production-equivalence claims;
7. add/compose a distributed limiter only if the production topology is horizontally scaled;
8. document activation/rollback so rollback never deletes or rewrites Financial history.

## Promotion decision

`FEATURE-0009` and `MIG-0010` remain `migrating`; behavior/visual/API equivalence flags remain `false` at this reconciliation checkpoint. Zero `GAP` rows is not sufficient for equivalence while the six approved `PARTIAL` contracts above remain unresolved or unproven.

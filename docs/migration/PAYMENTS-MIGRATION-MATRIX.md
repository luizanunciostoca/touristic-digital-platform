# Payments / Ordering / Financial — Migration Matrix

## Status semantics

- `PASS` — V2 exposes the audited contract with executable evidence at the current layer.
- `PARTIAL` — a reusable V2 primitive/port exists, but production composition or durable end-to-end execution/evidence is incomplete.
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

## Reconciled implementation lineage

- M150 Subscription recurrence contract — commit `91830cdbb485fbf4145e5655e81bffc13b459627`;
- M151 durable Subscription persistence — PR #258, merge `e96fe6d5e025a2084437aa51a8691b65edfc9eec`;
- M152 bounded provider retries — commit `8d07e4db0e3c619d520f1a3fc36dc4b14a6a65a2`;
- M153 approved provider-neutral runtime/application composition;
- M156/current main contains the later persistence/observability/runtime work already reflected by canonical tests.

## Release-candidate reconciliation — 2026-08-22

The former statement that Render/provider execution was externally blocked by missing provider configuration is superseded.

Evidence immediately preceding this documentation-only reconciliation:

- code candidate main SHA: `e1808dc921947c8f042f86ab11afe1f0e9974bd2`;
- PR #12 candidate tree: Quality and permanent domain/browser contracts green; the merge-ref tree and `e1808dc...` main tree have zero file differences;
- canonical MySQL matrix: Financial `99/99`, Ordering `41/41`, CRM `164/164`, Ticketing `31/31`, Affiliates `4/4`, total `339/339` PASS;
- Render V2 staging deploy `dep-da4mqnbtqb8s738bel70`: LIVE on `e1808dc...`;
- Render runtime: Node `22.23.2`, build `22/22` PASS;
- `MORRO-STAGING-MYSQL-ENV`: PASS;
- `PAYMENTS-PREDEPLOY`: PASS with `provider=mercado_pago`, `providerIdentity=direct-official-api`, Ordering `M151+ticketing-reservation`, Financial `M145`;
- `checkout.runtime`: success / ready;
- Mercado Pago is configured in `test` mode, but the real provider acceptance chain is not yet complete.

Therefore provider state is **CONFIGURED**, not `BLOCKED_EXTERNAL` and not `PROVIDER_VERIFIED`.

## Matrix

| Contract | Reconciled V2 state | Status | Migration decision |
| --- | --- | --- | --- |
| Business commercial preparation | Business-owned immutable handoff consumed by Ordering/Payments | N/A | Business remains commercial owner |
| Payments ownership boundary | Ordering/Financial keep provider/payment authority outside Business/browser | PASS | preserve server-side authority |
| Server-authoritative plan pricing | versioned server catalog + immutable `OrderPricingSnapshot` | PASS | browser cannot redefine money facts |
| Checkout input normalization/validation | bounded Business handoff, JSON, origin and requester validation | PASS | transport cannot weaken validation |
| Logical checkout/order identity | server-generated Order/Payment identities with durable persistence | PASS | keep Business request identity separate |
| Client idempotency key | deterministic Business/session/plan derivation | PASS | browser cannot choose unrelated identity |
| Server idempotency | durable claim/recovery without second provider command | PASS | preserve exact replay |
| Checkout session creation API | `POST /api/payments/v1/checkouts` returns pending authoritative state + bounded status capability | PASS | provider response is not confirmation |
| Provider port | provider-neutral Financial boundary | PASS | provider adapters server-only |
| Provider checkout creation | stable idempotency + bounded transient retries | PASS | command acceptance non-authoritative |
| Public checkout token | HMAC-derived capability, only digest persisted | PASS | plaintext never persisted/logged |
| Public payment status | capability-bound projection from persisted verified evidence | PASS | redirect/bare status never verifies payment |
| Browser checkout launch | Payments client launches only server-projected URL with safe popup/fallback | PASS | browser gets no HMAC secret |
| Browser confirmation wait | V1-equivalent bounded polling and identity-matched persisted evidence | PASS | timeout is local waiting failure |
| Browser verified-payment event | emitted only from persisted identity-matched verified payment | PASS | never synthesize from redirect |
| Browser failure event | emitted only from persisted identity-matched verified failure | PASS | no mutation authority |
| Business → Payments authority composition | server-issued same-origin bootstrap capability; checkout remains Payments-owned | PASS | preserve capability boundary |
| Webhook authenticity | bounded raw body, timestamp window and timing-safe signature verification | PASS | verify before parse/mutation |
| Webhook unmatched handling | append-only verified unmatched evidence | PASS | never fabricate Payment |
| Webhook replay/idempotency | immutable provider-event claim + deterministic replay | PASS | divergent event-ID reuse fails closed |
| Payment state authority | explicit transitions + CAS + persisted verified result | PASS | verified Financial evidence only |
| Business conversion after payment | derives from persisted approved result + exact correlation | PASS | activation separate from financial mutation |
| Durable payment persistence | MySQL Payment with immutable money/subject/idempotency facts | PASS | preserve history |
| Order model | durable Order, authoritative pricing snapshot and replay-safe lifecycle | PASS | renewal Order remains Ordering-owned |
| Financial ledger | deterministic balanced immutable postings | PASS | never rewrite historical postings |
| Refund/reversal | durable refund command, stable provider idempotency, verified completion and immutable reversal | PASS | provider acceptance alone is not completion |
| Reconciliation | provider comparison + durable deterministic runs/findings | PASS | remediation remains separate verified command |
| Split/repasse/settlement | durable allocation/payable/settlement with verified readback | PASS | Affiliates receives no implicit authority |
| Subscription lifecycle | durable provider-neutral lifecycle, deterministic claims/replay, verified-outcome-only advancement | PASS | do not invent provider recurring-charge/scheduler policy |
| Financial audit/observability | durable audit/reconciliation + platform runtime/payment audit primitives; full staged operational evidence is still incomplete | PARTIAL | keep observation read-only/non-authoritative |
| Sandbox/provider E2E | local/CI provider/browser contracts pass and staging provider config is ready; real Mercado Pago TEST transaction/webhook/refund chain is not yet evidenced | PARTIAL | require provider IDs, signed webhook, readback, reconciliation, replay and refund evidence |
| Rate limiting | bounded in-memory actor/IP buckets | PARTIAL | distributed limiter only if actual production topology is horizontally scaled |
| Auth/tenant context | session/CSRF/tenant/admin scopes bound to server authority | PASS | never infer authority from browser state |
| Rollback/migration strategy | expand-first schema, disable-first rollback, durable recovery and history preservation | PASS | no destructive financial rollback |

## Current implementation score

```text
PASS      30
PARTIAL    3
GAP        0
N/A        1
TOTAL     34
```

This score is implementation-candidate truth, not provider/release equivalence.

## Real remaining work

1. complete the real Mercado Pago TEST flow: checkout → TEST buyer payment → signed webhook → authoritative payment readback → Ordering/Financial reconciliation → persistence → replay/idempotency → TEST refund → authoritative refund readback → final reconciliation;
2. capture staging operational observations for checkout/webhook/reconciliation/retry/provider latency/error paths;
3. prove the real production topology later and compose a distributed limiter only if horizontally scaled.

Automatic recurring provider charging and timer/scheduler activation are intentionally not counted as missing implementation because no separately approved recurring-payment-instrument/provider scheduler authority exists in the source of truth.

## Promotion decision

`FEATURE-0009` and `MIG-0010` remain `migrating`; behavior/visual/API equivalence flags remain `false`. Zero GAP rows, green CI and CONFIGURED provider state are insufficient for equivalence until the remaining PARTIAL contracts and real provider acceptance are resolved.

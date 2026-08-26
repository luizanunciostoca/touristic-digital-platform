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
- PR #25 — Mercado Pago Bricks/Subscriptions, provider acceptance hardening and exact-head release closure;
- certified PR head `22b6c127ad8d276cb249b403d7813500312ef452`;
- resulting protected-merge main `1aed2827d7ec322e92e38162dec944ec7740254c`.

## Final equivalence reconciliation — 2026-08-26

The 2026-08-22 release-candidate state is superseded by the complete provider and post-merge evidence captured on 2026-08-26.

Certified evidence:

- PR #25 exact head `22b6c127ad8d276cb249b403d7813500312ef452` — 37/37 pull-request workflows PASS;
- independent review by `luizidebook` before merge;
- fresh Ready-for-Review Quality Gate PASS on the same exact head, including formatting, architecture, Feature Registry, env reconciliation, CI governance, supply-chain, lint, typecheck, tests, build and canonical MySQL matrix;
- protected merge with expected head produced `main@1aed2827d7ec322e92e38162dec944ec7740254c`;
- controlled Mercado Pago TEST acceptance PASS: seller/application identity, Subscription authoritative readback/cancel, verified webhook, refund/replay and reconciliation with zero findings;
- no real card and no real money used;
- exact-main Render V2 staging deploy `dep-da7mp12jnfac7395nbng` LIVE;
- `MORRO-STAGING-MYSQL-ENV`: PASS;
- `PAYMENTS-PREDEPLOY`: PASS;
- checkout/card/subscription runtimes: ready;
- acceptance authentication disabled and temporary acceptance credential removed after the controlled window;
- Final Release Acceptance run `33020687735`: PASS after a full same-SHA re-run; deterministic matrix 22/22 PASS, exact-SHA staging smoke PASS and main-stability re-proof PASS.

The first Final Release attempt observed one isolated `Business Onboarding Commercial Browser Contract` failure. The failed child was re-run on the same SHA with no code change and passed; the complete parent acceptance was then re-run on the same SHA and passed. No corrective product commit was required.

Provider state is therefore **PROVIDER_VERIFIED** for the controlled TEST acceptance scope. `equivalent` remains distinct from `released`; production promotion is not authorized by this matrix.

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
| Reconciliation | provider comparison + durable deterministic runs/findings; controlled TEST acceptance ended with zero findings | PASS | remediation remains separate verified command |
| Split/repasse/settlement | durable allocation/payable/settlement with verified readback | PASS | Affiliates receives no implicit authority |
| Subscription lifecycle | durable provider-neutral lifecycle, deterministic claims/replay, verified-outcome-only advancement; TEST provider cancel confirmed by authoritative readback | PASS | do not invent provider recurring-charge/scheduler policy |
| Financial audit/observability | durable audit/reconciliation plus staged provider lifecycle, webhook/refund/accounting/reconciliation observations and exact-main runtime evidence | PASS | observation remains read-only/non-authoritative |
| Sandbox/provider E2E | controlled Mercado Pago TEST acceptance covers authoritative provider identity/readback, verified webhook, Subscription cancel, refund/replay and zero-finding reconciliation | PASS | provider authority requires verified readback |
| Rate limiting | bounded actor/IP application buckets satisfy the frozen V1/application contract | PASS | distributed limiter is a release-topology hardening gate only if future production is horizontally scaled |
| Auth/tenant context | session/CSRF/tenant/admin scopes bound to server authority | PASS | never infer authority from browser state |
| Rollback/migration strategy | expand-first schema, disable-first rollback, durable recovery and history preservation | PASS | no destructive financial rollback |

## Final implementation score

```text
PASS      33
PARTIAL    0
GAP        0
N/A        1
TOTAL     34
```

The sole N/A is the Business-owned commercial preparation contract. There are no remaining Payments-owned equivalence gaps or partial contracts.

## Equivalence interpretation

The frozen V1 browser lifecycle is represented by executable browser launch, confirmation and Business → Payments composition contracts. Provider verification, payment state, ledger, refunds, reconciliation and Subscription lifecycle remain server-authoritative.

The former rate-limit PARTIAL was a release-topology concern, not a missing V1-equivalence contract. The V1 baseline requires explicit surface limits; V2 has bounded actor/IP buckets. A distributed limiter becomes mandatory only if an actual production deployment is horizontally scaled. That future release condition does not block the `equivalent` state.

Automatic recurring provider charging and timer/scheduler activation are intentionally not counted as missing implementation because no separately approved recurring-payment-instrument/provider scheduler authority exists in the source of truth.

## Promotion decision

`FEATURE-0009` and `MIG-0010` are **equivalent**, not `released`.

- behavior equivalence: PASS;
- applicable visual/browser interaction equivalence: PASS;
- API equivalence: PASS;
- provider TEST acceptance: PROVIDER_VERIFIED;
- rollback evidence: PASS;
- exact-main staging acceptance: PASS;
- Final Release Acceptance: PASS.

Release Promotion Gate and production traffic remain outside this equivalence decision and require a separate explicit production/promotion authorization. See `docs/qa/PAYMENTS-FEATURE-0009-EQUIVALENCE-EVIDENCE.md`.

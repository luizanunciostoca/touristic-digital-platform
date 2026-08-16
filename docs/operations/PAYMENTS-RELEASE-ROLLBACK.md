# Payments / Subscription — Release and Rollback Strategy

## Scope

This runbook governs release and rollback for `FEATURE-0009` across the approved chain:

Business handoff → Ordering → Payments → Financial → Subscription / Recurrence.

It does not move financial authority into Business or the browser, does not define a provider-specific recurring-charge contract and does not authorize destructive Financial rollback.

## Non-negotiable authority rules

1. Business may produce the immutable commercial handoff and consume a verified result. It does not create Payment/ledger/provider truth.
2. The browser may request a short-lived server-issued checkout-handoff capability and launch/poll a provider checkout. It never receives `PAYMENTS_HANDOFF_SECRET`, never fabricates CSRF and never confirms payment.
3. Ordering owns Order, Subscription schedule, renewal intent and cancellation-at-period-end state.
4. Financial owns Payment, provider execution, verified outcomes, ledger, refund, reconciliation and settlement.
5. Provider command acceptance, provider redirect/return and browser events are not financial confirmation.
6. Subscription advancement requires an identity-matched persisted Financial `VerifiedPaymentResult`.
7. A verified terminal renewal failure moves the Subscription to `past_due`; it does not authorize blind recharge.

## Release sequence — expand, validate, activate

### 1. Expand durable schema first

Apply Ordering schema through M151 before activating any recurrence execution. The migration is additive:

- `ordering_subscriptions`;
- `ordering_subscription_renewal_intents`;
- existing Order and checkout-access state remain intact.

Financial historical Payment, verified outcomes, ledger, refund, reconciliation, payable and settlement state must not be deleted or rewritten as part of a release.

### 2. Validate permanent contracts on the exact candidate head

Required gates for any production promotion:

- Quality Gate;
- Payments Persistence Integration;
- Payments Sandbox Provider Contract;
- Payments Verified Outcome Contract;
- Payments Verified Webhook Contract;
- Payments Refund Command Contract;
- Payments Reconciliation Contract;
- Payments Settlement Contract;
- Payments Browser Checkout Contract;
- Payments Operational Ledger Contract;
- Payments Subscription Recurrence Contract;
- Ordering MySQL integration.

A green historical run on a different SHA is supporting evidence, not promotion authority for the current head.

### 3. Activate Business → Payments composition independently

The browser composition may be enabled only when the server authority bootstrap is configured with:

- a server-only HMAC secret of the required strength;
- an explicit destination;
- an explicit same-origin/return-origin allow-list;
- durable Ordering/Financial persistence;
- the provider configuration required by the existing checkout contract.

Rollback of this composition stops new checkout starts. It must not remove existing Orders, Payments, access records, verified results or provider webhook processing needed to settle already-created state.

### 4. Activate recurrence execution only when its remaining dependencies exist

M150/M151/M153 provide provider-neutral Subscription state, durable renewal claims and verified-outcome application semantics. They do **not** authorize inventing a payment-instrument/token contract or a provider-specific recurring-charge API.

Automatic provider recurrence remains disabled until an approved Financial recurring-provider contract exists and has its own sandbox/idempotency/verified-outcome evidence. Likewise, timer/scheduler activation must reuse a canonical platform primitive if one exists at deployment time; it must not introduce a competing scheduler solely for this feature.

## Rollback

Rollback is an application activation decision, not a data-erasure operation.

### Business → Payments browser/bootstrap rollback

- stop issuing new guest checkout capabilities or disable the browser composition;
- keep checkout status reads for already-issued bounded capabilities when safe;
- keep webhook verification and Financial reconciliation available for in-flight provider operations;
- do not delete `ordering_orders`, `ordering_checkout_access`, Payment or verified-result rows.

### Subscription recurrence rollback

- stop invoking the recurrence executor/provider command path;
- leave `ordering_subscriptions` and `ordering_subscription_renewal_intents` intact;
- a claimed renewal intent remains the durable idempotency authority for that Subscription/period;
- resume by loading the existing claim and persisted Financial state, never by allocating a second semantic renewal;
- a `past_due` Subscription remains blocked from automatic new renewal until an explicitly approved recovery command exists;
- `cancel_at_period_end` remains authoritative and must not be reverted to `active` by rollback.

### Financial rollback

Never roll back by deleting or rewriting:

- Payment history;
- provider event claims;
- verified outcome evidence;
- ledger postings;
- refund history;
- reconciliation runs/findings;
- allocations/payables/settlements.

If a runtime release is reverted, the previous runtime must read the durable state conservatively or the affected write path must remain disabled until compatibility is restored.

## Recovery after interruption

Recovery is state-driven:

1. load the Subscription and deterministic `<subscriptionId>:period:<n>` renewal key;
2. load the durable renewal intent if it exists;
3. reuse its renewal Order identity;
4. inspect the existing Financial Payment/idempotency state rather than issuing another semantic charge;
5. if a terminal Financial result exists, apply it once and converge on the same Subscription state;
6. if no authoritative terminal result exists, keep the renewal pending and rely on approved provider status/webhook/reconciliation paths;
7. never infer success from provider command acceptance or browser redirect.

## Distributed rate limiting

The current repository has an application rate-limit port and an in-memory adapter. A distributed adapter is required before claiming multi-replica production safety **only when the real deployment topology is horizontally scaled**. Topology must be proven from deployment/infrastructure evidence; the application must not invent Redis or another shared limiter merely to satisfy a checklist.

## Promotion rule

`FEATURE-0009` remains `migrating` until all approved behavior/API/visual evidence and operational dependencies are complete. In particular, M151 persistence or zero matrix `GAP` rows alone do not authorize `equivalent`.

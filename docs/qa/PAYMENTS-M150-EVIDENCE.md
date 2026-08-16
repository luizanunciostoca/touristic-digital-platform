# PAYMENTS M150 — Subscription Recurrence Contract Evidence

## Objective

M150 closes the semantic absence around the `Pagamentos e Assinaturas` feature without pretending that recurring provider execution or durable subscription persistence already exists. The V1 frozen checkout covered only an initial one-shot checkout, so recurrence is defined as a new V2 contract instead of being inferred from browser behavior or provider defaults.

## Ownership boundary

- Business remains owner of commercial plan selection and onboarding preparation.
- Ordering owns the subscription agreement, paid-period identity, deterministic renewal intent and cancellation schedule.
- Payments/Financial own Payment identity, provider execution and verified terminal payment evidence.
- A browser, provider return URL or provider command acceptance never activates or renews a Subscription.
- Financial does not invent the commercial subscription schedule; Ordering consumes only persisted verified Financial outcomes.

## Executable contract

`@touristic/ordering/subscription` adds an additive provider-neutral domain contract with:

- bounded `sub_*` subscription identity;
- explicit states `active`, `cancel_at_period_end`, `past_due` and `cancelled`;
- immutable paid periods linked to exact Order, Payment and verified Financial result identities;
- activation only from an Order already in `payment_confirmed` plus an identity-matched `VerifiedPaymentResult(kind=approved, paymentStatus=confirmed)`;
- current pricing captured from the immutable server-side `OrderPricingSnapshot`;
- deterministic per-period renewal key `<subscriptionId>:period:<n>`;
- renewal preparation only at/after the current paid-period boundary;
- renewal pricing copied from the previously contracted server snapshot rather than accepted from browser/provider input;
- positive period advancement only after an identity-matched verified Financial approval for the renewal Order;
- verified terminal renewal failure stored as `past_due` evidence without automatically fabricating a second charge attempt;
- exact positive/failure replay convergence at the pure domain layer;
- period-end cancellation that blocks renewal and never implies a refund or ledger rewrite;
- repository ports for durable Subscription and unique renewal-intent claims in the next persistence milestone.

## Retry and duplicate-charge boundary

M150 intentionally does not create a second provider charge after a verified terminal renewal failure. Transport recovery for the same payment remains the responsibility of the existing Payment/provider idempotency contracts. A later retry capability must be based on persisted terminal evidence and a separately versioned attempt contract; it may not blindly create another Payment from browser state.

The renewal request key is deterministic per Subscription period. A durable adapter must claim that key atomically before creating the corresponding renewal Order/Payment. Until that adapter exists, subscription lifecycle is a reusable V2 primitive but not a production recurring-billing executor.

## Permanent tests

`packages/ordering/src/subscription.test.ts` proves:

1. activation requires a confirmed Order and matching persisted verified Financial approval;
2. failed or cross-order results fail closed;
3. renewal cannot be prepared early;
4. renewal identity is deterministic per period and pricing is inherited from the server-authoritative snapshot;
5. only matching verified approval advances the paid period;
6. exact replay converges without a second period transition;
7. matching verified terminal failure becomes `past_due` and blocks blind re-charge;
8. period-end cancellation blocks renewal and cannot finalize before the paid boundary.

Repository-wide formatting, architecture, Feature Registry, lint, typecheck, tests and build remain mandatory on the final PR head before coordinator promotion.

## Migration result

M150 changes the subscription row conceptually from `GAP` to `PARTIAL`: an executable canonical domain contract now exists, while durable subscription/renewal persistence, scheduler/application composition, renewal Order persistence, provider sandbox recurrence, retry policy and production observability remain future increments.

`FEATURE-0009` / `MIG-0010` therefore remain `migrating`; behavior/visual/API equivalence flags remain false. M150 must not be used to claim production recurring billing.

## Rollback

M150 is additive and introduces no migration, provider write, browser credential or ledger mutation. Removing the new subscription subpath leaves M136–M149 Orders, Payments, verified outcomes, refund, reconciliation, settlement and browser checkout contracts unchanged. No rollback may delete existing financial evidence.

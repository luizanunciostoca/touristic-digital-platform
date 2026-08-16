# PAYMENTS M151 — Durable Subscription Persistence Reconciled Evidence

## Revalidation point

This evidence reconciles the canonical Wave 8 documentation after M151 reached `main`.

Revalidated source-of-truth lineage:

- M150 Subscription recurrence contract: `91830cdbb485fbf4145e5655e81bffc13b459627`;
- Financial M152 bounded provider retries: `8d07e4db0e3c619d520f1a3fc36dc4b14a6a65a2`;
- M151 durable Subscription persistence: PR #258, merged as `e96fe6d5e025a2084437aa51a8691b65edfc9eec`.

M150 and M152 are ancestors of the M151 merge commit. M151 therefore does not sit on a parallel/stale line.

## Durable state delivered by M151

M151 adds Ordering-owned persistence for the already-defined M150 Subscription model:

- `ordering_subscriptions` persists the canonical Subscription snapshot;
- `ordering_subscription_renewal_intents` persists deterministic renewal claims;
- optimistic compare-and-swap prevents stale Subscription state from overwriting a newer transition;
- exact Subscription replay converges;
- exact renewal-intent replay converges as an already-claimed intent;
- semantic reuse of the same deterministic request key for a different renewal Order fails closed;
- `(subscription_id, period_number)` is unique;
- renewal `order_id` is unique;
- current/renewal Orders remain Ordering-owned;
- Financial-owned Payment/result identities remain opaque references rather than cross-domain database foreign keys.

## Authority and failure semantics retained

M151 does not change the M150 authority model:

- a Subscription period advances only from an identity-matched persisted `VerifiedPaymentResult` approved/confirmed by Financial;
- verified terminal renewal failure becomes `past_due` evidence;
- terminal failure does not authorize blind recharge;
- `cancel_at_period_end` blocks a new renewal and does not imply refund/ledger rewriting;
- provider command acceptance is not financial confirmation;
- Business/browser cannot mutate Subscription or Financial truth.

Financial M152 may retry bounded transient transport failures for provider commands already authorized by the application. It does not convert a verified terminal renewal failure into a new charge attempt.

## Permanent validation inherited from PR #258

The final M151 head `f513c13ca07a8389249c49400adbaba82816fb29` was reconciled directly onto the then-current `main` and recorded green evidence for:

- Quality Gate #2167;
- Payments Persistence Integration #216, including Ordering MySQL Subscription replay, renewal claim replay/conflict and concurrent state-transition coverage;
- Payments Sandbox Provider Contract #186;
- Payments Verified Outcome Contract #156;
- Payments Refund Command Contract #138;
- Payments Reconciliation Contract #115.

The M151 merge commit is now the revalidated `main` SHA for this documentary checkpoint.

## Migration correction

The previous M149 matrix said Subscription lifecycle was `GAP`. That statement is no longer true.

Post-M151/M152 canonical score before any later recurrence composition work:

```text
PASS      27
PARTIAL    6
GAP        0
N/A        1
TOTAL     34
```

Subscription becomes `PARTIAL`, not `PASS`: semantic and durable persistence layers exist, but recurrence application/runtime execution has not yet been composed and deployed provider/browser recurrence has not been proven.

`FEATURE-0009` / `MIG-0010` remain `migrating`; behavior/visual/API equivalence remain false at this checkpoint.

## Remaining approved closure scope

- legitimate server-authoritative Business → Payments guest-capability bootstrap;
- recurrence application executor over M150/M151 state and claims;
- server-only recurring provider execution only if required by the approved contract;
- verified-outcome-only advancement and `past_due` failure handling;
- canonical Financial/recurrence observability;
- deployed provider/browser sandbox proof;
- distributed rate limiting only if real production topology requires it;
- release/rollback activation that never deletes Financial history.

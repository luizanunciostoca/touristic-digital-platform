# PAYMENTS M142 — Verified Payment Outcomes Evidence

## Scope

M142 turns M141's cryptographically verified, append-only provider receipt into an authoritative Payment outcome. It remains sandbox-only and does not post an operational ledger entry, execute a refund, reconcile a provider, settle funds, create a subscription, launch browser checkout or move real money.

## Authority chain

A provider payload reaches state application only through this ordered boundary:

1. the fixed sandbox webhook receives the exact bounded raw bytes;
2. HMAC-SHA256 and signed timestamp are verified before parsing;
3. the normalized provider event is durably claimed;
4. only the immutable receipt's matched Payment reference may enter the outcome service;
5. provider status maps through the explicit Payment transition table;
6. optimistic Payment persistence succeeds before a verified result is exposed;
7. Business projection reads only the persisted verified result.

A browser return URL, checkout-provider create response or caller-supplied amount cannot create an approved result.

## State machine

The verified mapping is:

| Provider status | Target Payment | Result |
| --- | --- | --- |
| `paid` | `confirmed` | `approved` |
| `failed` | `failed` | `failed` |
| `cancelled` | `cancelled` | `cancelled` |
| `expired` | `expired` | `expired` |
| `refunded` | `refunded` | `refunded` |

Allowed transitions remain `pending → confirmed|failed|cancelled|expired` and `confirmed → refunded`. Same-state delivery is idempotent. Older terminal evidence is `stale`; an invalid order or conflicting provider reference is `deferred`. Neither disposition mutates Payment or fabricates a result.

## Durable result and crash recovery

`financial_payment_results` is additive and Financial-owned. It references both the immutable provider event and Payment, uses one unique provider event, and permits only one result for a Payment/status pair.

The result ID is deterministic from Payment ID and terminal status. If Payment commits but result persistence is interrupted, an exact signed retry re-enters the already claimed receipt, observes the same Payment state and reconstructs the same result. Concurrent compatible deliveries converge on the existing row; divergent event content remains blocked by the M141 claim collision defense.

## Business-safe projection

The capability-protected checkout status endpoint looks up the terminal result. It exposes:

- `verifiedPayment` only for persisted `approved/confirmed`, using the existing Business `verified + sessionId + reference` contract;
- `verifiedFailure` separately for persisted failed/cancelled/expired/refunded results;
- `READY_TO_CONVERT` only with approved evidence;
- no contractor PII, raw payload, signature, provider secret or status capability.

Payment confirmation still does not publish a Business. The existing Business consumer validates the exact onboarding session and produces a non-publishable activation boundary.

## Executable evidence

Unit contracts cover:

- provider-status mapping and allowed transitions;
- stale and out-of-order preservation;
- provider-reference conflict deferral;
- forged kind/status rejection;
- first application, exact replay and interrupted-write recovery;
- unmatched evidence without state fabrication;
- webhook-to-outcome composition for new and replayed claims;
- approved Business projection and pending/failure separation.

MySQL integration covers the additive schema, durable Payment mutation and exactly one authoritative result. The permanent Payments Verified Outcome Contract runs domain/server tests, Ordering projection tests, the existing Business consumer suite, MySQL integration and composed runtime builds.

Final promotion requires green Quality Gate, Payments Persistence Integration, Payments Sandbox Provider Contract, Payments Verified Webhook Contract and Payments Verified Outcome Contract on one final head.

## Migration result

```text
PASS     20
PARTIAL   7
GAP       6
N/A       1
TOTAL    34
```

`FEATURE-0009` and `MIG-0010` remain `migrating`; behavior, visual and API equivalence remain false.

## Rollback and limits

Rollback disables outcome application and the verified projection but retains `financial_provider_events`, `financial_payments` and `financial_payment_results` for deterministic retry, forensics and reconciliation. Historical evidence must not be deleted or rewritten.

M142 does not make the pre-existing balanced ledger operational. Refund/reversal execution, reconciliation, split/repasse, settlement, subscription lifecycle, distributed rate limiting, deployed third-party sandbox and browser E2E remain open.

## Next milestone

M143 makes ledger posting operational for approved outcomes, adds provider-neutral refund/reversal and implements durable reconciliation with explicit mismatch evidence.

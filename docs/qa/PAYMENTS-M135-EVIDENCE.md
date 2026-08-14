# PAYMENTS M135 — V1 Baseline Evidence

## Scope

M135 is a documentation-only baseline milestone for `FEATURE-0009 — Pagamentos e Assinaturas` and `MIG-0010`.

No provider call, financial persistence, payment route, ledger entry, webhook listener or browser checkout implementation is added by this milestone.

## Frozen sources

V1:

`luizidebook/morro-de-sao-paulo-digital@60746fd7fed97b805758b37adfdbe3bad2582bfe`

Audited files:

- `server/business-checkout.js`;
- `server/__tests__/business-checkout.test.js`;
- `js/onboarding/runtime/business-checkout-client.js`.

V2 base:

`luizidebook/touristic-digital-platform@9ae94f64f7f644a480ae4313d7f2fca32b53c613`

Existing Business seam:

- `docs/qa/BUSINESS-M61-EVIDENCE.md`;
- `@touristic/business/onboarding-commercial-conversion`;
- M62 commercial browser lifecycle.

## V1 evidence frozen by M135

The baseline preserves these observable contracts:

1. browser creates logical idempotency key from Business session + plan;
2. server requires idempotency before checkout creation;
3. server reuses existing checkout before calling provider;
4. browser-supplied amount is not authoritative;
5. official plan/amount/currency are resolved server-side;
6. checkout input requires contractor, sandbox-only draft and legal acceptances;
7. provider receives internal external-reference plus return/webhook metadata;
8. provider credentials remain server-side;
9. checkout starts `PENDING` and exposes only bounded public status under a random token;
10. public token comparison is timing-safe;
11. webhook authenticity uses HMAC-SHA256 over raw payload;
12. invalid webhook signature is rejected;
13. valid unmatched webhook is acknowledged without leaking internal state;
14. only paid/approved/confirmed promote payment to `CONFIRMED`;
15. repeated confirmation does not recreate conversion;
16. confirmed payment creates a non-publishable conversion pending profile completion;
17. browser opens checkout with popup/location fallback;
18. browser confirmation wait is bounded to 240 × 2.5 s;
19. browser emits verified result only after server-authoritative confirmation;
20. failed/cancelled/expired/timeout produce a failure result instead of synthetic confirmation.

## Architecture decisions

M135 does not copy the V1 monolith. It maps responsibilities to the V2 domain model:

```text
Business
  → immutable commercial handoff
Ordering
  → order/intent identity and commercial totals
Payments/Financial
  → provider execution + payment authority + money state
Ledger
  → financial source of truth
Business
  ← verified payment result only
Affiliate (future)
  ← authoritative financial/order events
```

Provider-specific SDKs/adapters remain outside domain rules.

## Known V1 limitations intentionally not promoted as desirable parity

- memory-only checkout repository;
- memory-only idempotency;
- no durable webhook event deduplication;
- no formal order aggregate;
- no ledger;
- no refund/reversal lifecycle;
- no reconciliation;
- no split/repasse/settlement;
- no subscription renewal model in the frozen checkout slice;
- no distributed rate limiting;
- no explicit financial migration/rollback plan.

These are V2 gaps/new hardening, not behaviors to preserve.

## Canonical documents introduced

- `docs/migration/PAYMENTS-V1-BASELINE.md`;
- `docs/migration/PAYMENTS-MIGRATION-MATRIX.md`.

## M135 score

```text
PASS     1
PARTIAL  5
GAP     27
N/A      1
TOTAL   34
```

The score is deliberately conservative: V2 has the Business seam and platform primitives, not a Payments runtime.

## Registry/tracker decision

M135 is sufficient to move:

```text
FEATURE-0009: planned → baseline-pending
MIG-0010: discovered → snapshotted
```

Equivalence booleans remain false.

## Next milestone gate

The first implementation milestone after M135 should create only framework-independent Payments/Ordering/Financial vocabulary and ports. It must not add a real provider SDK or public payment execution before:

- identities/states are frozen;
- pricing authority is defined;
- idempotency ownership is defined;
- persistence port contracts exist;
- webhook event identity is explicit;
- financial events consumed by future Affiliates are versioned.

Before promotion of M135 itself, run the repository Quality Gate on the final PR head:

```text
pnpm install --frozen-lockfile
pnpm format:check
pnpm architecture:check
pnpm features:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

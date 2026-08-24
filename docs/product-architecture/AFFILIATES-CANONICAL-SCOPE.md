# Affiliates Canonical Scope — FEATURE-0010

## Status and final checkpoint

`FEATURE-0010 — Programa de Afiliados` and `MIG-0011` have completed the executable migration acceptance defined by `AFFILIATE-POLICY-V1`.

Final integrated runtime checkpoint before this documentation reconciliation:

```text
main = a2a1f10420c1d452e9426c75549864c76d57f22c
certified PR head = 851740d2429c41d18f81f0e476fc2fb67a6a0c3b
certified tree = f1ef9038de983a69737c94a2d218eec57e179efb
main tree = f1ef9038de983a69737c94a2d218eec57e179efb
```

The certified PR head and merged `main` have the same Git tree. On that exact tree:

- Quality Gate #242: PASS, including format, architecture, registry, governance, supply-chain, lint, typecheck, tests, build and canonical MySQL matrix;
- Affiliates FEATURE-0010 Contract #102: PASS, including runtime, real MySQL persistence and authority/policy contract;
- Render Staging Blueprint Contract #66: PASS;
- no real Mercado Pago call, real money or production execution was used for Affiliate acceptance.

The final documentation PR may promote FEATURE-0010/MIG-0011 to `equivalent` only while these ownership and evidence invariants remain intact.

## Sources reconciled

- `docs/features/registry.json`;
- `docs/migration/MASTER-MIGRATION-TRACKER.md`;
- `docs/migration/AFFILIATES-MIGRATION-MATRIX.md`;
- `docs/product-architecture/AFFILIATES-DECISION-SHEET.md`;
- `docs/product-architecture/DOMAIN-MAP.md`;
- `docs/product-architecture/MODULE-CONTRACTS.md`;
- `docs/product-architecture/AFFILIATES-TECHNICAL-CONTRACT.md`;
- `docs/product-architecture/AFFILIATES-THREAT-MODEL.md`;
- `docs/qa/AFFILIATES-FEATURE-0010-TEST-PLAN.md`;
- `docs/operations/AFFILIATES-ROLLOUT-ROLLBACK.md`;
- executable `packages/affiliates` and `services/affiliates` runtime/tests.

## Canonical ownership

### Affiliate

Affiliate owns only non-monetary program/commercial semantics and evidence:

- global Affiliate identity/program membership state tied to canonical Identity;
- eligibility and suspension;
- referral evidence intake, validation and minimized/pseudonymous storage;
- attribution association, precedence, 30-day window and Order lock;
- conversion association to canonical Ordering/Financial evidence;
- commercial commission-entitlement evidence under an approved versioned policy;
- Affiliate audit, idempotency and outbox metadata;
- durable request/readback state for the versioned Affiliate → Financial materialization boundary.

Affiliate is not a seller/tenant subsystem and does not inherit Business authority.

### Ordering

Ordering is the canonical source for Order identity and Order state. Affiliate consumes only public/versioned evidence. It cannot mutate Ordering and cannot infer a qualifying conversion from click, redirect, browser state or analytics.

### Financial

Financial remains the only monetary source of truth and owns:

- Payment and verified payment outcomes;
- eligible platform revenue;
- ledger and allocation;
- payable/wallet/financial position;
- settlement;
- provider transfer/payout;
- reconciliation;
- FX;
- monetary refunds/reversals.

Affiliate may request materialization of an eligible earned entitlement only through the versioned Financial boundary. Financial independently authorizes and validates authoritative evidence before monetary mutation.

Affiliate never creates Payment, ledger entries, allocation, payable, wallet, settlement, payout, provider instruction or direct Financial database writes.

No Affiliate-owned payout, wallet or payment runtime is ever authorized.

### Business

Business does not administer Affiliates and cannot grant, calculate or materialize Affiliate commission authority. Tenant membership alone grants no Affiliate capability.

## Approved runtime policy

`AFFILIATE-POLICY-V1` is the sole approved policy and is executable in `packages/affiliates`/`services/affiliates`:

- verified identity/contact, current terms, approved membership and no suspension/fraud for new attribution;
- Financial eligibility additionally gates new materialization;
- suspension blocks new attribution/materialization but preserves history and conversion evidence; affected new entitlement is frozen/disputed;
- accepted evidence sources: platform link/deep-link, platform QR, explicit checkout code and authenticated/versioned server referral;
- server-owned pseudonymous `AcquisitionSubjectId`;
- precedence: checkout code > authenticated S2S > validated link/QR, latest valid evidence within a tier;
- direct/organic traffic does not erase valid Affiliate intent;
- 30-calendar-day server-clock attribution window;
- attribution lock at canonical Order `pending_payment`;
- conversion requires Ordering `payment_confirmed` and verified Financial eligible-revenue evidence;
- renewals are noncommissionable in V1;
- 3000 bps over Financial-authoritative eligible platform revenue, integer minor units, final half-up rounding, no Affiliate FX;
- lifecycle `pending`, `earned`, `cancelled`, `reversed`, `disputed`;
- maturity at least seven calendar days after verified payment and not before canonical service/performance date when present;
- refund/cancellation/chargeback consequences preserve immutable revisions and Financial monetary authority;
- raw referral retention max 90 days, pseudonymous attribution/conversion 24 months, commercial/audit/reconciliation evidence five years after final closure/settlement, with legal hold/jurisdiction controls.

## Executable runtime

Current `main` contains:

```text
packages/affiliates                         PRESENT
services/affiliates                         PRESENT
Affiliate MySQL schemas/repositories         PRESENT
Identity/membership application service      PRESENT
Eligibility/suspension enforcement           PRESENT
Referral/attribution application service     PRESENT
Conversion/commission application service    PRESENT
Privacy/LGPD service                         PRESENT
Authenticated HTTP transport                 PRESENT
Idempotency/audit/outbox                     PRESENT
Financial materialization adapter/readback   PRESENT
Browser monetary-authority guards             PRESENT
```

Runtime is server-authoritative. Browser/admin surfaces remain intentionally non-authoritative and are not required to establish Affiliate equivalence.

## Acceptance evidence

The integrated suite proves, among other cases:

- Identity persistence, membership lifecycle, authorization and tenant/destination isolation;
- suspension blocks new attribution while exact historical replay remains valid;
- divergent replay fails closed;
- server-owned identifiers, SHA-256 evidence fingerprinting, precedence, 30-day window and Order lock;
- per-subject serialization and concurrent attribution safety;
- one canonical conversion per Order and canonical Ordering/Financial evidence checks;
- 3000-bps half-up formula and immutable policy snapshot;
- maturity, dispute, partial/full refund and post-earned reversal consequences;
- `maturity × refund` and `partial refund × full refund` serialization;
- materialization exact replay, uncertain-delivery readback, retry and conflicting Financial outcome rejection;
- DSR, retention, anonymization/pseudonymization and legal hold;
- durable audit/outbox and restart-safe persistence.

## Affiliate → Financial boundary

The request binds identity/evidence only:

- request ID;
- entitlement ID and immutable revision;
- Affiliate ID;
- conversion-association ID;
- policy version;
- entitlement digest;
- correlation ID.

It does not carry browser-controlled rate, amount, payout destination, ledger posting, payable state, settlement state or provider credential.

Financial returns durable accepted/rejected/replayed readback. `accepted` means request acceptance only; it never means payout, transfer or settlement completion.

## Idempotency, audit and privacy

Every authoritative Affiliate mutation is server-side, explicitly authorized, durable-idempotent and audited. Exact replay converges on the original persisted outcome; semantic divergence fails closed.

Audit/observability exclude secrets, raw referral tokens/URLs and copied identity documents. Identity remains owner of canonical PII; Affiliate retains only required references/evidence under the approved retention windows and legal-hold rules.

## Rollout and rollback

The runtime is additive and rollback-safe:

1. disable new Affiliate → Financial materialization;
2. disable entitlement mutation if integrity is at risk;
3. disable conversion/attribution writers if required;
4. preserve readback, reconciliation, audit and historical evidence;
5. roll application code back without destructive Affiliate/Financial data deletion.

No rollback transfers monetary authority from Financial to Affiliate.

## Completion condition

FEATURE-0010 is eligible for `equivalent` when the reconciliation PR itself passes the permanent repository Quality Gate and Affiliates Contract on one exact head, while:

- all required migration-matrix rows are PASS/N/A;
- `AFFILIATE-POLICY-V1` remains unchanged;
- Financial remains the sole monetary authority;
- Ordering remains the sole Order authority;
- browser/admin input cannot create monetary authority;
- no required temporary workflow or diagnostic artifact exists in the final diff.

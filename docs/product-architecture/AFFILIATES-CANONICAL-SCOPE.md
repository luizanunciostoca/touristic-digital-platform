# Affiliates Canonical Scope — FEATURE-0010

## Status and checkpoint

`FEATURE-0010 — Programa de Afiliados` remains `planned` and `MIG-0011` remains `discovered`.

Revalidated source-of-truth checkpoint:

```text
main = ec4f51e0198cdeed51b37fabe5ed94ebb2e3ecb6
PR #264 base = ec4f51e0198cdeed51b37fabe5ed94ebb2e3ecb6
```

The PR is policy-neutral. It deliberately contains no Affiliate runtime, persistence, API, UI, commission calculation or money movement.

## Sources reconciled

- `docs/features/registry.json`;
- `docs/migration/MASTER-MIGRATION-TRACKER.md`;
- `docs/migration/AFFILIATES-MIGRATION-MATRIX.md`;
- `docs/product-architecture/DOMAIN-MAP.md`;
- `docs/product-architecture/MODULE-CONTRACTS.md`;
- `docs/product-architecture/CAPABILITY-MATRIX.md`;
- `docs/product-architecture/PRODUCT-ROADMAP.md`;
- `docs/product-architecture/FEATURE-LIFECYCLE.md`;
- `packages/ordering/src/index.ts`;
- `packages/financial/src/settlement.ts`;
- `services/financial/src/settlement-application-service.ts`;
- existing Payments M146/M150/M151/M152/M153 evidence in `main`.

## Canonical ownership

### Affiliate

Affiliate owns only non-monetary program/commercial semantics:

- platform affiliate identity/program state under approved policy;
- referral evidence intake and validation;
- attribution association;
- conversion association to canonical commerce evidence;
- commercial commission entitlement evidence under an approved versioned policy;
- Affiliate-owned audit/idempotency metadata.

Affiliate is not a seller/tenant subsystem and does not inherit Business authority.

### Ordering

Ordering is the canonical source for order identity and order state. Affiliate consumes public versioned records/events only. It cannot mutate Ordering and cannot infer a conversion from click/redirect/browser state.

### Financial

Financial remains the only monetary source of truth and owns:

- Payment and verified payment outcomes;
- ledger;
- allocation and amount conservation;
- payable;
- wallet/financial position;
- settlement;
- provider transfer/payout;
- reconciliation;
- monetary reversals.

Affiliate may request materialization of an approved entitlement only through a versioned Financial-owned port. Financial independently authorizes, resolves and validates the authoritative evidence before any monetary mutation.

Affiliate never creates Payment, ledger entries, allocation, payable, wallet, settlement, payout or direct Financial database writes.

### Business

Business does not administer Affiliates and cannot grant or calculate Affiliate commission authority.

## Policy-neutral technical foundation completed

This PR defines without commercial assumptions:

- conceptual schema boundaries for Affiliate identity, referral evidence, attribution, conversion association and commission entitlement;
- read-only Ordering/Financial evidence ports;
- Affiliate → Financial materialization request/result boundary without browser-controlled amount/rate/payout instructions;
- required canonical event family and ownership;
- durable idempotency strategy and replay/divergence semantics;
- immutable audit contract;
- authorization/trust boundaries;
- privacy/LGPD engineering requirements with configurable retention;
- threat model;
- unit/integration/security/privacy/concurrency/E2E test plan;
- phased migration plan;
- staged rollout, kill switches and rollback preserving Financial history.

Detailed contracts:

- `docs/product-architecture/AFFILIATES-TECHNICAL-CONTRACT.md`;
- `docs/product-architecture/AFFILIATES-THREAT-MODEL.md`;
- `docs/qa/AFFILIATES-FEATURE-0010-TEST-PLAN.md`;
- `docs/operations/AFFILIATES-ROLLOUT-ROLLBACK.md`.

## Runtime deliberately not implemented

The following remain blocked until all Decision Sheet items are approved:

- `packages/affiliates`;
- `services/affiliates`;
- Affiliate database migrations;
- executable Affiliate event schemas/producers/consumers;
- attribution/commission application services;
- commission amount calculation;
- Financial materialization implementation;
- Affiliate/admin APIs;
- browser/portal/admin UI.

No Affiliate-owned payout, wallet or payment runtime is ever authorized.

## Canonical event direction

Required future Affiliate-owned event family:

- `AffiliateReferralEvidenceRecorded`;
- `AffiliateAttributionEstablished`;
- `AffiliateConversionAssociated`;
- `AffiliateCommissionEntitlementChanged`;
- `AffiliateFinancialMaterializationRequested`.

Required Financial-owned handoff responses:

- `AffiliateFinancialMaterializationAccepted`;
- `AffiliateFinancialMaterializationRejected`.

These names reserve domain ownership only. No producer may emit them until payload schemas are approved, registered and tested with `PLATFORM-EVENT-ENVELOPE`.

Historical `CustomerAttributedToAffiliate` and `AffiliateCommissionAccrued` labels remain non-executable architecture concepts and must not be revived as implicit contracts.

## Affiliate → Financial boundary

The policy-neutral request binds:

- request ID;
- entitlement ID and immutable revision;
- affiliate ID;
- conversion-association ID;
- policy version;
- entitlement digest;
- correlation ID.

It deliberately does not carry browser-controlled rate, amount, payout destination, ledger posting, payable state or settlement state.

Financial returns a durable accepted/rejected/replayed result. `accepted` means request acceptance only; it never means payout, transfer or settlement completion.

The exact materialization timing and decision-gated entitlement fields remain product decisions.

## Idempotency and audit

Every authoritative Affiliate mutation must:

- claim a durable deterministic idempotency key before mutation;
- converge on exact replay;
- fail closed on divergent replay;
- use server-normalized immutable IDs/digests plus relevant policy/contract versions;
- append immutable audit with actor, authorization, policy, before/after digest, idempotency, correlation/causation, outcome and reason;
- exclude secrets, raw referral tokens/URLs and copied identity documents from audit/observability.

## Authorization and privacy

- browser/public input is untrusted evidence only;
- authoritative mutations are server-side;
- Business tenant roles do not inherit Affiliate authority;
- Affiliate self-service reads require canonical Identity ownership once that identity model is approved;
- admin actions require explicit platform authorization and audit;
- Financial handoff is authenticated service-to-service and Financial reauthorizes/revalidates it;
- raw referral/identity data is minimized and separated;
- retention is policy-configured, not hard-coded;
- data-subject and legal/audit-hold behavior must preserve mandatory Financial/compliance history.

## Decision gate

Exactly the remaining product decisions are captured in `docs/product-architecture/AFFILIATES-DECISION-SHEET.md`. No additional commercial rule is introduced by this PR.

Implementation cannot start until all 19 items are approved and versioned.

## Migration and rollout

After approval, implementation follows expand-only domain foundation → evidence/association → entitlement → disabled Financial handoff → controlled materialization → authenticated reads → browser/admin surfaces. UI is last.

Rollback disables Financial handoff first, preserves reconciliation/readback and immutable history, then disables Affiliate writers. No destructive down migration or Financial-history deletion is part of normal rollback.

## Completion condition

FEATURE-0010 can only become equivalent/release-ready when:

- the Decision Sheet is fully approved/versioned;
- all required matrix rows are PASS/N/A with justified evidence;
- server-side attribution/conversion/entitlement are durable, authorized, audited and idempotent;
- qualifying conversion comes only from approved canonical Ordering/Financial evidence;
- Financial exclusively owns all monetary mutation/payout authority;
- security/LGPD/threat-model tests pass;
- rollout/rollback/observability are verified;
- permanent Quality/integration/security gates pass on one exact release-candidate head.